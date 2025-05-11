import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { appSessionStorage, authenticator } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await authenticator.authenticate("donationalerts", request);

  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );

  session.set("user", user);

  return redirect("/dashboard", {
    headers: {
      "Set-Cookie": await appSessionStorage.commitSession(session),
    },
  });
}
