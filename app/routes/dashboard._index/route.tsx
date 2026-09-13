import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { eq } from "drizzle-orm";
import { timersTable } from "database/schema.server";
import { utils } from "~/utils.server";
import { ActionIcon, Button, Flex, Stack, Tooltip } from "@mantine/core";
import { Plus, Timer } from "@phosphor-icons/react/dist/ssr";
import { timerService } from "~/services/timer.server";
import { actionsLogService } from "~/services/actions-log.server";

const getTimers = (userId: number) =>
  db.query.timersTable.findMany({
    where: eq(timersTable.user_id, userId),
    columns: { id: true, name: true },
  });

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await utils.checkAuth(request);
  const timers = await getTimers(user.id);
  return { timers, canCreate: (user.timers_limit ?? 0) > timers.length };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await utils.checkAuth(request);
  const timers = await getTimers(user.id);

  if ((user.timers_limit ?? 0) <= timers.length) {
    return null;
  }

  const [timer] = await db
    .insert(timersTable)
    .values({ user_id: user.id })
    .returning({ id: timersTable.id });

  await timerService.new(timer.id);
  await actionsLogService.log("Timer created", user.id, {
    timerId: timer.id,
    source: "dashboard",
  });

  return redirect(`/dashboard/timer/${timer.id}`);
}

export default function DashboardIndex() {
  const { timers, canCreate } = useLoaderData<typeof loader>();

  return (
    <Stack align="stretch">
      <Flex gap="md" direction="column">
        {timers.map((timer) => {
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
        <Tooltip label="Новый Таймер">
          <ActionIcon
            variant="light"
            w="100%"
            type="submit"
            disabled={!canCreate}
          >
            <Plus />
          </ActionIcon>
        </Tooltip>
      </Form>
    </Stack>
  );
}
