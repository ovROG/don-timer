import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { appSessionStorage, authenticator } from "~/services/auth.server";
import { daEventSystem } from "~/services/donation.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await authenticator.authenticate("donationalerts", request);

  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );

  // Only the id: the cookie is signed, not encrypted, so tokens must not live in it.
  session.set("userId", user.id);

  // Fresh tokens were just stored; retry a connection that failed on the old ones.
  const { status } = daEventSystem.getStatus(user.id);
  if (status === "auth_error" || status === "error") {
    daEventSystem.reconnect(user.id);
  }

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await appSessionStorage.commitSession(session),
    },
  });
}
