import { LoaderFunctionArgs } from "@remix-run/node";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { client } from "redis/client.server";
import { eventStream } from "remix-utils/sse/server";
import { daEventSystem } from "~/services/donation.server";
import { timerEvents } from "~/services/timer-events.server";

// nginx drops proxied connections that stay silent past proxy_read_timeout (60s by default).
const HEARTBEAT_INTERVAL = 15_000;

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;

  const timer = id
    ? await db.query.timersTable.findFirst({
        where: eq(timersTable.id, id),
        columns: { id: true, user_id: true },
      })
    : undefined;

  if (!timer?.user_id) {
    throw new Response(null, { status: 404, statusText: "Not Found" });
  }

  const timerId = timer.id;
  const userId = timer.user_id;

  const response = eventStream(
    request.signal,
    (send, close) => {
      const sendState = () =>
        client
          .hGetAll(timerId)
          .then((data) => send({ event: "init", data: JSON.stringify(data) }))
          .catch((err) =>
            console.error(`Failed to read timer ${timerId} state`, err)
          );

      // Subscribe before reading the state so no update slips in between.
      const unsubscribeTimer = timerEvents.subscribe(
        timerId,
        (event) => {
          if (event.event === "del") {
            send({ event: "deleted", data: "" });
            close();
            return;
          }
          send(event);
        },
        sendState
      );
      void sendState();

      const daStatus = daEventSystem.acquire(userId);
      send({ event: "da", data: JSON.stringify(daStatus) });
      const unsubscribeDa = daEventSystem.onStatus(userId, (status) =>
        send({ event: "da", data: JSON.stringify(status) })
      );

      const heartbeat = setInterval(
        () => send({ event: "ping", data: "" }),
        HEARTBEAT_INTERVAL
      );

      return () => {
        clearInterval(heartbeat);
        unsubscribeTimer();
        unsubscribeDa();
        daEventSystem.release(userId);
      };
    },
    { headers: { "X-Accel-Buffering": "no" } }
  );

  // remix-serve gzips responses, and gzip holds events back until its buffer
  // fills. The compression middleware skips responses marked no-transform.
  response.headers.set("Cache-Control", "no-cache, no-transform");
  return response;
}
