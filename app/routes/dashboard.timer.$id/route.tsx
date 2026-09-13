import {
  ActionIcon,
  Button,
  Fieldset,
  Group,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  Text,
  Grid,
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
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
} from "@remix-run/react";
import { db } from "database/client.server";
import { type LimitMode, timersTable } from "database/schema.server";
import { and, eq } from "drizzle-orm";
import { useState } from "react";
import { DaStatusBadge } from "~/components/DaStatusBadge";
import { TimerPreview } from "~/components/TimerPreview";
import { DaStatusSnapshot } from "~/da-status";
import { timeFormatting } from "~/fomat";
import { isLimitMode, limitModes } from "~/timer-limits";
import { utils } from "~/utils.server";
import ControlPanel from "~/components/ControlPannel";
import { timerService } from "~/services/timer.server";

import styles from "./route.module.css";
import { actionsLogService } from "~/services/actions-log.server";

const HOUR = 60 * 60 * 1000;

/** undefined: field not submitted; null: submitted but not a positive number. */
const parsePositive = (value: FormDataEntryValue | null, integer = false) => {
  if (value === null || value === "") return undefined;
  const parsed = parseFloat(value.toString().replace(/\s/g, ""));
  const result = integer ? Math.trunc(parsed) : parsed;
  return Number.isFinite(result) && result > 0 ? result : null;
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const id = params.id;

  if (!id) {
    return redirect(`/dashboard`);
  }

  const cookieUser = await utils.checkAuth(request);

  const timer = await db.query.timersTable.findFirst({
    where: eq(timersTable.id, id),
  });

  if (!timer || timer.user_id !== cookieUser.id) {
    return redirect(`/dashboard`);
  }

  const encrypted = utils.encryptCuid2(id);
  const origin = utils.publicOrigin(request);

  const displayUrl = new URL(`${origin}/timer`);
  displayUrl.searchParams.set("key", encrypted.val);
  displayUrl.searchParams.set("iv", encrypted.iv);

  const controlUrl = new URL(`${origin}/panel`);
  controlUrl.searchParams.set("key", encrypted.val);
  controlUrl.searchParams.set("iv", encrypted.iv);

  const elapsed = await timerService.elapsed(id);

  return { timer, displayUrl, controlUrl, encrypted, elapsed };
}

export async function action({ params, request }: ActionFunctionArgs) {
  const user = await utils.checkAuth(request);

  const timer = params.id
    ? await db.query.timersTable.findFirst({
        where: and(
          eq(timersTable.id, params.id),
          eq(timersTable.user_id, user.id)
        ),
        columns: { id: true, name: true },
      })
    : undefined;

  if (!timer) {
    throw new Response(null, { status: 404, statusText: "Not Found" });
  }

  const data = await request.formData();

  switch (request.method) {
    case "PATCH": {
      if (data.has("reset_elapsed")) {
        await timerService.resetElapsed(timer.id);
        await actionsLogService.log("Elapsed time reset", user.id, {
          timerId: timer.id,
          source: "dashboard",
        });
        return null;
      }

      const minutes = parsePositive(data.get("time"));
      const price = parsePositive(data.get("price"), true);
      if (minutes === null || price === null) {
        return { error: "Время и цена должны быть больше нуля" };
      }

      const rawLimitMode = data.get("limit_mode");
      const limitMode =
        rawLimitMode === null
          ? undefined
          : isLimitMode(rawLimitMode)
          ? rawLimitMode
          : null;
      if (limitMode === null) {
        return { error: "Неизвестный тип лимита" };
      }

      // The hours field is disabled, and so not submitted, when there is no limit.
      const limitHours = parsePositive(data.get("limit_hours"));
      if (
        limitHours === null ||
        (limitMode && limitMode !== "none" && limitHours === undefined)
      ) {
        return { error: "Лимит должен быть больше нуля" };
      }

      const donationsEnabled = data.get("donations_enabled")?.toString();
      const update: typeof timersTable.$inferInsert = {
        name: data.get("name")?.toString(),
        format: data.get("format")?.toString(),
        time: minutes === undefined ? undefined : Math.round(minutes * 60_000),
        price,
        css: data.get("css")?.toString(),
        donations_enabled:
          donationsEnabled === undefined
            ? undefined
            : donationsEnabled === "true",
        limit_mode: limitMode,
        limit_time:
          limitHours === undefined ? undefined : Math.round(limitHours * HOUR),
      };

      await db.update(timersTable).set(update).where(eq(timersTable.id, timer.id));
      await actionsLogService.log("Timer settings updated", user.id, {
        timerId: timer.id,
        source: "dashboard",
      });
      return null;
    }
    case "DELETE":
      await db.delete(timersTable).where(eq(timersTable.id, timer.id));
      await timerService.delete(timer.id);
      await actionsLogService.log(`Timer "${timer.name}" deleted`, user.id, {
        source: "dashboard",
      });
      return redirect(`/dashboard`);
  }
  return null;
}

export default function Timer() {
  const { timer, displayUrl, controlUrl, encrypted, elapsed } =
    useLoaderData<typeof loader>();

  const clipboard = useClipboard({ timeout: 500 });
  const [opened, handlers] = useDisclosure(false);
  const [daStatus, setDaStatus] = useState<DaStatusSnapshot | null>(null);

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

      {daStatus && (
        <Group justify="flex-end" gap="xs">
          <Text size="sm">DonationAlerts</Text>
          <DaStatusBadge status={daStatus} />
        </Group>
      )}

      <Paper p="md" className={styles.checkerboard}>
        <TimerPreview id={timer.id} timer={timer} onDaStatus={setDaStatus} />
      </Paper>

      <Tooltip label="Не показывайте ссылку!">
        <PasswordInput
          label="Ссылка на виджет таймера"
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
      <Tooltip label="Не показывайте ссылку!">
        <PasswordInput
          label="Ссылка на панель управления"
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

      <TimerConfig timer={timer} elapsed={elapsed} />

      <Fieldset legend="Панель Управления">
        <ControlPanel tKey={encrypted.val} iv={encrypted.iv} />
      </Fieldset>

      <Fieldset legend="CSS">
        <Form method="patch">
          <Stack>
            <Textarea
              name="css"
              defaultValue={timer.css ?? ""}
              resize="vertical"
            />
            <Button.Group>
              <Button type="submit" fullWidth variant="light">
                Сохранить CSS
              </Button>
            </Button.Group>
          </Stack>
        </Form>
      </Fieldset>
    </Stack>
  );
}

const TimerConfig = ({
  timer,
  elapsed,
}: {
  timer: typeof timersTable.$inferSelect;
  elapsed: number;
}) => {
  const actionData = useActionData<typeof action>();
  const donationsFetcher = useFetcher();
  const resetFetcher = useFetcher();
  const [limitMode, setLimitMode] = useState<LimitMode>(timer.limit_mode);

  const donationsEnabled = donationsFetcher.formData
    ? donationsFetcher.formData.get("donations_enabled") === "true"
    : timer.donations_enabled;

  return (
    <Fieldset legend="Настройки">
      <Stack>
        <Switch
          label="Добавлять время за донаты"
          checked={donationsEnabled}
          onChange={(event) =>
            donationsFetcher.submit(
              { donations_enabled: String(event.currentTarget.checked) },
              { method: "patch" }
            )
          }
        />
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
                  min={1}
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
                  min={1}
                  allowDecimal={false}
                  defaultValue={timer.price}
                />
              </Grid.Col>
            </Grid>
            <Grid align="flex-end">
              <Grid.Col span="auto">
                <Select
                  label="Лимит"
                  name="limit_mode"
                  data={limitModes.map(({ value, label }) => ({ value, label }))}
                  value={limitMode}
                  onChange={(value) => {
                    if (isLimitMode(value)) setLimitMode(value);
                  }}
                  allowDeselect={false}
                />
              </Grid.Col>
              <Grid.Col span="auto">
                <NumberInput
                  name="limit_hours"
                  suffix=" ч."
                  min={0}
                  decimalScale={2}
                  disabled={limitMode === "none"}
                  defaultValue={(timer.limit_time ?? 4 * HOUR) / HOUR}
                />
              </Grid.Col>
            </Grid>
            <Text size="xs" c="dimmed">
              {limitModes.find((mode) => mode.value === limitMode)?.hint}
            </Text>
            {limitMode === "total" && (
              <Group justify="space-between">
                <Text size="sm">
                  Прошло: {timeFormatting.short(elapsed)} (при загрузке
                  страницы)
                </Text>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  loading={resetFetcher.state !== "idle"}
                  onClick={() =>
                    resetFetcher.submit(
                      { reset_elapsed: "1" },
                      { method: "patch" }
                    )
                  }
                >
                  Сбросить
                </Button>
              </Group>
            )}
            {actionData?.error && (
              <Text c="red" size="sm">
                {actionData.error}
              </Text>
            )}
            <Button type="submit" fullWidth variant="light">
              Сохранить
            </Button>
          </Stack>
        </Form>
      </Stack>
    </Fieldset>
  );
};
