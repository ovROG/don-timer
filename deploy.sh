#!/usr/bin/env bash
# Updates the app on a server set up with deploy/setup.sh.
# Usage, as root: /opt/chronation/deploy.sh
set -euo pipefail

SERVICE=chronation

# Everything runs inside main, so a git pull that rewrites this file can't
# change the commands while bash is still reading them.
main() {
  if [[ $EUID -ne 0 ]]; then
    echo "Run as root" >&2
    exit 1
  fi

  # The installed unit knows which user and directory the app uses.
  local app_user="${APP_USER:-$(systemctl show -p User --value "$SERVICE")}"
  local app_dir="${APP_DIR:-$(systemctl show -p WorkingDirectory --value "$SERVICE")}"
  app_user="${app_user:-root}"

  if [[ -z "$app_dir" || ! -d "$app_dir/.git" ]]; then
    echo "The $SERVICE service is not installed; run deploy/setup.sh first" >&2
    exit 1
  fi

  as_app() {
    (cd "$app_dir" && sudo -u "$app_user" -H "$@")
  }

  echo "==> Pull"
  as_app git pull --ff-only
  echo "==> Install"
  as_app npm ci --no-audit --no-fund
  echo "==> Build"
  as_app npm run build
  echo "==> Migrate"
  as_app npx drizzle-kit migrate
  # Units installed before server.js existed start remix-serve, which never
  # tells timer streams that their client left.
  local unit
  unit="$(systemctl show -p FragmentPath --value "$SERVICE")"
  if grep -q "remix-serve" "$unit"; then
    echo "==> Switch $SERVICE to server.js"
    sed -i 's|^ExecStart=.*remix-serve.*|ExecStart=/usr/bin/env node server.js|' "$unit"
    systemctl daemon-reload
  fi
  echo "==> Restart"
  systemctl restart "$SERVICE"
  systemctl is-active "$SERVICE"
}

main "$@"
