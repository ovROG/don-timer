import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { TimerPreview } from "~/components/TimerPreview";
import { utils } from "~/utils.server";

import "./route.module.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const key = requestUrl.searchParams.get("key");
  const iv = requestUrl.searchParams.get("iv");

  if (!key || !iv) {
    throw new Response(null, {
      status: 404,
      statusText: "Not Found",
    });
  }
  const id = utils.decryptCuid2(key, iv);

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (!timer) {
    throw new Response(null, {
      status: 404,
      statusText: "Not Found",
    });
  }

  return timer;
}

export default function Timer() {
  const timer = useLoaderData<typeof loader>();
  return <TimerPreview id={timer.id} />;
}
