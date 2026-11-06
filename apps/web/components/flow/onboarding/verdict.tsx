"use client";

import * as React from "react";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Lock } from "lucide-react";
import { fixes, ranking, TOTAL_FIXES, type Fix, type Location } from "@/lib/flow/fleet";
import { EASE_EXIT, EASE_OUT as ease, nudge } from "@/lib/flow/motion";
import { PendingButton } from "./pending-button";
import { Badge, badgeVariants } from "@/components/flow/ui/badge";
import { Button } from "@/components/flow/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/flow/ui/card";
import { Input } from "@/components/flow/ui/input";
import { Separator } from "@/components/flow/ui/separator";
import { Caption, createTooltipHandle, Tooltip, TooltipContent, TooltipTrigger } from "@/components/flow/ui/tooltip";
import { StreamingText } from "@/components/flow/ui/streaming-text";
import { DoneBadge } from "@/components/flow/done-badge";
import { notify } from "@/components/flow/notify";
import { BusinessMark } from "@/components/flow/brand";
import { GoogleAdsLogo, GoogleLogo, GoogleMapsLogo, InstagramLogo } from "@/components/flow/logos";
import { cn } from "@/lib/flow/utils";

// React's <ViewTransition> only ships in its canary/experimental builds, which
// Next bundles only with experimental.viewTransition on. Without it the import
// is undefined and the verdict crashed; fall back to rendering the children.
const ViewTransition: React.ComponentType<{ children?: React.ReactNode; update?: string; default?: string }> =
  (React as unknown as { ViewTransition?: React.ComponentType<{ children?: React.ReactNode; update?: string; default?: string }> })
    .ViewTransition ?? (({ children }) => <>{children}</>);

const SCORE = 51;

/** Both scorecard headers share this, so their hairlines sit on one line */
const SCORE_HEADER = "min-h-[116px] content-center px-6 pt-6 pb-5";

/** The Live Read's bento tile exactly (flat fill, no border, no shadow), and the
 *  white panel inside it, shadowed like the Live Read's white objects */
const TILE = "gap-0 rounded-[24px] bg-black/[0.035] py-0 shadow-none ring-0";
// Filled like the phone screen in the Live Read: translucent white over the
// tile, no border, no shadow. Radius stays concentric with the tile
const TILE_PANEL = "flex-1 rounded-[16px] bg-white/70";
const TILE_TITLE = "text-[15px] font-medium text-ink";
const TILE_COPY = "mt-0.5 text-[13px] text-ink-3";

const areas = [
  { label: "Reentrancy", detail: "withdraw() drains the vault", value: "RED", tone: "destructive", Logo: GoogleLogo },
  { label: "Access control", detail: "setOracle is gated", value: "OK", tone: "green", Logo: GoogleMapsLogo },
  { label: "Arithmetic", detail: "no overflow found", value: "OK", tone: "green", Logo: InstagramLogo },
  { label: "Oracle", detail: "single price source", value: "WARN", tone: "amber", Logo: GoogleAdsLogo },
] as const;

export function Verdict({ location, email }: { location: Location; email: string }) {
  const reduce = useReducedMotion();
  const [intent, setIntent] = useState<"save" | "post">("save");
  const [saved, setSaved] = useState(false);
  const saveRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rise = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(10px)" },
    animate: { opacity: 1, transform: "translateY(0px)" },
    transition: { duration: 0.5, ease, delay },
  });

  return (
    <div data-component="Verdict" className="mx-auto w-full max-w-[1120px] px-5 pt-8 pb-36 sm:px-8 lg:pt-14">
      {/* ------------------------------ The answer ---------------------------- */}
      <header>
        <motion.h1
          {...rise(0.08)}
          className="max-w-[900px] text-[32px] leading-[1.08] font-medium tracking-[-0.03em] text-ink text-balance sm:text-[52px]"
        >
          A reentrancy attack drains vault-core on a mainnet fork.
        </motion.h1>
        <motion.p {...rise(0.16)} className="mt-5 max-w-[900px] text-lg leading-relaxed text-ink-2 text-balance">
          withdraw() sends ETH before it zeroes the balance, so a malicious fallback re-enters
          and empties the vault. 125.5 ETH moved, and 5 of 5 referees reproduced it on a
          mainnet fork.
        </motion.p>
      </header>

      {/* ------------------------------ Scorecard ----------------------------- */}
      {/* Two Kobra cards as bento tiles, like the Live Read: how the business is
          doing, and who is beating it. The heading sits on the flat grey tile and
          the content on a white panel inside it */}
      <motion.section {...rise(0.24)} aria-labelledby="standing-heading" className="mt-12 lg:mt-14">
        <h2 id="standing-heading" className="text-xl font-medium tracking-[-0.01em] text-ink">
          Where you stand
        </h2>
        <div data-component="ScoreStrip" className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card className={TILE}>
          <CardHeader className={cn(SCORE_HEADER, "grid-cols-[auto_1fr] items-center gap-x-4")}>
            <ScoreRing score={SCORE} />
            <div>
              <CardTitle className={TILE_TITLE}>Needs work</CardTitle>
              <CardDescription className={TILE_COPY}>Online health score: {SCORE} out of 100</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-2 pb-2">
            {/* Rows like a settings list: a logo tile leads each one, and the
                hairlines start after it */}
            <ul className={cn(TILE_PANEL, "flex flex-col justify-center px-4 py-1.5")}>
              {areas.map((a) => (
                <li key={a.label} className="group flex items-center gap-3.5">
                  {/* Kobra's raised surface, the same edge and shadow as its secondary button */}
                  <span
                    aria-hidden
                    className="t-raise t-raise-secondary relative isolate grid size-9 shrink-0 place-items-center rounded-[10px] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]"
                  >
                    <a.Logo className="size-[18px]" />
                  </span>
                  <div className="flex min-w-0 flex-1 items-center gap-3 border-t border-border/70 py-3 group-first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] text-ink">{a.label}</p>
                      <p className="truncate text-[13px] text-ink-3">{a.detail}</p>
                    </div>
                    <Badge variant={a.tone} className="tabular-nums">
                      {a.value}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className={TILE}>
          <CardHeader className={SCORE_HEADER}>
            <CardTitle className={TILE_TITLE}>Who shows up first</CardTitle>
            <CardDescription className={TILE_COPY}>Google search for “{ranking.query}”</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-2 pb-2">
            <div className={cn(TILE_PANEL, "flex flex-col justify-center px-4.5 pt-5 pb-6")}>
              <RankLadder you={location.name} />
              <p className="mt-5 text-[15px] leading-relaxed text-ink-2 text-pretty">
                <span className="text-ink">{ranking.above[0].name}</span> and{" "}
                <span className="text-ink">{ranking.above[1].name}</span> lead. You’re{" "}
                <span className="font-medium text-brand">{ranking.you}th</span>,{" "}
                {ranking.you - 3} places below the map box, which is all most people look at.
              </p>
            </div>
          </CardContent>
        </Card>
        </div>
      </motion.section>

      {/* ------------------------- Fixes + the way in -------------------------- */}
      <div className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <motion.section {...rise(0.32)} data-component="Fixes" aria-labelledby="fixes-heading" className="min-w-0">
          <h2 id="fixes-heading" className="text-xl font-medium tracking-[-0.01em] text-ink">
            Fix these first
          </h2>

          <ol className="mt-4 space-y-3">
            <ViewTransition update="expand" default="none">
            <FixCard
              index={1}
              fix={fixes[0]}
              onPost={() => {
                setIntent("post");
                saveRef.current?.scrollIntoView({
                  behavior: reduce ? "auto" : "smooth",
                  block: "nearest",
                });
                inputRef.current?.focus({ preventScroll: true });
              }}
            />
            </ViewTransition>
            {/* The cards below glide down when the first one grows */}
            {fixes.slice(1).map((fix, i) => (
              <ViewTransition key={fix.id} update="expand" default="none">
                <LockedFix index={i + 2} fix={fix} locked={!saved} />
              </ViewTransition>
            ))}
          </ol>

        </motion.section>

        {/* Beside the fixes on wide screens, so the way to unlock them never scrolls away */}
        <motion.div
          {...rise(0.4)}
          ref={saveRef}
          className="scroll-mt-24 scroll-mb-24 lg:sticky lg:top-[88px] lg:mt-11 lg:self-start"
        >
          <SaveReport
            inputRef={inputRef}
            email={email}
            location={location}
            intent={intent}
            onSaved={() => setSaved(true)}
          />
        </motion.div>
      </div>
    </div>
  );
}

/* -------------------------------- Rank ladder ------------------------------ */

/**
 * The search results as a row of places, 1 to where the business sits. The
 * first three are Google's map box, bracketed, because that's the cut that
 * matters, and all three share one style. The business's own place shows its
 * logo. Every other place names its café on hover or focus, in one tooltip below
 * the row that glides between places and morphs its name, rather than eight.
 */
const ladderTip = createTooltipHandle<string>();

function RankLadder({ you }: { you: string }) {
  const places = Array.from({ length: ranking.you }, (_, i) => {
    const rank = i + 1;
    const named = ranking.above[i];
    return rank === ranking.you
      ? { rank, name: you, kind: "you" as const }
      : named
        ? { rank, name: named.name, kind: "named" as const }
        : { rank, name: "Another café nearby", kind: "other" as const };
  });

  return (
    <div>
      {/* Bracket over the map box: spans the first 3 of 9 columns */}
      <div className="grid grid-cols-9 gap-1.5">
        <div className="col-span-3 flex flex-col items-center">
          <span className="text-xs text-ink-3">Map box</span>
          <span aria-hidden className="mt-1 h-1.5 w-full rounded-t-[4px] border-x border-t border-ink/20" />
        </div>
      </div>
      <ol className="mt-1 grid grid-cols-9 gap-1.5" aria-label="Places in the search results">
        {places.map((p) => {
          const tile = cn(
            badgeVariants({ variant: p.rank <= 3 ? "secondary" : "outline" }),
            "aspect-square h-auto w-full rounded-[8px] px-0 text-sm tabular-nums",
          );
          return (
            <li key={p.rank}>
              {p.kind === "you" ? (
                // Their own place: the logo and the "You" under it say it all, so no
                // tooltip. Kobra's raised layer sits over the logo, clear, so it keeps
                // the same light edge and shadow as its neighbors
                <span
                  role="img"
                  aria-label={`${p.rank}. ${p.name}, you`}
                  className={cn(tile, "p-0 before:z-10 before:bg-transparent!")}
                >
                  <BusinessMark className="size-full rounded-[8px]" />
                </span>
              ) : (
                <TooltipTrigger
                  handle={ladderTip}
                  payload={p.name}
                  render={<button type="button" aria-label={`${p.rank}. ${p.name}`} className={tile} />}
                >
                  {p.rank}
                </TooltipTrigger>
              )}
            </li>
          );
        })}
      </ol>
      <Tooltip handle={ladderTip}>
        {({ payload }) => (
          <TooltipContent side="bottom">
            <Caption>{payload ?? ""}</Caption>
          </TooltipContent>
        )}
      </Tooltip>
      <div className="mt-2 grid grid-cols-9 gap-1.5 text-xs text-ink-3">
        <span className="col-start-9 text-center font-medium text-brand">You</span>
      </div>
    </div>
  );
}

/* -------------------------------- Score ring ------------------------------- */

/**
 * Red to yellow to green along the score, on the same hues as the badges beside
 * it, lifted brighter because the ring is a shape to read at a glance, not text.
 * It's worked out from the number as it counts, so the ring warms as it fills:
 * red through 25, yellow at 50, green from 85, and blended in OKLCH between.
 */
const TONE_STOPS = [
  { at: 0, l: 0.62, c: 0.19, h: 27 },
  { at: 25, l: 0.62, c: 0.19, h: 27 },
  { at: 50, l: 0.77, c: 0.155, h: 75 },
  { at: 85, l: 0.66, c: 0.16, h: 152 },
  { at: 100, l: 0.66, c: 0.16, h: 152 },
];

function scoreTone(score: number) {
  const i = Math.max(1, TONE_STOPS.findIndex((s) => s.at >= score));
  const a = TONE_STOPS[i - 1];
  const b = TONE_STOPS[i] ?? a;
  const t = b.at === a.at ? 0 : Math.min(1, Math.max(0, (score - a.at) / (b.at - a.at)));
  const mix = (x: number, y: number) => (x + (y - x) * t).toFixed(3);
  const tone = `${mix(a.l, b.l)} ${mix(a.c, b.c)} ${mix(a.h, b.h)}`;
  // The track is the same color, faint, so it reads on the grey tile
  return { stroke: `oklch(${tone})`, track: `oklch(${tone} / 0.18)` };
}

function ScoreRing({ score }: { score: number }) {
  const reduce = useReducedMotion();
  const [counted, setCounted] = useState(0);
  const shown = reduce ? score : counted;
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(shown);

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const start = performance.now() + 300;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / 1100));
      setCounted(Math.round(score * (1 - Math.pow(1 - t, 4))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score, reduce]);

  return (
    <div className="relative size-[68px] shrink-0" role="img" aria-label={`Score: ${score} out of 100`}>
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone.track} strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
        />
      </svg>
      {/* The number sits on Kobra's raised surface, like the logo tiles beside it */}
      <span
        aria-hidden
        className="t-raise t-raise-secondary absolute inset-[12px] isolate grid place-items-center rounded-full text-lg font-medium text-ink tabular-nums before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]"
      >
        {shown}
      </span>
    </div>
  );
}

/* --------------------------------- Fix cards ------------------------------- */

// Each fix's number sits on Kobra's raised surface, like its secondary button
const STEP_NUMBER =
  "t-raise t-raise-secondary relative isolate grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium text-ink-2 tabular-nums before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]";

function Meta({ fix }: { fix: Fix }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
      <span>Takes {fix.effort}</span>
      <Badge size="sm" variant={fix.confidence === "Confirmed" ? "green" : "neutral"}>
        {fix.confidence}
      </Badge>
    </p>
  );
}

function FixCard({ index, fix, onPost }: { index: number; fix: Fix; onPost: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(fix.draft ?? "");
      setCopied("copied");
      notify({ message: "Post copied", description: "Paste it into your Google listing" });
    } catch {
      setCopied("failed");
      notify({ message: "Couldn’t copy", description: "Select the text and copy it instead", tone: "error" });
    }
    window.setTimeout(() => setCopied("idle"), 1800);
  }

  return (
    <li data-component="FixCard" className="surface rounded-2xl p-5 sm:p-6">
      <div className="flex gap-4">
        <span className={STEP_NUMBER}>
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-medium text-ink text-pretty">{fix.title}</h3>
          <p className="mt-1 text-ink-2 text-pretty">{fix.why}</p>
          <Meta fix={fix} />

            {open && fix.draft ? (
              <div className="mt-5 rounded-xl bg-paper p-1.5 shadow-[inset_0_0_0_1px_var(--border)]"
              >
                <div className="rounded-[8px] bg-card px-4 py-4 shadow-[0_1px_2px_rgb(20_20_30/0.06)]">
                  <StreamedText text={fix.draft} />
                </div>
                <div className="flex flex-wrap items-center gap-2 px-2 pt-2.5 pb-1">
                  <Button type="button" variant="secondary" size="md" onClick={onPost}>
                    Post it for me
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={copy}
                    data-sound="copy"
                    className="text-ink-2"
                  >
                    {copied === "copied" ? (
                      <Check className="size-4 text-good" strokeWidth={2} aria-hidden />
                    ) : (
                      <Copy className="size-4" strokeWidth={1.75} aria-hidden />
                    )}
                    <span aria-live="polite">
                      {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn’t copy" : "Copy text"}
                    </span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                {/* In a transition, so the card's view transition grows it open */}
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  data-sound="open"
                  onClick={() => startTransition(() => setOpen(true))}
                >
                  Write it for me
                </Button>
              </div>
            )}
        </div>
      </div>
    </li>
  );
}

/** Word-by-word reveal, so the draft feels written for them rather than pasted. */
function StreamedText({ text }: { text: string }) {
  const reduce = useReducedMotion();
  const words = text.split(" ");
  const [count, setCount] = useState(reduce ? words.length : 0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setCount((c) => {
        if (c >= words.length) {
          window.clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, 32);
    return () => window.clearInterval(id);
  }, [reduce, words.length]);

  return (
    <>
      <p className="sr-only">{text}</p>
      {/* Kobra fades each word in as it arrives. The full text sits underneath,
          invisible, so the box is the final size from the first word */}
      <p aria-hidden className="grid font-serif text-lg leading-relaxed text-ink text-pretty">
        <span className="invisible col-start-1 row-start-1">{text}</span>
        <StreamingText className="col-start-1 row-start-1">
          {words.slice(0, count).join(" ")}
        </StreamingText>
      </p>
    </>
  );
}

function LockedFix({ index, fix, locked }: { index: number; fix: Fix; locked: boolean }) {
  return (
    <li data-component="LockedFix" className="surface rounded-2xl p-5 sm:p-6">
      <div className="flex gap-4">
        <span className={STEP_NUMBER}>
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-medium text-ink text-pretty">{fix.title}</h3>
          {/* Unlocks in place once the report is saved: the blur lifts, nothing moves */}
          <div
            aria-hidden={locked}
            className={cn(
              "transition-[filter,opacity] duration-500 ease-[var(--ease-out)]",
              locked ? "pointer-events-none blur-[5px] select-none" : "blur-0",
            )}
          >
            <p className="mt-1 text-ink-2 text-pretty">{fix.why}</p>
            <Meta fix={fix} />
          </div>
          {locked && (
            <p className="sr-only">Save the report to see why this matters and how to fix it.</p>
          )}
        </div>
        <Lock
          className={cn(
            "mt-1 size-4 shrink-0 text-ink-3 transition-opacity duration-200",
            !locked && "opacity-0",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
    </li>
  );
}

/* -------------------------------- Save gate -------------------------------- */

function SaveReport({
  inputRef,
  email,
  location,
  intent,
  onSaved,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  email: string;
  location: Location;
  intent: "save" | "post";
  onSaved: () => void;
}) {
  const id = useId();
  const [done, setDone] = useState<null | { via: "email"; to: string } | { via: "google" }>(null);
  const [pending, setPending] = useState<null | "email" | "google">(null);
  const [error, setError] = useState("");
  const rowRef = useRef<HTMLDivElement>(null);

  async function finish(via: "email" | "google", to = "") {
    if (pending) return;
    setPending(via);
    await new Promise((r) => setTimeout(r, 800));
    setPending(null);
    setDone(via === "email" ? { via, to } : { via });
    onSaved();
    notify({
      message: "Report saved",
      description: via === "email" ? `Link sent to ${to}` : "Fixes 2 and 3 are unlocked",
    });
  }

  return (
    <div data-component="SaveReport" className="surface-floating rounded-3xl p-6">
      <AnimatePresence mode="popLayout" initial={false}>
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.3, ease }}
            role="status"
          >
            <div className="flex items-center gap-2.5">
              <DoneBadge label="Saved" />
              <p className="text-lg font-medium text-ink">
                {done.via === "email" ? "Check your inbox" : "Report saved"}
              </p>
            </div>
            <p className="mt-2 max-w-lg text-ink-2 text-pretty">
              {done.via === "email" ? (
                <>
                  We sent a link to <span className="text-ink">{done.to}</span>. It opens{" "}
                  {location.name}’s full report, with all {TOTAL_FIXES} fixes ready to go.
                </>
              ) : (
                <>
                  {location.name}’s report is in your Concision account, with all {TOTAL_FIXES} fixes
                  ready to go.
                </>
              )}
              {intent === "post"
                ? " Your Rainey St post is waiting at the top."
                : " Fixes 2 and 3 are unlocked."}
            </p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.15, ease: EASE_EXIT } }}
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
              finish("email", value);
            }}
          >
            <h2 className="text-lg font-medium tracking-[-0.01em] text-ink text-balance">
              {intent === "post" ? "Save the report to post this" : `Save ${location.name}’s report`}
            </h2>
            <p className="mt-1 text-[15px] text-ink-2 text-pretty">
              {intent === "post"
                ? "We’ll post it to your Google listing as soon as you’re in. No password, no card."
                : `See all ${TOTAL_FIXES} fixes, and let Concision do them for you. No password, no card.`}
            </p>
            <label htmlFor={id} className="sr-only">
              Email
            </label>
            <div ref={rowRef} className="mt-5 flex flex-col gap-2">
              <Input
                ref={inputRef}
                id={id}
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={email}
                placeholder="you@fleetcoffee.com"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={() => error && setError("")}
                className="h-12 rounded-[12px] bg-card px-4 text-base md:text-base"
              />
              <PendingButton
                type="submit"
                pending={pending === "email"}
                size="xl" className="w-full"
              >
                Save report
              </PendingButton>
            </div>
            {error && (
              <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-bad">
                {error}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3 text-sm text-ink-3" aria-hidden>
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
            <PendingButton
              type="button"
              pending={pending === "google"}
              onClick={() => finish("google")}
              variant="secondary"
              size="xl"
              className="mt-4 w-full"
            >
              <GoogleMark />
              Continue with Google
            </PendingButton>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.95 10.95 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
