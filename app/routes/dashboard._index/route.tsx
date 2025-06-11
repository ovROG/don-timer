import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { eq } from "drizzle-orm";
import { timersTable, usersTable } from "database/schema.server";
import { utils } from "~/utils.server";
import { ActionIcon, Button, Flex, Stack, Tooltip } from "@mantine/core";
import { Plus, Timer } from "@phosphor-icons/react/dist/ssr";
import { timerService } from "~/services/timer.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const cookieUser = await utils.checkAuth(request);
  
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, cookieUser.id),
    with: { timers: true },
  });

  if (!user) {
    throw new Response(cookieUser.id.toString(), {
      status: 500,
      statusText: "No user",
    });
  }

  return user;
}

export async function action({ request }: ActionFunctionArgs) {
  const data = await request.formData();
  const id = data.get("id") as string;

  if (!id) {
    throw new Response(data, {
      status: 500,
      statusText: "No user ID",
    });
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, parseInt(id)),
    with: { timers: true },
  });

  if (!user) {
    throw new Response(id, {
      status: 500,
      statusText: "No user",
    });
  }

  if (user.timers_limit! <= user.timers.length) {
    return null;
  }

  const timer: typeof timersTable.$inferInsert = {
    user_id: parseInt(id),
  };

  const new_timer = await db.insert(timersTable).values(timer).returning();

  timerService.new(new_timer[0].id);

  return redirect(`/dashboard/timer/${new_timer[0].id}`);
}

export default function DashboardIndex() {
  const user = useLoaderData<typeof loader>();

  return (
    <Stack align="stretch">
      <Flex gap="md" direction="column">
        {user.timers.map((timer) => {
          return (
            <Button
              to={`/dashboard/timer/${timer.id}`}
              component={Link}
              fullWidth
              variant="default"
              rightSection={<Timer />}
              key={timer.id}
            >
              {timer.name}
            </Button>
          );
        })}
      </Flex>
      <Form method="post" navigate={false}>
        <input hidden defaultValue={user.id} name="id" />
        <Tooltip label="Новый Таймер">
          <ActionIcon
            variant="light"
            w="100%"
            type="submit"
            disabled={user.timers_limit! <= user.timers.length}
          >
            <Plus />
          </ActionIcon>
        </Tooltip>
      </Form>
    </Stack>
  );
}
