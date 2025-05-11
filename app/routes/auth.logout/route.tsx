import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { appSessionStorage } from "~/services/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return redirect("/", {
    headers: { "Set-Cookie": await appSessionStorage.destroySession(session) },
  });
}
