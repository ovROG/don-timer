import { ActionFunctionArgs } from "@remix-run/node";
import { TimerState } from "redis/types";
import { timerService } from "~/services/timer.server";
import { utils } from "~/utils.server";

export async function action({ request }: ActionFunctionArgs) {
  const requestUrl = new URL(request.url);
  const key = requestUrl.searchParams.get("key");
  const iv = requestUrl.searchParams.get("iv");

  if (!key || !iv) {
    throw new Response(null, {
      status: 404,
      statusText: "Not Found",
    });
  }

  const data = await request.formData();

  const state = data.get("state")?.toString();
  const timeDt = data.get("delta")?.toString();
  const timeSet = data.get("set")?.toString();

  const id = utils.decryptCuid2(key, iv);

  switch (state) {
    case TimerState.Running:
      await timerService.start(id);
      break;
    case TimerState.Expired:
      await timerService.expire(id);
      break;
    case TimerState.Paused:
      await timerService.pause(id);
      break;
    default:
      break;
  }

  if (timeSet) {
    await timerService.set(id, parseFloat(timeSet));
  }

  if (timeDt) {
    await timerService.add(id, parseFloat(timeDt));
  }

  return data;
}
