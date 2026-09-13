import { EventEmitter } from "node:events";
import { client } from "redis/client.server";
import { singleton } from "~/singleton.server";

export type TimerStreamEvent = { event: string; data: string };

// One Redis connection receives updates for all timers and fans them out to
// the open streams, instead of a subscriber connection per viewer.
const hub = singleton("timer-events", () => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  const subscriber = client.duplicate();
  subscriber.on("error", (err) => console.error("Redis subscriber error", err));

  let wasReady = false;
  subscriber.on("ready", () => {
    // Messages published while the subscriber was reconnecting are lost.
    if (wasReady) emitter.emit("resync");
    wasReady = true;
  });

  subscriber
    .connect()
    .then(() =>
      subscriber.pSubscribe(["upd:*", "sts:*", "del:*"], (message, channel) => {
        const separator = channel.indexOf(":");
        emitter.emit(`timer:${channel.slice(separator + 1)}`, {
          event: channel.slice(0, separator),
          data: message,
        } satisfies TimerStreamEvent);
      })
    )
    .catch((err) => console.error("Redis subscriber failed to start", err));

  return emitter;
});

export const timerEvents = {
  /** onResync fires when updates may have been missed and the full state should be re-read. */
  subscribe: (
    id: string,
    onEvent: (event: TimerStreamEvent) => void,
    onResync: () => void
  ) => {
    hub.on(`timer:${id}`, onEvent);
    hub.on("resync", onResync);
    return () => {
      hub.off(`timer:${id}`, onEvent);
      hub.off("resync", onResync);
    };
  },
};
