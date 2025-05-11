import * as schema from "./schema.server";
import { drizzle } from "drizzle-orm/libsql";
export const db = drizzle("file:local.db", { schema });
