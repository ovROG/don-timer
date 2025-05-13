"use client";
import { useRef, useEffect } from "react";

export const useFrameUpdate = (callback: (dt: number) => void) => {
  const callbackRef = useRef(callback);
  const frameRef = useRef<number>();
  const timerRef = useRef<number>();

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const loop = (timestamp: number) => {
      frameRef.current = requestAnimationFrame(loop);

      let dt = 0;
      if (timerRef.current !== undefined && timerRef.current !== null)
        dt = timestamp - timerRef.current;

      const callback = callbackRef.current;
      callback(dt);

      timerRef.current = timestamp;
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current!);
  }, []);
};
