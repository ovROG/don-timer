import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { LogsTable } from "~/components/LogsTable";
import { actionsLogService } from "~/services/actions-log.server";
import { utils } from "~/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);
  return actionsLogService.page(user.id, utils.parsePage(request));
}

export default function LogsPage() {
  const { logs, page, totalPages } = useLoaderData<typeof loader>();
  return <LogsTable logs={logs} page={page} totalPages={totalPages} />;
}
