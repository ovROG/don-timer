import { Stack, Table } from "@mantine/core";
import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { utils } from "~/utils.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;
  const cookieUser = await utils.checkAuth(request);

  //TODO: maybe check with db
  if (!cookieUser.is_admin) {
    return redirect(`/`);
  }

  if (!id) {
    throw new Response(id, {
      status: 500,
      statusText: "No user ID",
    });
  }

  const parsedID = parseInt(id);
  if (isNaN(parsedID)) {
    throw new Response(id, {
      status: 500,
      statusText: "No user ID",
    });
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, parseInt(id)),
    with: {
      logs: true,
    },
  });

  if (!user) {
    throw new Response(id, {
      status: 500,
      statusText: `No user ${id} Found`,
    });
  }

  return user;
}

export default function AdminUserPage() {
  const user = useLoaderData<typeof loader>();

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
          {user.logs
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .map((log) => {
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
