import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Stack,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  Text,
  Grid,
  Divider,
} from "@mantine/core";
import { useClipboard, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  ArrowUUpLeft,
  PencilLine,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  redirect,
} from "@remix-run/node";
import { Form, Link, useLoaderData } from "@remix-run/react";
import { db } from "database/client.server";
import { timersTable } from "database/schema.server";
import { eq } from "drizzle-orm";
import { TimerPreview } from "~/components/TimerPreview";
import { utils } from "~/utils.server";
import ControlPanel from "~/components/ControlPannel";
import { timerService } from "~/services/timer.server";

import styles from "./route.module.css";

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

  const controlUrl = new URL(`${url.origin}/panel`);
  controlUrl.searchParams.set("key", encrypted.val);
  controlUrl.searchParams.set("iv", encrypted.iv);

  return { timer, displayUrl, controlUrl, encrypted };
}

export async function action({ params, request }: ActionFunctionArgs) {
  const id = params.id;
  const data = await request.formData();

  await utils.checkAuth(request);

  if (!id) {
    throw new Response(params.id, {
      status: 500,
      statusText: "No timer ID",
    });
  }

  const timeRaw = data.get("time")?.toString();
  const priceRaw = data.get("price")?.toString();

  const update: typeof timersTable.$inferInsert = {
    name: data.get("name")?.toString(),
    format: data.get("format")?.toString(),
    time: timeRaw ? parseInt(timeRaw) * 1000 * 60 : undefined,
    price: priceRaw ? parseInt(priceRaw) : undefined,
    css: data.get("css")?.toString(),
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
  const { timer, displayUrl, controlUrl, encrypted } =
    useLoaderData<typeof loader>();

  const clipboard = useClipboard({ timeout: 500 });
  const [opened, handlers] = useDisclosure(false);

  return (
    <Stack>
      <Group justify="space-between">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xl"
          to={`/dashboard`}
          component={Link}
        >
          <ArrowUUpLeft />
        </ActionIcon>
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
        <TimerPreview id={timer.id} timer={timer} />
      </Paper>

      <Form method="patch">
        <Stack>
          <input type="submit" hidden />
          <Tooltip
            label={
              "hh/h - часы, mm/m - минуты, ss/s - секунды, []-игнорировать"
            }
          >
            <TextInput
              label="Формат"
              placeholder="HH[h]:mm[m]:ss[s]"
              name="format"
              defaultValue={timer.format ?? "HH[h]:mm[m]:ss[s]"}
            />
          </Tooltip>
          <Grid align="center">
            <Grid.Col span="auto">
              <NumberInput
                placeholder="60"
                name="time"
                suffix=" мин."
                defaultValue={(timer.time ?? 360000) / 1000 / 60}
              />
            </Grid.Col>
            <Grid.Col span="content">
              <Text>За</Text>
            </Grid.Col>
            <Grid.Col span="auto">
              <NumberInput
                placeholder="100"
                name="price"
                suffix=" руб."
                defaultValue={timer.price}
              />
            </Grid.Col>
          </Grid>
        </Stack>
      </Form>

      <Tooltip label="Не показывайте ссылку!">
        <PasswordInput
          label="Ссылка на виджет"
          readOnly
          defaultValue={displayUrl.toString()}
          onDoubleClick={() => {
            clipboard.copy(displayUrl.toString());
            notifications.show({
              title: "Copied",
              message: undefined,
            });
          }}
        />
      </Tooltip>

      <Divider />

      <Fieldset legend="Панель Управления">
        <ControlPanel tKey={encrypted.val} iv={encrypted.iv} />
      </Fieldset>
      <Tooltip label="Не показывайте ссылку!">
        <PasswordInput
          label="Ссылка на панель"
          readOnly
          defaultValue={controlUrl.toString()}
          onDoubleClick={() => {
            clipboard.copy(controlUrl.toString());
            notifications.show({
              title: "Copied",
              message: undefined,
            });
          }}
        />
      </Tooltip>

      <Divider />

      <Form method="patch">
        <Stack>
          <Textarea
            label="CSS"
            name="css"
            defaultValue={timer.css ?? ""}
            resize="vertical"
          />
          <Button.Group>
            <Button type="submit" color="gray">
              Сохранить CSS
            </Button>
          </Button.Group>
        </Stack>
      </Form>
    </Stack>
  );
}
