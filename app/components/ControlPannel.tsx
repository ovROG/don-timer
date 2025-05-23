import { Button, Group, NumberInput, Stack, Tabs } from "@mantine/core";
import { useSubmit } from "@remix-run/react";
import { useState } from "react";
import { TimerState } from "redis/types";

import styles from "./ControlPanel.module.css";
import {
  Equals,
  Minus,
  Pause,
  Play,
  Plus,
} from "@phosphor-icons/react/dist/ssr";

interface Props {
  tKey: string;
  iv: string;
}

export default function ControlPanel({ tKey, iv }: Props) {
  const submit = useSubmit();
  const query = new URLSearchParams();
  query.set("key", tKey);
  query.set("iv", iv);

  const [mod, setMode] = useState<string | null>("time");

  const [minutes, setMinutes] = useState<string | number>(5);
  const [seconds, setSeconds] = useState<string | number>(0);

  const [amount, setAmount] = useState<string | number>(0);

  const updateState = (state: TimerState) => {
    const formData = new FormData();
    formData.set("state", state);
    submit(formData, {
      method: "POST",
      action: "/api/panel?" + query.toString(),
      navigate: false,
    });
  };

  const updateTime = (mode: "set" | "add" | "sub") => {
    const formData = new FormData();

    if (mod === "amount") {
      formData.set("type", "amount");
      if (mode === "set") {
        formData.set("set", amount.toString());
      } else {
        formData.set("delta", (mode === "add" ? amount : -amount).toString());
      }
    } else {
      formData.set("type", "time");
      const time = Number(seconds) * 1000 + Number(minutes) * 1000 * 60;

      if (mode === "set") {
        formData.set("set", time.toString());
      } else {
        formData.set("delta", (mode === "add" ? time : -time).toString());
      }
    }

    submit(formData, {
      method: "POST",
      action: "/api/panel?" + query.toString(),
      navigate: false,
    });
  };

  return (
    <Stack>
      <Group grow>
        <Button
          variant="outline"
          onClick={() => updateState(TimerState.Running)}
          rightSection={<Play weight="fill" />}
        >
          Старт
        </Button>
        <Button
          variant="outline"
          color="red"
          onClick={() => updateState(TimerState.Paused)}
          rightSection={<Pause weight="fill" />}
        >
          Стоп
        </Button>
      </Group>

      <Tabs value={mod} onChange={setMode} variant="outline" color="gray">
        <Tabs.List grow>
          <Tabs.Tab value="time">Время</Tabs.Tab>
          <Tabs.Tab value="amount">Сумма</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="time" className={styles.tab}>
          <Group grow p="sm">
            <NumberInput
              value={minutes}
              onChange={setMinutes}
              allowDecimal={false}
              suffix=" мин."
            />
            <NumberInput
              value={seconds}
              onChange={setSeconds}
              allowDecimal={false}
              suffix=" сек."
            />
          </Group>
        </Tabs.Panel>
        <Tabs.Panel value="amount" className={styles.tab}>
          <NumberInput
            value={amount}
            onChange={setAmount}
            allowDecimal={false}
            suffix=" руб."
            p="sm"
          />
        </Tabs.Panel>
      </Tabs>

      <Button.Group>
        <Button
          variant="default"
          fullWidth
          className={styles.set}
          onClick={() => updateTime("set")}
          rightSection={
            <Equals weight="bold" color="var(--mantine-color-blue-outline)" />
          }
        >
          Установить
        </Button>
        <Button
          variant="default"
          fullWidth
          className={styles.add}
          onClick={() => updateTime("add")}
          rightSection={
            <Plus weight="bold" color="var(--mantine-color-green-outline)" />
          }
        >
          Добавить
        </Button>
        <Button
          variant="default"
          fullWidth
          className={styles.sub}
          onClick={() => updateTime("sub")}
          rightSection={
            <Minus weight="bold" color="var(--mantine-color-red-outline)" />
          }
        >
          Отнять
        </Button>
      </Button.Group>
    </Stack>
  );
}
