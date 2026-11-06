"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DoneBadge } from "@/components/flow/done-badge";
import {
  steps,
  SCAN_DURATION,
  REAL_SCAN_SECONDS,
  type Location,
} from "@/lib/flow/fleet";
import { ScanBento } from "./scan-bento";
import { HEADING } from "./setup-shell";
import { Button } from "@/components/flow/ui/button";
import { Input } from "@/components/flow/ui/input";
import { EASE_EXIT, EASE_OUT as ease, nudge } from "@/lib/flow/motion";

export function LiveRead({
  location,
  elapsed,
  email,
  onEmail,
  onDone,
}: {
  location: Location;
  elapsed: number;
  email: string;
  onEmail: (email: string) => void;
  onDone: () => void;
}) {
  const finished = elapsed >= SCAN_DURATION;
  const activeIndex = Math.max(
    0,
    steps.findIndex((s) => elapsed < s.end),
  );
  // Nothing to confirm along the way: once the attack is done, on to the verdict
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (finished) doneRef.current();
  }, [finished]);

  const progress = Math.min(1, elapsed / SCAN_DURATION);
  const secondsLeft = Math.round((1 - progress) * REAL_SCAN_SECONDS);
  const timeLeft = finished
    ? "Done"
    : secondsLeft > 90
      ? `About ${Math.ceil(secondsLeft / 60)} min left`
      : secondsLeft > 45
        ? "About a minute left"
        : "Almost done";

  return (
    // One screen, read top to bottom: what's happening, the scan as a bento of
    // what it's doing, then a way out. On phones the bento stacks and the page scrolls.
    <div
      data-component="LiveRead"
      // Bottom padding clears the prototype bar
      className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[760px] flex-col px-5 pt-[clamp(16px,3vh,36px)] pb-[calc(max(16px,env(safe-area-inset-bottom))+72px)] sm:px-0 md:h-[calc(100dvh-4rem)]"
    >
      <header data-component="ScanProgress" className="text-center">
        <h1 className={HEADING}>Stand by for {location.name}’s report</h1>
        <p className="mt-3 text-[17px] text-ink-2" aria-live="polite">
          {`${steps[activeIndex].label}, ${timeLeft.charAt(0).toLowerCase()}${timeLeft.slice(1)}`}
        </p>
        {/* The fill slides in on the compositor rather than growing its width, and
            each 100ms tick of the scan clock glides over 120ms, so the bar moves
            continuously instead of stepping. Its rounded leading edge stays round */}
        <div
          role="progressbar"
          aria-label="Scan progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="relative mx-auto mt-5 h-1 max-w-[320px] overflow-hidden rounded-full bg-muted"
        >
          <div
            className="absolute inset-0 rounded-full bg-ink will-change-transform"
            style={{ transform: `translateX(${(progress - 1) * 100}%)`, transition: "transform 120ms linear" }}
          />
        </div>
      </header>

      {/* ------------------------------ Stage ----------------------------- */}
      <div className="relative mt-6 flex-1 md:min-h-0">
        <ScanBento elapsed={elapsed} finished={finished} />
      </div>

      <div className="mx-auto mt-4 w-full max-w-[640px]">
        <EmailCapture finished={finished} email={email} onEmail={onEmail} />
      </div>
    </div>
  );
}

/* ------------------------------- Email capture ----------------------------- */

function EmailCapture({
  finished,
  email,
  onEmail,
}: {
  finished: boolean;
  email: string;
  onEmail: (email: string) => void;
}) {
  const [error, setError] = useState("");
  const rowRef = useRef<HTMLDivElement>(null);
  const id = useId();

  return (
    <div data-component="EmailCapture" className="shrink-0 rounded-[16px] bg-muted p-2 sm:ps-4">
      <AnimatePresence mode="wait" initial={false}>
        {email ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease }}
            className="flex min-h-11 items-center gap-3 ps-2 sm:ps-0"
            aria-live="polite"
          >
            <DoneBadge label="Email saved" />
            <p className="text-sm text-ink-2 text-pretty">
              We’ll send the report to <span className="text-ink">{email}</span>
              {finished ? "." : ". Feel free to close this tab."}
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            exit={{
              opacity: 0,
              transition: { duration: 0.15, ease: EASE_EXIT },
            }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("email") ?? "").trim();
              if (!/^\S+@\S+\.\S+$/.test(value)) {
                setError(value ? "That email is missing something. Check for typos." : "Add the email to send the report to.");
                nudge(rowRef.current);
                return;
              }
              setError("");
              // The bar itself turns into the confirmation, so no toast on top of it
              onEmail(value);
            }}
          >
            <div ref={rowRef} className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={id} className="ps-2 text-[15px] text-ink sm:ps-0">
                {finished ? "Want a copy by email?" : "Don’t want to wait?"}
              </label>
              <div className="flex min-w-[260px] flex-1 gap-2">
                <Input
                  id={id}
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@acme-defi.xyz"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={() => error && setError("")}
                  className="h-11 flex-1 rounded-[12px] bg-card px-3.5 text-base md:text-base"
                />
                <Button type="submit" size="xl">
                  Email me
                </Button>
              </div>
            </div>
            {error && (
              <p id={`${id}-error`} role="alert" className="mt-2 px-2 text-sm text-bad sm:px-0">
                {error}
              </p>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
