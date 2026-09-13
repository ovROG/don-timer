import { db } from "database/client.server";
import { type LogSource, userLogsTable } from "database/schema.server";
import { count, desc, eq } from "drizzle-orm";

const PAGE_SIZE = 50;

export const actionsLogService = {
  log: async (
    text: string,
    user_id: number,
    options: { timerId?: string; source?: LogSource } = {}
  ) => {
    const data: typeof userLogsTable.$inferInsert = {
      text,
      user_id,
      timer_id: options.timerId,
      source: options.source,
    };
    await db.insert(userLogsTable).values(data);
  },
  page: async (user_id: number, page: number) => {
    const [logs, [{ total }]] = await Promise.all([
      db.query.userLogsTable.findMany({
        where: eq(userLogsTable.user_id, user_id),
        orderBy: [desc(userLogsTable.timestamp)],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        with: { timer: { columns: { name: true } } },
      }),
      db
        .select({ total: count() })
        .from(userLogsTable)
        .where(eq(userLogsTable.user_id, user_id)),
    ]);
    return {
      logs,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  },
};
