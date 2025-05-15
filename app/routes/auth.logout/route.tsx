import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { usersTable } from "database/schema.server";
import { appSessionStorage } from "~/services/auth.server";
import { daAuthProvider } from "~/services/donation.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );
  const user = session.get("user") as typeof usersTable.$inferSelect;
  daAuthProvider.removeUser(user.id);
  return redirect("/", {
    headers: { "Set-Cookie": await appSessionStorage.destroySession(session) },
  });
}
