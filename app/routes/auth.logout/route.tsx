import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { appSessionStorage } from "~/services/auth.server";

// The user's tokens stay in the DonationAlerts auth provider: an OBS timer
// can still be live after logging out of the dashboard.
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await appSessionStorage.getSession(
    request.headers.get("cookie")
  );
  return redirect("/", {
    headers: { "Set-Cookie": await appSessionStorage.destroySession(session) },
  });
}
