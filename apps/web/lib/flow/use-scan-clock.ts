"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Stand-in for a realtime subscription to the scan run. Returns elapsed ms of
 * the (simulated) run, multiplied by `speed`. Ticks at ~10fps, which is all the
 * UI needs: every animation itself is CSS/motion driven, not per-frame.
 */
export function useScanClock({
  running,
  speed,
  duration,
  runKey,
}: {
  running: boolean;
  speed: number;
  duration: number;
  runKey: number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [seenKey, setSeenKey] = useState(runKey);
  const elapsedRef = useRef(0);
  const lastRef = useRef<number | null>(null);
  const keyRef = useRef(runKey);

  // A new run starts from zero (state adjusted during render, not in an effect)
  if (seenKey !== runKey) {
    setSeenKey(runKey);
    setElapsed(0);
  }

  useEffect(() => {
    if (keyRef.current !== runKey) {
      keyRef.current = runKey;
      elapsedRef.current = 0;
      lastRef.current = null;
    }
    if (!running) {
      lastRef.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      const last = lastRef.current ?? now;
      lastRef.current = now;
      elapsedRef.current = Math.min(duration, elapsedRef.current + (now - last) * speed);
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= duration) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [running, speed, duration, runKey]);

  return elapsed;
}
