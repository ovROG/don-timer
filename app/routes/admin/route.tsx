import { Avatar, Pagination, Stack, Table } from "@mantine/core";
import { LoaderFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { count } from "drizzle-orm";
import { utils } from "~/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);

  //todo: maybe check with db
  if (!user.is_admin) {
    return redirect(`/`);
  }

  const requestUrl = new URL(request.url);

  const page = parseInt(requestUrl.searchParams.get("page") ?? "0");
  const limit = 25;
  const offset = (page - 1) * limit;

  const data = await db.transaction(async (tx) => {
    const users = await tx
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatar: usersTable.avatar,
      })
      .from(usersTable)
      .limit(limit)
      .offset(offset);

    const totalResult = await tx.select({ value: count() }).from(usersTable);
    const total = totalResult[0].value;

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  });

  return { data };
}

export default function Admin() {
  const { data } = useLoaderData<typeof loader>();

  return (
    <Stack align="center">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Avatar</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.users.map((user) => {
            return (
              <Table.Tr key={user.id}>
                <Table.Td>{user.name}</Table.Td>
                <Table.Td>
                  <Avatar src={user.avatar} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Pagination total={data.totalPages} />
    </Stack>
  );
}
