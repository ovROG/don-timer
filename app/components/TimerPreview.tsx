"use client";
import { useEffect, useRef, useState } from "react";
import { format } from "~/format";

import "./TimerPreview.module.css";
import { TimerData, TimerState } from "redis/types";
import { useFrameUpdate } from "~/hooks/useFrameUpdate";

interface Props {
  id: string;
}

export const TimerPreview = ({ id }: Props) => {
  const [time, setTime] = useState<number>(0);
  const [status, setStatus] = useState<TimerState>(TimerState.Paused);

  const dtAccRef = useRef<number>(0);

  const [displayTime, setDisplayTime] = useState<number>(0);

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

  const fTime = format.formatMs(displayTime);

  return (
    <div className={"timer"}>
      {`${fTime.hours}h ${fTime.minutes}m ${fTime.seconds}s //// ${fTime.milliseconds}ms`}{" "}
    </div>
  );
};
