import { LoaderFunctionArgs } from "@remix-run/node";
import { client } from "redis/client.server";
import { eventStream } from "remix-utils/sse/server";
import { TimerData } from "~/services/timer.server";

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

    suber.connect().then(async () => {
      await suber.hGetAll(id).then((raw) => {
        const data = raw as TimerData;
        send({ event: "upd", data: data.remaining.toString() });
        send({ event: "sts", data: data.status });
      });

      await suber.subscribe(`upd:${id}`, (message) => {
        send({ event: "upd", data: message });
      });
      await suber.subscribe(`sts:${id}`, (message) => {
        send({ event: "sts", data: message });
      });
    });

    return () => {
      suber.unsubscribe();
      suber.quit();
    };
  });
}
