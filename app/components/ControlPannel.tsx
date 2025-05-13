import { Button, Group, NumberInput, Stack } from "@mantine/core";
import { useSubmit } from "@remix-run/react";
import { useState } from "react";
import { TimerState } from "redis/types";

interface Props {
  tKey: string;
  iv: string;
}

export default function ControlPanel({ tKey, iv }: Props) {
  const submit = useSubmit();
  const query = new URLSearchParams();
  query.set("key", tKey);
  query.set("iv", iv);

  const [minutes, setMinutes] = useState<string | number>(5);
  const [seconds, setSeconds] = useState<string | number>(0);

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

    const time = Number(seconds) * 1000 + Number(minutes) * 1000 * 60;

    if (mode === "set") {
      formData.set("set", time.toString());
    } else {
      formData.set("delta", (mode === "add" ? time : -time).toString());
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
        >
          Старт
        </Button>
        <Button
          variant="outline"
          color="red"
          onClick={() => updateState(TimerState.Paused)}
        >
          Стоп
        </Button>
      </Group>

      <Button.Group>
        <Button variant="default" fullWidth onClick={() => updateTime("set")}>
          Установить
        </Button>
        <Button variant="default" fullWidth onClick={() => updateTime("add")}>
          Добавить
        </Button>
        <Button variant="default" fullWidth onClick={() => updateTime("sub")}>
          Отнять
        </Button>
      </Button.Group>
      <Group grow>
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
    </Stack>
  );
}
