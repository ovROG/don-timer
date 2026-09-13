import { Avatar, Pagination, Stack, Table } from "@mantine/core";
import { LoaderFunctionArgs } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import { db } from "database/client.server";
import { usersTable } from "database/schema.server";
import { count } from "drizzle-orm";
import { utils } from "~/utils.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await utils.checkAdmin(request);

  const page = utils.parsePage(request);
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

  const navigate = useNavigate();
  const location = useLocation();

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(location.search);
    params.set("page", page.toString());

    navigate(`${location.pathname}?${params.toString()}`);
  };

  return (
    <Stack align="center" h="100%" justify="space-between" py="md">
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
                <Table.Td>
                  <Link to={`/admin/users/${user.id}`}>{user.name}</Link>
                </Table.Td>
                <Table.Td>
                  <Avatar src={user.avatar} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Pagination total={data.totalPages} onChange={handlePageChange} />
    </Stack>
  );
}
