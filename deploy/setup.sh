#!/usr/bin/env bash
# Sets up Chronation on an Ubuntu/Debian server that may already host other
# sites: installs whatever is missing (Node.js, Redis, nginx), adds a systemd
# service and an nginx site for DOMAIN, then runs the first deploy.
# Other nginx sites, an existing Redis or Node.js, and system users are left
# alone; the app runs as an existing user.
#
# Usage, as root (e.g. via sudo, which makes you the app user):
#   DOMAIN=timer.example.com REPO_URL=https://github.com/you/don-timer.git \
#   LETSENCRYPT_EMAIL=you@example.com ./setup.sh
#
# Optional: APP_USER (defaults to the user who ran sudo), DA_CLIENT_ID,
# DA_CLIENT_SECRET, DONATION_LINK (or fill in $APP_DIR/.env afterwards),
# APP_DIR, APP_PORT, BRANCH. Without LETSENCRYPT_EMAIL the site is plain HTTP.
# The repo is cloned as APP_USER, so a private repo needs that user's git
# credentials or a token in REPO_URL.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN}"
: "${REPO_URL:?Set REPO_URL}"
APP_USER="${APP_USER:-${SUDO_USER:-}}"
APP_DIR="${APP_DIR:-/opt/chronation}"
APP_PORT="${APP_PORT:-3000}"
BRANCH="${BRANCH:-master}"
SERVICE=chronation
NODE_MAJOR=22

fail() {
  echo "Error: $*" >&2
  exit 1
}

step() {
  echo
  echo "==> $*"
}

port_in_use() {
  ss -Hltn "sport = :$1" | grep -q .
}

step "Checks"
[[ $EUID -eq 0 ]] || fail "run as root"
[[ -n "$APP_USER" ]] || fail "set APP_USER to the existing user the app should run as"
id -u "$APP_USER" >/dev/null 2>&1 || fail "user $APP_USER does not exist (this script does not create users)"
APP_GROUP="$(id -gn "$APP_USER")"

if port_in_use "$APP_PORT" && ! systemctl is-active --quiet "$SERVICE"; then
  fail "port $APP_PORT is already in use; set APP_PORT to a free port"
fi

if command -v node >/dev/null; then
  (($(node -p 'process.versions.node.split(".")[0]') >= 20)) ||
    fail "Node.js $(node -v) is installed but 20+ is required; upgrading it could break other apps, so upgrade it yourself"
fi

if command -v nginx >/dev/null; then
  nginx -t 2>/dev/null || fail "the current nginx config is already invalid (see nginx -t); fix it first"
  conflicts="$(grep -RlE "server_name[^;]*[[:space:]]${DOMAIN//./\\.}([[:space:];]|$)" \
    /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -v "/$SERVICE" || true)"
  [[ -z "$conflicts" ]] || fail "another nginx site already serves $DOMAIN: $conflicts"
fi

step "System packages"
packages=(ca-certificates curl git openssl sudo)
command -v nginx >/dev/null || packages+=(nginx)
if command -v redis-server >/dev/null || port_in_use 6379; then
  redis_preinstalled=true
else
  redis_preinstalled=false
  packages+=(redis-server)
fi
apt-get update
apt-get install -y "${packages[@]}"

if ! command -v node >/dev/null; then
  step "Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if [[ $redis_preinstalled == false ]]; then
  step "Redis"
  # Live timer state exists only in Redis; persist every write so restarts keep it.
  sed -i 's/^appendonly no$/appendonly yes/' /etc/redis/redis.conf
  systemctl enable redis-server
  systemctl restart redis-server
fi

step "App code"
if [[ ! -d "$APP_DIR/.git" ]]; then
  if [[ -e "$APP_DIR" && -n "$(ls -A "$APP_DIR")" ]]; then
    fail "$APP_DIR exists and is not empty"
  fi
  install -d -o "$APP_USER" -g "$APP_GROUP" "$APP_DIR"
  sudo -u "$APP_USER" -H git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

step "Environment file"
scheme=http
if [[ -n "${LETSENCRYPT_EMAIL:-}" ]]; then
  scheme=https
fi
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 600 -o "$APP_USER" -g "$APP_GROUP" /dev/null "$ENV_FILE"
  # AES_KEY encrypts the OBS links: changing it later breaks every issued link.
  cat >"$ENV_FILE" <<EOF
COOKIES_SALT=$(openssl rand -hex 32)
AES_KEY=$(openssl rand -hex 16)
DA_CLIENT_ID=${DA_CLIENT_ID:-}
DA_CLIENT_SECRET=${DA_CLIENT_SECRET:-}
DA_REDIRECT=$scheme://$DOMAIN/auth/callback
DONATION_LINK=${DONATION_LINK:-}
EOF
else
  # Keep the secrets, but DA_REDIRECT follows DOMAIN in case it changed.
  echo "Keeping existing $ENV_FILE, setting DA_REDIRECT for $DOMAIN"
  sed -i "s|^DA_REDIRECT=.*|DA_REDIRECT=$scheme://$DOMAIN/auth/callback|" "$ENV_FILE"
fi

step "systemd service"
sed -e "s|__APP_USER__|$APP_USER|g" \
  -e "s|__APP_GROUP__|$APP_GROUP|g" \
  -e "s|__APP_DIR__|$APP_DIR|g" \
  -e "s|__APP_PORT__|$APP_PORT|g" \
  "$APP_DIR/deploy/$SERVICE.service" >"/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable "$SERVICE"

step "nginx site"
if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  site_file="/etc/nginx/sites-available/$SERVICE"
  site_link="/etc/nginx/sites-enabled/$SERVICE"
else
  site_file="/etc/nginx/conf.d/$SERVICE.conf"
  site_link=""
fi

if [[ -f "$site_file" ]] && grep -q "managed by Certbot" "$site_file"; then
  echo "Keeping $site_file: certbot has already added HTTPS to it"
else
  backup=""
  if [[ -f "$site_file" ]]; then
    backup="$(mktemp)"
    cp "$site_file" "$backup"
  fi
  sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_PORT__|$APP_PORT|g" \
    "$APP_DIR/deploy/nginx.conf" >"$site_file"
  if [[ -n "$site_link" ]]; then
    ln -sfn "$site_file" "$site_link"
  fi
  if ! nginx -t; then
    if [[ -n "$backup" ]]; then
      cp "$backup" "$site_file"
    else
      rm -f "$site_file"
      if [[ -n "$site_link" ]]; then
        rm -f "$site_link"
      fi
    fi
    fail "nginx rejected the $SERVICE site; it was rolled back and other sites were not touched"
  fi
fi
systemctl reload nginx || systemctl start nginx

if [[ -n "${LETSENCRYPT_EMAIL:-}" ]]; then
  step "HTTPS certificate"
  command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx
  # Only edits the server block for DOMAIN.
  certbot --nginx --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" \
    -d "$DOMAIN" --redirect
fi

step "Build and start"
APP_USER="$APP_USER" APP_DIR="$APP_DIR" "$APP_DIR/deploy.sh"

if [[ $redis_preinstalled == true ]]; then
  echo
  echo "Redis was already installed, so its config was left as is. The app uses"
  echo "database 0 on localhost:6379 (keys like Running, Paused, Expired); make sure"
  echo "no other app uses the same keys, and consider enabling appendonly persistence."
fi

if ! grep -q '^DA_CLIENT_ID=.' "$ENV_FILE" || ! grep -q '^DA_CLIENT_SECRET=.' "$ENV_FILE"; then
  echo
  echo "Fill in DA_CLIENT_ID and DA_CLIENT_SECRET in $ENV_FILE, then run: systemctl restart $SERVICE"
fi
