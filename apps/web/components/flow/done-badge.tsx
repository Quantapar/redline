"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { StatusBadge, type CheckState } from "@/components/flow/ui/spinner";

/**
 * Kobra's status badge for "that worked": mounted loading and filled a beat
 * later, so the check draws itself as it appears. It chimes the success cue
 * unless the press that caused it already made its own sound.
 */
export function DoneBadge({
  size = 22,
  label = "Done",
  chime = true,
}: {
  size?: number;
  label?: string;
  chime?: boolean;
}) {
  const [state, setState] = useState<CheckState>("loading");

  useEffect(() => {
    const id = window.setTimeout(() => setState("done"), 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <span className="flex shrink-0" style={{ "--check-size": `${size}px` } as CSSProperties}>
      <StatusBadge state={state} chime={chime} label={label} />
    </span>
  );
}
