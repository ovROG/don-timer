import { db } from "database/client.server";
import { timersTable, userLogsTable } from "database/schema.server";
import { inArray, lt } from "drizzle-orm";
import { singleton } from "~/singleton.server";
import { actionsLogService } from "./actions-log.server";
import { currencyService } from "./currency.server";
import { timerService } from "./timer.server";

const DAY = 24 * 60 * 60 * 1000;
const RATES_RETRY_DELAY = 5 * 60 * 1000;
const LOGS_TTL = 30 * DAY;

const tickTimers = async (dt: number) => {
  const expiredIds = await timerService.tick(dt);
  if (expiredIds.length === 0) return;

  const timers = await db.query.timersTable.findMany({
    where: inArray(timersTable.id, expiredIds),
    columns: { id: true, name: true, user_id: true },
  });
  await Promise.all(
    timers.map(({ id, name, user_id }) =>
      user_id === null
        ? undefined
        : actionsLogService.log(`Timer "${name}" expired`, user_id, {
            timerId: id,
            source: "system",
          })
    )
  );
};

const refreshRates = async () => {
  if (!(await currencyService.updataRates())) {
    setTimeout(refreshRates, RATES_RETRY_DELAY);
  }
};

const cleanupLogs = async () => {
  const threshold = new Date(Date.now() - LOGS_TTL);
  await db.delete(userLogsTable).where(lt(userLogsTable.timestamp, threshold));
};

export const startBackgroundJobs = () =>
  singleton("background-jobs", () => {
    let lastTick = performance.now();
    setInterval(() => {
      // Whole milliseconds keep the Redis values clean; carrying the
      // remainder over in lastTick means no time is lost.
      const dt = Math.round(performance.now() - lastTick);
      tickTimers(dt).catch((err) => console.error("Timer tick failed", err));
      lastTick += dt;
    }, 1000);

    void refreshRates();
    setInterval(() => {
      void refreshRates();
      cleanupLogs().catch((err) => console.error("Logs cleanup failed", err));
    }, DAY);

    return true;
  });
