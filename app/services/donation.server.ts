import { RefreshingAuthProvider } from "@donation-alerts/auth";
import { ApiClient } from "@donation-alerts/api";
import {
  DonationAlertsDonationEvent,
  UserEventsClient,
} from "@donation-alerts/events";
import { db } from "database/client.server";
import { timersTable, usersTable } from "database/schema.server";
import { and, eq } from "drizzle-orm";
import { EventEmitter } from "node:events";
import { client as redis } from "redis/client.server";
import { DaStatus, DaStatusSnapshot } from "~/da-status";
import { timeFormatting } from "~/fomat";
import { singleton } from "~/singleton.server";
import { actionsLogService } from "./actions-log.server";
import { currencyService } from "./currency.server";
import { timerService } from "./timer.server";

const SUBSCRIBE_TIMEOUT = 15_000;
const IDLE_DISCONNECT_DELAY = 30_000;
const WATCHDOG_INTERVAL = 30_000;
const UNHEALTHY_LIMIT = 60_000;
const RETRY_BASE_DELAY = 5_000;
const RETRY_MAX_DELAY = 5 * 60_000;
const DONATION_DEDUP_TTL = 24 * 60 * 60;

export const daAuthProvider = singleton("da-auth-provider", () => {
  const provider = new RefreshingAuthProvider({
    clientId: process.env.DA_CLIENT_ID!,
    clientSecret: process.env.DA_CLIENT_SECRET!,
    redirectUri: process.env.DA_REDIRECT!,
    scopes: ["oauth-user-show", "oauth-donation-subscribe"],
  });

  provider.onRefresh((id, token) => {
    db.update(usersTable)
      .set({
        token: token.accessToken,
        refresh_token: token.refreshToken,
        expiresIn: token.expiresIn,
        obtainmentTimestamp: token.obtainmentTimestamp,
      })
      .where(eq(usersTable.id, id))
      .run()
      .catch((err) =>
        console.error(`[DA:${id}] Failed to save refreshed token`, err)
      );
  });

  return provider;
});

export const daApiClient = singleton(
  "da-api-client",
  () => new ApiClient({ authProvider: daAuthProvider })
);

type Subscription = Awaited<
  ReturnType<UserEventsClient["onDonation"]>
>["_subscription"];

type Connection = {
  userId: number;
  viewers: number;
  client: UserEventsClient | null;
  attempt: number;
  retryTimer: NodeJS.Timeout | null;
  idleTimer: NodeJS.Timeout | null;
  unhealthySince: number | null;
  snapshot: DaStatusSnapshot;
};

const registry = singleton("da-registry", () => {
  const events = new EventEmitter();
  events.setMaxListeners(0);
  return { connections: new Map<number, Connection>(), events };
});

const offlineSnapshot = (): DaStatusSnapshot => ({
  status: "offline",
  viewers: 0,
  lastError: null,
  lastDisconnectReason: null,
  lastDonationAt: null,
  since: Date.now(),
});

// API errors carry the whole HTTP response after the first line.
const errorMessage = (err: unknown) =>
  (err instanceof Error ? err.message : String(err)).split("\n")[0];

const isActive = (conn: Connection) =>
  registry.connections.get(conn.userId) === conn;

const publish = (conn: Connection) =>
  registry.events.emit(`status:${conn.userId}`, conn.snapshot);

const statusLogText = ({
  status,
  lastError,
  lastDisconnectReason,
}: DaStatusSnapshot) => {
  switch (status) {
    case "connected":
      return "DonationAlerts connected";
    case "reconnecting":
      return `DonationAlerts disconnected (${lastDisconnectReason}), reconnecting`;
    case "auth_error":
      return `DonationAlerts authorization failed: ${lastError}. Log in again`;
    case "error":
      return `DonationAlerts connection error: ${lastError}`;
    default:
      return null;
  }
};

const setStatus = (
  conn: Connection,
  status: DaStatus,
  details: { error?: string; reason?: string } = {}
) => {
  const prev = conn.snapshot;
  conn.snapshot = {
    ...prev,
    status,
    lastError: status === "connected" ? null : details.error ?? prev.lastError,
    lastDisconnectReason: details.reason ?? prev.lastDisconnectReason,
    since: status === prev.status ? prev.since : Date.now(),
  };
  publish(conn);

  // Retries hit the same failure over and over; log only actual changes.
  if (status === prev.status && conn.snapshot.lastError === prev.lastError) {
    return;
  }
  const text = statusLogText(conn.snapshot);
  if (!text) return;
  console.log(`[DA:${conn.userId}] ${text}`);
  actionsLogService
    .log(text, conn.userId, { source: "da" })
    .catch((err) => console.error(`[DA:${conn.userId}] Failed to log`, err));
};

const closeClient = (conn: Connection) => {
  const userEvents = conn.client;
  if (!userEvents) return;
  conn.client = null;
  userEvents
    .disconnect(true)
    .catch((err) => console.error(`[DA:${conn.userId}] Disconnect failed`, err))
    .finally(() => {
      // disconnect() does nothing while the socket is still connecting, which
      // would leave Centrifuge retrying in the background forever.
      (
        userEvents as unknown as { _centrifuge: { disconnect(): void } }
      )._centrifuge.disconnect();
    });
};

const scheduleRetry = (conn: Connection) => {
  closeClient(conn);
  if (conn.retryTimer || !isActive(conn)) return;
  const delay = Math.min(RETRY_MAX_DELAY, RETRY_BASE_DELAY * 2 ** conn.attempt);
  conn.attempt += 1;
  conn.retryTimer = setTimeout(() => {
    conn.retryTimer = null;
    void openConnection(conn);
  }, delay);
};

const ensureAuth = async (userId: number) => {
  if (!daAuthProvider.hasUser(userId)) {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, userId),
      columns: {
        token: true,
        refresh_token: true,
        expiresIn: true,
        obtainmentTimestamp: true,
      },
    });
    if (!user) throw new Error("User not found");
    daAuthProvider.addUser(userId, {
      accessToken: user.token,
      refreshToken: user.refresh_token,
      expiresIn: user.expiresIn ?? 0,
      obtainmentTimestamp: user.obtainmentTimestamp ?? 0,
    });
  }
  // Refreshes an expired token, so a broken refresh token fails here instead
  // of hanging the private channel subscription without any error.
  await daAuthProvider.getAccessTokenForUser(userId);
};

// Subscription.ready() only reports an outcome that already happened, so also
// listen for the events of one that is still in progress.
const waitForSubscription = (subscription: Subscription) =>
  new Promise<void>((resolve, reject) => {
    const settle = (error?: Error) => {
      clearTimeout(timeout);
      subscription.off("subscribe", onSubscribe);
      subscription.off("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onSubscribe = () => settle();
    const onError = (ctx: { message: string; code: number }) =>
      settle(new Error(`Subscription failed: ${ctx.message} (${ctx.code})`));
    const timeout = setTimeout(
      () => settle(new Error("Subscription timed out")),
      SUBSCRIBE_TIMEOUT
    );

    subscription.once("subscribe", onSubscribe);
    subscription.once("error", onError);
    subscription.ready(onSubscribe, onError);
  });

const handleDonation = async (
  userId: number,
  event: DonationAlertsDonationEvent
) => {
  // Centrifugo may redeliver a publication after resubscribing; count each donation once.
  const firstDelivery = await redis.set(`donation:${event.id}`, "1", {
    condition: "NX",
    expiration: { type: "EX", value: DONATION_DEDUP_TTL },
  });
  if (!firstDelivery) return;

  const conn = registry.connections.get(userId);
  if (conn) {
    conn.snapshot = { ...conn.snapshot, lastDonationAt: Date.now() };
    publish(conn);
  }

  const donation = `${event.amount} ${event.currency}`;
  const rubles =
    event.currency === "RUB"
      ? event.amount
      : currencyService.convert(event.currency, event.amount);

  if (rubles === null) {
    await actionsLogService.log(
      `Donation ${donation} ignored: no exchange rate for ${event.currency}`,
      userId,
      { source: "donation" }
    );
    return;
  }

  const timers = await db.query.timersTable.findMany({
    where: and(
      eq(timersTable.user_id, userId),
      eq(timersTable.donations_enabled, true)
    ),
    columns: {
      id: true,
      time: true,
      price: true,
      limit_mode: true,
      limit_time: true,
    },
  });

  if (timers.length === 0) {
    await actionsLogService.log(
      `Donation ${donation} received, but no timer accepts donations`,
      userId,
      { source: "donation" }
    );
    return;
  }

  await Promise.all(
    timers
      .filter((timer) => timer.price > 0)
      .map(async (timer) => {
        const requested = rubles * (timer.time / timer.price);
        const result = await timerService.add(timer.id, requested, timer);
        if (!result) return;
        // Results come back from Redis as strings; allow a millisecond of rounding.
        const limited =
          result.applied < requested - 1
            ? ` (limited to +${timeFormatting.short(
                result.applied
              )} of +${timeFormatting.short(requested)})`
            : "";
        await actionsLogService.log(`Donation! ${donation}${limited}`, userId, {
          timerId: timer.id,
          source: "donation",
        });
      })
  );
};

const openConnection = async (conn: Connection) => {
  closeClient(conn);
  if (!isActive(conn)) return;

  const userEvents = new UserEventsClient({
    user: conn.userId,
    apiClient: daApiClient,
  });
  conn.client = userEvents;
  const isCurrent = () => conn.client === userEvents;

  try {
    await ensureAuth(conn.userId);
  } catch (err) {
    if (!isCurrent()) return;
    setStatus(conn, "auth_error", { error: errorMessage(err) });
    scheduleRetry(conn);
    return;
  }

  userEvents.onDisconnect((reason, reconnect) => {
    if (!isCurrent()) return;
    if (reconnect) {
      setStatus(conn, "reconnecting", { reason });
    } else {
      setStatus(conn, "error", { reason, error: `Disconnected: ${reason}` });
      scheduleRetry(conn);
    }
  });

  try {
    const listener = await userEvents.onDonation((event) => {
      handleDonation(conn.userId, event).catch((err) =>
        console.error(`[DA:${conn.userId}] Donation ${event.id} failed`, err)
      );
    });
    const subscription = listener._subscription;
    await waitForSubscription(subscription);
    if (!isCurrent()) return;

    // Centrifuge resubscribes by itself after a reconnect; track those outcomes too.
    subscription.on("subscribe", () => {
      if (isCurrent()) setStatus(conn, "connected");
    });
    subscription.on("error", (ctx: { message: string; code: number }) => {
      if (!isCurrent()) return;
      setStatus(conn, "error", {
        error: `Subscription failed: ${ctx.message} (${ctx.code})`,
      });
      scheduleRetry(conn);
    });

    conn.attempt = 0;
    conn.unhealthySince = null;
    setStatus(conn, "connected");
  } catch (err) {
    if (!isCurrent()) return;
    // The library swallows token errors from the private channel subscribe,
    // so check auth again to report them as such.
    const authFailed = await daAuthProvider
      .getAccessTokenForUser(conn.userId)
      .then(
        () => false,
        () => true
      );
    if (!isCurrent()) return;
    setStatus(conn, authFailed ? "auth_error" : "error", {
      error: errorMessage(err),
    });
    scheduleRetry(conn);
  }
};

singleton("da-watchdog", () =>
  setInterval(() => {
    for (const conn of registry.connections.values()) {
      if (!conn.client || conn.retryTimer) continue;

      // "reconnecting" while the socket is up means the resubscribe never finished.
      const healthy =
        conn.client.isConnected && conn.snapshot.status !== "reconnecting";
      if (healthy) {
        conn.unhealthySince = null;
        continue;
      }

      conn.unhealthySince ??= Date.now();
      if (Date.now() - conn.unhealthySince < UNHEALTHY_LIMIT) continue;

      conn.unhealthySince = null;
      setStatus(conn, "error", { error: "Connection lost for over a minute" });
      scheduleRetry(conn);
    }
  }, WATCHDOG_INTERVAL)
);

export const daEventSystem = {
  /** Registers an open timer page; the first one opens the connection. */
  acquire: (userId: number) => {
    let conn = registry.connections.get(userId);
    if (!conn) {
      conn = {
        userId,
        viewers: 0,
        client: null,
        attempt: 0,
        retryTimer: null,
        idleTimer: null,
        unhealthySince: null,
        snapshot: { ...offlineSnapshot(), status: "connecting" },
      };
      registry.connections.set(userId, conn);
      void openConnection(conn);
    }
    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }
    conn.viewers += 1;
    conn.snapshot = { ...conn.snapshot, viewers: conn.viewers };
    publish(conn);
    return conn.snapshot;
  },
  /** Unregisters a timer page. The connection closes a bit after the last one, so OBS source reloads don't reconnect. */
  release: (userId: number) => {
    const conn = registry.connections.get(userId);
    if (!conn) return;
    conn.viewers = Math.max(0, conn.viewers - 1);
    conn.snapshot = { ...conn.snapshot, viewers: conn.viewers };
    publish(conn);
    if (conn.viewers > 0 || conn.idleTimer) return;

    conn.idleTimer = setTimeout(() => {
      conn.idleTimer = null;
      if (conn.viewers > 0) return;
      registry.connections.delete(userId);
      if (conn.retryTimer) clearTimeout(conn.retryTimer);
      closeClient(conn);
      actionsLogService
        .log("DonationAlerts disconnected: no open timer pages", userId, {
          source: "da",
        })
        .catch((err) => console.error(`[DA:${userId}] Failed to log`, err));
    }, IDLE_DISCONNECT_DELAY);
  },
  /** Drops the current connection and connects again right away. */
  reconnect: (userId: number) => {
    const conn = registry.connections.get(userId);
    if (!conn) return;
    if (conn.retryTimer) {
      clearTimeout(conn.retryTimer);
      conn.retryTimer = null;
    }
    conn.attempt = 0;
    void openConnection(conn);
  },
  getStatus: (userId: number) =>
    registry.connections.get(userId)?.snapshot ?? offlineSnapshot(),
  list: () =>
    [...registry.connections.values()].map((conn) => ({
      userId: conn.userId,
      ...conn.snapshot,
    })),
  onStatus: (userId: number, listener: (status: DaStatusSnapshot) => void) => {
    registry.events.on(`status:${userId}`, listener);
    return () => {
      registry.events.off(`status:${userId}`, listener);
    };
  },
};
