import { cuid2 } from "drizzle-cuid2/sqlite";
import { relations, sql } from "drizzle-orm";
import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type LogSource = "donation" | "panel" | "dashboard" | "da" | "system";

export type LimitMode = "none" | "remaining" | "total";

export const usersTable = sqliteTable("users", {
  id: int().primaryKey(),
  name: text().notNull(),
  avatar: text().notNull(),

  token: text().notNull(),
  refresh_token: text().notNull(),
  expiresIn: int(),
  obtainmentTimestamp: int(),

  da_socket_token: text().notNull(),

  timers_limit: int().default(2),

  is_admin: int({ mode: "boolean" }).default(false),
});

export const timersTable = sqliteTable("timers", {
  id: cuid2().defaultRandom().primaryKey(),
  name: text().default("New Timer"),
  format: text().default("HH[h]:mm[m]:ss[s]"),
  css: text().default(
    '.timer { color: #bb2020; font-family: "Manrope"; font-weight: bold; font-size: 100px; }'
  ),
  time: int().notNull().default(3600000),
  price: int().notNull().default(100),
  donations_enabled: int({ mode: "boolean" }).notNull().default(true),
  // remaining: time on the timer can't exceed limit_time; total: elapsed + remaining can't.
  limit_mode: text().$type<LimitMode>().notNull().default("none"),
  limit_time: int(),
  user_id: int().references(() => usersTable.id),
});

export const userLogsTable = sqliteTable(
  "user_logs",
  {
    id: cuid2().defaultRandom().primaryKey(),
    user_id: int().references(() => usersTable.id),
    // No FK: logs outlive deleted timers.
    timer_id: text(),
    source: text().$type<LogSource>(),
    timestamp: int({ mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    text: text(),
  },
  (table) => [
    index("user_logs_user_id_timestamp_idx").on(table.user_id, table.timestamp),
  ]
);

export const usersTableRelations = relations(usersTable, ({ many }) => ({
  timers: many(timersTable),
  logs: many(userLogsTable),
}));

export const timersTableRelations = relations(timersTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [timersTable.user_id],
    references: [usersTable.id],
  }),
}));

export const userLogsTableRelations = relations(userLogsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [userLogsTable.user_id],
    references: [usersTable.id],
  }),
  timer: one(timersTable, {
    fields: [userLogsTable.timer_id],
    references: [timersTable.id],
  }),
}));
