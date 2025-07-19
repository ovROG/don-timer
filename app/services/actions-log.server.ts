import { db } from "database/client.server";
import { userLogsTable } from "database/schema.server";

export const actionsLogService = {
  log: async (text: string, user_id: number) => {
    const data: typeof userLogsTable.$inferInsert = {
      text,
      user_id,
    };
    await db.insert(userLogsTable).values(data);
  },
};
