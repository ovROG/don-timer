import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";

import { TimerData, TimerState } from "redis/types";
import { useFrameUpdate } from "~/hooks/useFrameUpdate";
import { DaStatusSnapshot } from "~/da-status";

import { timersTable } from "database/schema.server";
dayjs.extend(duration);

import "./TimerPreview.module.css";
import { timeFormatting } from "~/fomat";

const MAX_RETRY_DELAY = 30_000;

interface Props {
  id: string;
  timer: typeof timersTable.$inferSelect;
  onDaStatus?: (status: DaStatusSnapshot) => void;
}

export const TimerPreview = ({ id, timer, onDaStatus }: Props) => {
  const [time, setTime] = useState<number>(0);
  const [status, setStatus] = useState<TimerState>(TimerState.Paused);
  const [displayTime, setDisplayTime] = useState<number>(0);
  const dtAccRef = useRef<number>(0);
  const onDaStatusRef = useRef(onDaStatus);

  useEffect(() => {
    onDaStatusRef.current = onDaStatus;
  }, [onDaStatus]);

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
    let eventSource: EventSource;
    let retryTimer: number | undefined;
    let retryDelay = 1000;
    let stopped = false;

    const connect = () => {
      eventSource = new EventSource(`/api/timer/${id}`);

      eventSource.addEventListener("init", (e) => {
        retryDelay = 1000;
        const data = JSON.parse(e.data) as TimerData;
        const remaining = Number(data.remaining);
        dtAccRef.current = 0;
        setTime(remaining);
        setDisplayTime(Math.trunc(remaining));
        setStatus(data.status);
      });

      eventSource.addEventListener("upd", (e) => {
        const remaining = Number(e.data);
        dtAccRef.current = 0;
        setDisplayTime(Math.trunc(remaining));
        setTime(remaining);
      });

      eventSource.addEventListener("sts", (e) => {
        setStatus(e.data as TimerState);
      });

      eventSource.addEventListener("da", (e) => {
        onDaStatusRef.current?.(JSON.parse(e.data) as DaStatusSnapshot);
      });

      eventSource.addEventListener("deleted", () => {
        stopped = true;
        eventSource.close();
      });

      eventSource.onerror = () => {
        // The browser reconnects a dropped stream by itself and only gives up
        // when the server responds with an error, e.g. while the app restarts.
        if (stopped || eventSource.readyState !== EventSource.CLOSED) return;
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
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
