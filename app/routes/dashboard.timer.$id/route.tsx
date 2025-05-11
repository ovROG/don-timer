import { ActionIcon, Group, Stack, TextInput, Title } from "@mantine/core";
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
import { client } from "redis/client.server";
import { utils } from "~/utils.server";

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

  return { timer, url: url.origin };
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
    name: data.get("name")?.toString() ?? undefined,
  };

  switch (request.method) {
    case "POST":
      break;
    case "PATCH":
      await db.update(timersTable).set(update).where(eq(timersTable.id, id));
      break;
    case "DELETE":
      await db.delete(timersTable).where(eq(timersTable.id, id));
      await client.del(id);
      return redirect(`/dashboard`);
  }
  return null;
}

export default function Timer() {
  const { timer, url } = useLoaderData<typeof loader>();

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

      <Form>
        <TextInput
          label="Preview url"
          readOnly
          defaultValue={`${url}/timer/${timer.id}`}
          onDoubleClick={() => {
            clipboard.copy(`${url}/timer/${timer.id}`);
            notifications.show({
              title: "Copied",
              message: undefined,
            });
          }}
        />
      </Form>
    </Stack>
  );
}
