import { Stack, Table } from "@mantine/core";
import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { userLogsTable } from "database/schema.server";
import { desc, eq } from "drizzle-orm";
import { utils } from "~/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);

  const logs = await db.query.userLogsTable.findMany({
    where: eq(userLogsTable.user_id, user.id),
    orderBy: [desc(userLogsTable.timestamp)],
  });

  return logs;
}

export default function LogsPage() {
  const logs = useLoaderData<typeof loader>();

  return (
    <Stack>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Time</Table.Th>
            <Table.Th>Message</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {logs.map((log) => {
            return (
              <Table.Tr key={log.id}>
                <Table.Td>{log.timestamp.toLocaleString()}</Table.Td>
                <Table.Td>{log.text}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
