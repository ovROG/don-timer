import { LoaderFunctionArgs } from "@remix-run/node";
import { client } from "redis/client.server";
import { TimerData } from "redis/types";
import { eventStream } from "remix-utils/sse/server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id) {
    throw new Response(id, {
      status: 500,
      statusText: "No timer ID",
    });
  }

  return eventStream(request.signal, (send) => {
    const suber = client.duplicate();

    suber.on("ready", async () => {
      await suber.hGetAll(id).then((raw) => {
        const data = raw as TimerData;
        send({
          event: "init",
          data: JSON.stringify(data),
        });
      });

      await suber.subscribe(`upd:${id}`, (message) => {
        send({ event: "upd", data: message });
      });
      await suber.subscribe(`sts:${id}`, (message) => {
        send({ event: "sts", data: message });
      });
    });

    suber.connect();

    return () => {
      if (suber.isReady) {
        suber.unsubscribe();
        suber.quit();
      }
    };
  });
}
