"use client";

import { toast } from "sonner";
import { ALERT_MARKS } from "@/components/flow/ui/alert";
import { DoneBadge } from "@/components/flow/done-badge";

/** A short confirmation in the same card as the fact toasts, so there's one toast style. */
export function notify({
  message,
  description,
  tone = "success",
}: {
  message: string;
  description?: string;
  tone?: "success" | "error";
}) {
  toast.custom(
    () => (
      <div
        role={tone === "error" ? "alert" : "status"}
        className="flex w-[356px] max-w-[calc(100vw-32px)] items-start gap-3 rounded-[18px] bg-card p-3.5 shadow-[var(--elevation-floating)]"
      >
        <ToastGlyph tone={tone} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{message}</p>
          {description && <p className="truncate text-[13px] text-ink-2">{description}</p>}
        </div>
      </div>
    ),
    { duration: 3500 },
  );
}

/**
 * The glyphs Kobra's own toast uses: its status badge for success and its alert
 * mark for errors. Silent: the press that raised the toast made its own sound.
 */
function ToastGlyph({ tone }: { tone: "success" | "error" }) {
  if (tone === "error") {
    const Mark = ALERT_MARKS.error;
    return <Mark className="size-5 shrink-0 text-error" aria-hidden />;
  }
  return (
    <span className="mt-0.5">
      <DoneBadge size={16} chime={false} />
    </span>
  );
}
