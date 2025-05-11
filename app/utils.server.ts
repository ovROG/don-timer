import { usersTable } from "database/schema.server";
import { appSessionStorage } from "./services/auth.server";
import { redirect } from "@remix-run/node";

export const utils = {
  checkAuth: async (request: Request) => {
    const session = await appSessionStorage.getSession(
      request.headers.get("cookie")
    );

    const user = session.get("user") as typeof usersTable.$inferSelect;
    if (!user) throw redirect("/");
    return user;
  },
};
