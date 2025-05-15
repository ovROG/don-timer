import { cuid2 } from "drizzle-cuid2/sqlite";
import { relations } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usersTable = sqliteTable("users", {
  id: int().primaryKey(),
  name: text().notNull(),
  avatar: text().notNull(),

  token: text().notNull(),
  refresh_token: text().notNull(),
  expiresIn: int(),
  obtainmentTimestamp: int(),

  da_socket_token: text().notNull(),
});

export const timersTable = sqliteTable("timers", {
  id: cuid2().defaultRandom().primaryKey(),
  name: text().default("New Timer"),
  format: text().default("HH[h]:mm[m]:ss[s]"),
  css: text().default(
    '.timer { color: #bb2020; font-family: "Manrope"; font-weight: bold; }'
  ),
  time: int().notNull().default(3600000),
  price: int().notNull().default(100),
  user_id: int().references(() => usersTable.id),
});

export const usersToTimers = relations(usersTable, ({ many }) => ({
  timers: many(timersTable),
}));

export const timersToUsers = relations(timersTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [timersTable.user_id],
    references: [usersTable.id],
  }),
}));
