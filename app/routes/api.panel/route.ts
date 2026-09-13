import { ActionFunctionArgs } from "@remix-run/node";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { TimerState } from "redis/types";
import { timeFormatting } from "~/fomat";
import { actionsLogService } from "~/services/actions-log.server";
import { timerService } from "~/services/timer.server";
import { utils } from "~/utils.server";

const parseNumber = (raw: FormDataEntryValue | null) => {
  if (raw === null || raw === "") return null;
  const value = parseFloat(raw.toString());
  return Number.isFinite(value) ? value : null;
};

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
  const set = parseNumber(data.get("set"));
  const delta = parseNumber(data.get("delta"));
  const isAmount = data.get("type") === "amount";

  const id = utils.decryptCuid2(key, iv);

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (!timer?.user_id) {
    throw new Response(null, {
      status: 404,
      statusText: "Not Found",
    });
  }

  const userId = timer.user_id;
  const log = (text: string) =>
    actionsLogService.log(text, userId, { timerId: id, source: "panel" });

  switch (state) {
    case TimerState.Running:
      await timerService.start(id);
      await log("Timer started");
      break;
    case TimerState.Expired:
      await timerService.expire(id);
      await log("Timer stopped");
      break;
    case TimerState.Paused:
      await timerService.pause(id);
      await log("Timer paused");
      break;
    default:
      break;
  }

  if (isAmount && timer.price <= 0) {
    throw new Response(null, { status: 400, statusText: "Timer has no price" });
  }

  const toMs = (value: number) =>
    isAmount ? value * (timer.time / timer.price) : value;
  const describe = (value: number) =>
    isAmount ? `${value} RUB` : timeFormatting.short(value);

  // Results come back from Redis as strings; allow a millisecond of rounding.
  if (set !== null) {
    const requested = toMs(set);
    const stored = await timerService.set(id, requested, timer);
    const limited =
      stored !== null && stored < requested - 1
        ? ` (limited to ${timeFormatting.short(stored)})`
        : "";
    await log(`Time set to ${describe(set)}${limited}`);
  } else if (delta !== null) {
    const requested = toMs(delta);
    const result = await timerService.add(id, requested, timer);
    const limited =
      result && result.applied < requested - 1
        ? ` (limited to +${timeFormatting.short(result.applied)})`
        : "";
    await log(
      `Time ${delta < 0 ? "subtracted" : "added"}: ${describe(
        Math.abs(delta)
      )}${limited}`
    );
  }

  return new Response(null, { status: 204 });
}
