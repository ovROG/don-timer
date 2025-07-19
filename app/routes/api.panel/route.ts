import { ActionFunctionArgs } from "@remix-run/node";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { TimerState } from "redis/types";
import { actionsLogService } from "~/services/actions-log.server";
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
  const delta = data.get("delta")?.toString();
  const set = data.get("set")?.toString();
  const type = data.get("type")?.toString();

  const id = utils.decryptCuid2(key, iv);

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (!timer) {
    throw new Response(id, {
      status: 500,
      statusText: "No timer",
    });
  }

  const rate = timer.time / timer.price;

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

  if (type === "amount") {
    if (set) {
      await timerService.set(id, parseFloat(set) * rate);
      await actionsLogService.log(`Time Update`, timer.user_id!);
      return data;
    }

    if (delta) {
      await timerService.add(id, parseFloat(delta) * rate);
      await actionsLogService.log(`Time Update`, timer.user_id!);
      return data;
    }
    return data;
  } else {
    if (set) {
      await timerService.set(id, parseFloat(set));
      await actionsLogService.log(`Time Update`, timer.user_id!);
      return data;
    }

    if (delta) {
      await timerService.add(id, parseFloat(delta));
      await actionsLogService.log(`Time Update`, timer.user_id!);
      return data;
    }
  }

  return data;
}
