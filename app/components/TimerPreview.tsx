"use client";
import { useEffect, useState } from "react";

import "./TimerPreview.module.css";
import { format, FormatedTime } from "~/format";

interface Props {
  id: string;
}

export const TimerPreview = ({ id }: Props) => {
  const [time, setTime] = useState<FormatedTime>();

  useEffect(() => {
    const eventSource = new EventSource(`/api/timer/${id}`);

    eventSource.addEventListener("upd", (e) => {
      setTime(format.formatMs(e.data));
    });

    eventSource.addEventListener("sts", (e) => {
      console.log(e.data);
    });

    eventSource.onerror = (error) => {
      console.error("EventSource failed:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [id]);

  return (
    <div
      className={"timer"}
    >{`${time?.hours}h ${time?.minutes}m ${time?.seconds}s ${time?.milliseconds}ms`}</div>
  );
};
