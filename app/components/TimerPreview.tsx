import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { TimerData, TimerState } from "redis/types";
import { useFrameUpdate } from "~/hooks/useFrameUpdate";

import { timersTable } from "database/schema.server";
dayjs.extend(duration);

import "./TimerPreview.module.css";
import { timeFormatting } from "~/fomat";

interface Props {
  id: string;
  timer: typeof timersTable.$inferSelect;
}

export const TimerPreview = ({ id, timer }: Props) => {
  const [time, setTime] = useState<number>(0);
  const [status, setStatus] = useState<TimerState>(TimerState.Paused);
  const [displayTime, setDisplayTime] = useState<number>(0);
  const dtAccRef = useRef<number>(0);

  useFrameUpdate((dt) => {
    if (status === TimerState.Running) {
      const display = Math.trunc(time - dtAccRef.current);
      if (display >= 0) {
        setDisplayTime(Math.trunc(time - dtAccRef.current));
        dtAccRef.current += dt;
      }
    }
  });

  useEffect(() => {
    const eventSource = new EventSource(`/api/timer/${id}`);

    eventSource.addEventListener("init", (e) => {
      const data = JSON.parse(e.data) as TimerData;
      setTime(data.remaining);
      setDisplayTime(Math.trunc(data.remaining));
      setStatus(data.status);
    });

    eventSource.addEventListener("upd", (e) => {
      dtAccRef.current = 0;
      setDisplayTime(Math.trunc(e.data));
      setTime(e.data);
    });

    eventSource.addEventListener("sts", (e) => {
      setStatus(e.data as TimerState);
    });

    eventSource.onerror = (error) => {
      console.error("EventSource failed:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [id]);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = timer.css;
    document.head.append(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [timer.css]);

  const fTime = dayjs.duration(displayTime);

  return (
    <div className={"timer"}>{`${timeFormatting.format(
      fTime,
      timer.format ?? "hh[h]:mm[m]:ss[s]"
    )}`}</div>
  );
};
