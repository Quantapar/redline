"use client";

import { Button } from "@/components/flow/ui/button";
import { Spinner } from "@/components/flow/ui/spinner";
import { cn } from "@/lib/flow/utils";

/**
 * Kobra's button with a pending state: the label flips out and Kobra's spinner flips
 * in. The label is never rewritten, so the width never changes, and the button
 * stays at full strength: repeat presses are dropped by the caller instead of
 * disabling (and dimming) the control that's showing the state.
 */
export function PendingButton({
  pending,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button {...props} aria-busy={pending || undefined} className={className}>
      {/* The flip is clipped here, not on the button: Kobra's raised edge and
          shadow sit outside the button's box and overflow-hidden there cuts them off */}
      <span className="grid overflow-hidden">
        <span
          className={cn(
            "col-start-1 row-start-1 flex items-center justify-center gap-2 transition-[transform,opacity] duration-200 ease-[var(--ease-out)] motion-reduce:transition-opacity",
            pending && "-translate-y-full opacity-0 motion-reduce:translate-y-0",
          )}
        >
          {children}
        </span>
        <span
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 grid place-items-center transition-[transform,opacity] duration-200 ease-[var(--ease-out)] motion-reduce:transition-opacity",
            pending ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 motion-reduce:translate-y-0",
          )}
        >
          <Spinner className="size-4" />
        </span>
      </span>
    </Button>
  );
}
