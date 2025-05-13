import {
  ActionIcon,
  Fieldset,
  Group,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useClipboard, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { PencilLine, Trash } from "@phosphor-icons/react/dist/ssr";
import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { TimerPreview } from "~/components/TimerPreview";
import { utils } from "~/utils.server";

import styles from "./route.module.css";
import ControlPanel from "~/components/ControlPannel";
import { timerService } from "~/services/timer.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;
  const url = new URL(request.url);

  if (!id) {
    return redirect(`/dashboard`);
  }

  const cookieUser = await utils.checkAuth(request);

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (timer?.user_id != cookieUser.id) {
    return redirect(`/dashboard`);
  }

  const encrypted = utils.encryptCuid2(id);
  const displayUrl = new URL(`${url.origin}/timer`);
  displayUrl.searchParams.set("key", encrypted.val);
  displayUrl.searchParams.set("iv", encrypted.iv);

  return { timer, url: displayUrl, encrypted };
}

export async function action({ params, request }: ActionFunctionArgs) {
  const id = params.id;
  const data = await request.formData();

  if (!id) {
    throw new Response(params.id, {
      status: 500,
      statusText: "No timer ID",
    });
  }

  const update: typeof timersTable.$inferInsert = {
    name: data.get("name")?.toString(),
  };

  switch (request.method) {
    case "POST":
      break;
    case "PATCH":
      await db.update(timersTable).set(update).where(eq(timersTable.id, id));
      break;
    case "DELETE":
      await db.delete(timersTable).where(eq(timersTable.id, id));
      await timerService.delete(id);
      return redirect(`/dashboard`);
  }
  return null;
}

export default function Timer() {
  const { timer, url, encrypted } = useLoaderData<typeof loader>();

  const clipboard = useClipboard({ timeout: 500 });
  const [opened, handlers] = useDisclosure(false);

  return (
    <Stack>
      <Group justify="space-between">
        {opened ? (
          <Form method="patch" onSubmit={() => handlers.close()}>
            <Group>
              <TextInput
                placeholder="Timer Name"
                name="name"
                defaultValue={timer.name ?? "Timer Name"}
              />
              <ActionIcon variant="subtle" size="xl" type="submit">
                <PencilLine />
              </ActionIcon>
            </Group>
          </Form>
        ) : (
          <Group>
            <Title>{timer.name}</Title>
            <ActionIcon
              variant="subtle"
              size="xl"
              onClick={() => handlers.toggle()}
            >
              <PencilLine />
            </ActionIcon>
          </Group>
        )}
        <Form method="delete">
          <ActionIcon variant="subtle" color="red" size="xl" type="submit">
            <Trash />
          </ActionIcon>
        </Form>
      </Group>

      <Paper p="md" className={styles.checkerboard}>
        <TimerPreview id={timer.id} />
      </Paper>

      <Tooltip label="Не показывайте ссылку!">
        <PasswordInput
          label="Ссылка на виджет"
          readOnly
          defaultValue={url.toString()}
          onDoubleClick={() => {
            clipboard.copy(url.toString());
            notifications.show({
              title: "Copied",
              message: undefined,
            });
          }}
        />
      </Tooltip>
      <Fieldset legend="Панель Управления">
        <ControlPanel tKey={encrypted.val} iv={encrypted.iv} />
      </Fieldset>
    </Stack>
  );
}
