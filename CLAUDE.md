# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Chronation" is a donathon timer for streamers. A streamer logs in with DonationAlerts OAuth, creates timers, and embeds a timer page in OBS. Incoming donations add time to the timer based on the timer's rate. The UI text is in Russian; log messages are in English.

## Commands

```sh
npm run dev         # Remix + Vite dev server
npm run build       # production build -> build/server, build/client
npm start           # node server.js (serves ./build)
npm run lint        # eslint
npm run typecheck   # tsc (noEmit)
npx drizzle-kit generate --name <name>   # create a migration in ./drizzle after editing db/schema.server.ts
npx drizzle-kit migrate                  # apply migrations to local.db
```

There is no test suite.

`vite.config.ts` excludes `*.db` files (and SQLite journal files) from the dev watcher. The app writes `local.db` on almost every request, and Remix sends an HMR event for any watched file change, which clears the dev page CSS.

Runtime requirements: a Redis server on the default localhost port (`createClient()` has no config), a SQLite file `local.db` in the CWD, and the env vars in `.env.example`: `COOKIES_SALT`, `DA_CLIENT_ID`/`DA_CLIENT_SECRET`/`DA_REDIRECT`, `AES_KEY` (the first 32 bytes are used for AES-256-CBC; changing it breaks every issued OBS link), and `DONATION_LINK`. The app does not load `.env` itself; in production systemd passes it in.

## Deployment

- `deploy/setup.sh` sets up the app on an Ubuntu/Debian VPS that may already host other sites. Run it as root with `DOMAIN` and `REPO_URL`, plus optional `LETSENCRYPT_EMAIL`.
  - **Leaves the server alone:** it never creates system users (the app runs as `APP_USER`, defaulting to the sudo user), never changes other nginx sites, never reconfigures a Redis that was already there, and never upgrades an existing Node.js. It refuses to continue if the app port is taken or another nginx site already serves `DOMAIN`, and it rolls its own site back if `nginx -t` fails.
  - **What it does:** installs whatever is missing, clones into `/opt/chronation`, generates `.env`, and installs `deploy/chronation.service` and `deploy/nginx.conf` from templates (`__DOMAIN__`, `__APP_USER__`, …). Then it optionally runs certbot for `DOMAIN` only, and runs the first deploy.
- `deploy.sh` updates the server: pull, `npm ci`, build, `drizzle-kit migrate`, and restart the systemd service. It reads the app user and directory from the installed unit, and switches units that still start `remix-serve` over to `server.js`. Its body is wrapped in `main` so a `git pull` that rewrites the script is safe, but that also means a changed `deploy.sh` only takes effect on the next run.
- The service runs `server.js` on `127.0.0.1:$PORT` behind nginx. It is remix-serve's setup (Express, compression, static files, morgan) plus a `getLoadContext` that provides `context.disconnectSignal`.

## Architecture

Remix v2 (Vite plugin, single fetch enabled) with Mantine v8 UI, Drizzle ORM over libsql/SQLite, and Redis. Path aliases: `~/*` → `app/*` and `database/*` → `db/*`. The `redis/` directory is imported by bare name (`redis/client.server`, `redis/types`), which resolves through `baseUrl: "."`.

The app assumes a **single server process**: timer ticks, DonationAlerts connections and stream fan-out all live in memory. Long-lived resources (sockets, intervals, registries) are wrapped in `singleton()` (`app/singleton.server.ts`) so Vite dev reloads don't duplicate them.

### Two storage layers
- **SQLite (`db/schema.server.ts`)** holds persistent config:
  - `users`: DA OAuth tokens, `timers_limit`, `is_admin`
  - `timers`: name, dayjs `format`, custom `css`, `donations_enabled`, `limit_mode`/`limit_time`, and `time`/`price`, which define the rate: `time` ms are added per `price` RUB
  - `user_logs`: an action log with optional `timer_id` and `source`
- **Redis (`app/services/timer.server.ts`)** holds live timer state. Each timer is a hash keyed by its cuid2 id with `remaining` (ms), `elapsed` (ms counted down while running) and `status`. There are also sets named `Running`/`Paused`/`Expired` that index ids by state.
  - Changes publish to `upd:<id>` (the new remaining value), `sts:<id>` (the new status), or `del:<id>` (the timer was deleted).
  - `tick`, `add` and `set` are Lua scripts, so each read-modify-write is atomic. `tick` also drops stale ids from `Running`.
  - A timer row created in SQLite must also be initialized in Redis with `timerService.new`, and deleted there with `timerService.delete`.
  - Adding time to an expired timer only raises `remaining`; the status stays `Expired`.

### Limits
`limit_mode` applies to every positive `add` (panel and donations) and to `set`; subtracting is never limited. The limit arguments are passed into the Lua scripts from the timer row.
- `remaining`: `remaining` can't exceed `limit_time`; the excess is dropped.
- `total`: `elapsed + remaining` can't exceed `limit_time`. The dashboard can reset `elapsed`.

Changing the limit does not clamp time that is already on the timer.

### Background jobs (`app/services/background.server.ts`)
`entry.server.tsx` starts these once Redis connects:
- a 1s tick that counts running timers down by whole milliseconds and logs timers that expire
- currency rates refreshed from the CBR XML feed (`currency.server.ts`), retried every 5 min on failure
- a daily cleanup of `user_logs` older than 30 days

### Live update flow
1. The OBS page `/timer?key&iv` (and the dashboard preview) renders `TimerPreview`, which opens an `EventSource` to `/api/timer/:id`.
2. The stream (`api.timer.$id`):
   - ends on `context.disconnectSignal`, not `request.signal`: Remix passes loaders copies of the request that follow the original's signal through WeakRefs, so after GC `request.signal` may never abort and the stream (and its DonationAlerts viewer) would leak. Vite dev has no load context and falls back to `request.signal`
   - subscribes through `timerEvents` (`timer-events.server.ts`), where a single shared Redis pattern subscriber fans `upd:*`/`sts:*`/`del:*` out in memory
   - sends `init` (the full hash); it sends `init` again whenever that subscriber reconnects
   - relays `upd`/`sts`, pushes DonationAlerts status as `da`, and sends `ping` every 15s
   - on `del:<id>`, sends `deleted` and closes
   - sets `Cache-Control: no-transform`, because the compression middleware would otherwise gzip and buffer the stream, and `X-Accel-Buffering: no` for nginx
3. The client interpolates between updates with `requestAnimationFrame` (`useFrameUpdate`) and injects the timer's custom CSS. If the server returns an error it reconnects with backoff; after `deleted` it stops.

### DonationAlerts (`app/services/donation.server.ts`)
`daEventSystem` keeps one connection per user:
- **Lifetime:** every open timer stream calls `acquire`/`release`. The connection opens with the first stream and closes 30s after the last one.
- **Status:** each connection keeps a `DaStatusSnapshot` (`app/da-status.ts`, client-safe), shown in the dashboard header, the timer page and the admin panel. Status changes are logged once per change.
- **Failure handling:**
  - Before connecting, `getAccessTokenForUser` is called; a failed refresh shows as `auth_error` instead of a silent hang.
  - Subscriptions have a timeout. Failures retry with exponential backoff.
  - A watchdog forces a reconnect after 60s unhealthy. Logging in again, or the admin "Reconnect" button, calls `reconnect`.
- **Donations:** each is deduplicated by id in Redis (`donation:<id>`), converted to RUB, and added to **all** of the user's timers that have `donations_enabled`, within each timer's limit.
- **Library internals used:** `EventsListener._subscription` (to wait for the subscription) and `UserEventsClient._centrifuge` (to stop a socket that is still connecting).

### Auth and access
- The cookie session stores only `userId`; the cookie is signed, not encrypted. `utils.checkAuth(request)` loads a whitelisted set of user columns from the DB, and `utils.checkAdmin` also requires `is_admin`. Never return token columns from a loader.
- Dashboard actions must scope timers by `user_id` from the session, never by an id from the form.
- **Public routes:** `/timer`, `/panel` and `/api/panel` are opened from OBS without a login. The encrypted `key` + `iv` in the URL is their only credential and grants full control of the timer. That is intended, so don't add session checks to them.
  - The dashboard timer page generates these URLs using `utils.publicOrigin`, which honours `X-Forwarded-Proto`, since the Express server does not.
  - `/api/panel` takes `state`, `set`/`delta`, and `type` (`amount` converts RUB to time using the rate; otherwise the value is milliseconds).
- **Login:** `/auth/login` → DonationAlerts OAuth2 (`remix-auth-oauth2`) → `/auth/callback` upserts the user and stores its id in the session. Logout does not remove the user from `daAuthProvider`, because OBS timers may still be live.

### Conventions
- Routes use folder-per-route (`app/routes/<name>/route.tsx`) with co-located `route.module.css`.
- Server-only modules use the `.server.ts` suffix. Services are exported as plain object literals (`timerService`, `actionsLogService`, …).
- Log user-visible events with `actionsLogService.log(text, userId, { timerId, source })` where the change happens, not in stream handlers, since there can be many streams per timer. Logs appear, paginated, on `/dashboard/logs` and `/admin/users/:id`.
