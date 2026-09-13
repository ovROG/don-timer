import { Avatar, Group, Stack, Title } from "@mantine/core";
import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { DaStatusBadge } from "~/components/DaStatusBadge";
import { LogsTable } from "~/components/LogsTable";
import { actionsLogService } from "~/services/actions-log.server";
import { daEventSystem } from "~/services/donation.server";
import { utils } from "~/utils.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  await utils.checkAdmin(request);

  const userId = Number(params.id);
  if (!Number.isInteger(userId)) {
    throw new Response(null, { status: 404, statusText: "Not Found" });
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, userId),
    columns: { id: true, name: true, avatar: true },
  });

  if (!user) {
    throw new Response(null, {
      status: 404,
      statusText: `No user ${userId} Found`,
    });
  }

  const logs = await actionsLogService.page(user.id, utils.parsePage(request));
  return { user, da: daEventSystem.getStatus(user.id), ...logs };
}

export default function AdminUserPage() {
  const { user, da, logs, page, totalPages } = useLoaderData<typeof loader>();

  return (
    <Stack>
      <Group>
        <Avatar src={user.avatar} />
        <Title order={3}>{user.name}</Title>
        <DaStatusBadge status={da} />
      </Group>
      <LogsTable logs={logs} page={page} totalPages={totalPages} />
    </Stack>
  );
}
