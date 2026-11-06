"use client";

import { AnimatePresence, motion } from "motion/react";
import { Star } from "lucide-react";
import { ranking, reviews, websiteLines, business, type StepId } from "@/lib/flow/fleet";
import { BusinessMark } from "@/components/flow/brand";
import { GoogleLogo } from "@/components/flow/logos";
import { EASE_EXIT, EASE_OUT as ease } from "@/lib/flow/motion";
import { InspectorOverlay, type InspectItem } from "./inspector-overlay";

// What the inspector names each part of Fleet's homepage, in reading order
const INSPECT: InspectItem[] = [
  { id: "banner", kind: "TEXT", at: 6_000 },
  { id: "logo", kind: "IMG", at: 6_800 },
  { id: "headline", kind: "H1", at: 7_600 },
  { id: "sub", kind: "P", at: 9_400 },
  { id: "order", kind: "BUTTON", at: 11_400 },
  { id: "hours", kind: "TEXT", at: 13_200 },
  { id: "congress", kind: "TEXT", at: 15_000 },
];

// Three scenes for six steps, so the picture changes twice, not five times.
// The status line above still names each step as it runs.
type Scene = "website" | "reviews" | "ranking";
const SCENE: Record<StepId, Scene> = {
  google: "website",
  website: "website",
  reviews: "reviews",
  competitors: "ranking",
  social: "ranking",
  ads: "ranking",
};

/**
 * What the scan is reading: Fleet's homepage, read line by line; their reviews,
 * with the praise highlighted; then who shows up above them on Google.
 */
export function ScanStage({ step, elapsed }: { step: StepId; elapsed: number }) {
  const scene = SCENE[step];
  return (
    // Fills its slot on the page, top-aligned. Whatever runs past the bottom
    // fades out rather than being cut off.
    <div data-component="ScanStage" className="h-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-48px),transparent)]">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={scene}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_EXIT } }}
          transition={{ duration: 0.5, ease }}
          className="w-full"
        >
          {scene === "website" && <WebsiteVisual elapsed={elapsed} />}
          {scene === "reviews" && <ReviewsVisual elapsed={elapsed} />}
          {scene === "ranking" && <RankingVisual elapsed={elapsed} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* --------------------------------- Website --------------------------------- */

function WebsiteVisual({ elapsed }: { elapsed: number }) {
  const read = (id: string) => elapsed >= (websiteLines.find((l) => l.id === id)?.at ?? Infinity);

  return (
    <div className="surface-floating mx-auto max-w-xl overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-2.5 shadow-[inset_0_-1px_0_var(--border)]">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <p className="flex-1 truncate rounded-md bg-paper px-2.5 py-1 text-center font-mono text-xs text-ink-2">
          {business.website}
        </p>
      </div>

      {/* Their page, re-rendered from the scrape. Their words are in serif.
          The inspector outlines each part as it's read. */}
      <div className="relative">
        <div className="bg-ink px-4 py-2 text-center text-[11px] font-semibold tracking-[0.08em] text-white uppercase">
          <span className="mark-sweep px-0.5 [--mark:rgb(255_255_255/0.28)]" data-read={read("banner")} data-scan-line="banner">
            // SPDX-License-Identifier: MIT · src/VaultCore.sol
          </span>
        </div>
        <div className="px-6 pt-6 pb-6 sm:px-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span data-scan-line="logo" className="mb-5 inline-flex h-[47px] w-[72px] items-center justify-center rounded-md bg-secondary font-mono text-[14px] font-semibold text-ink outline-none">{"</>"}</span>
          <h3 className="font-serif text-[28px] leading-[1.15] text-ink text-balance sm:text-[34px]">
            <span className="mark-sweep" data-read={read("headline")} data-scan-line="headline">
              contract VaultCore is ReentrancyGuard
            </span>
          </h3>
          <p className="mt-3 font-serif text-lg leading-snug text-ink-2 text-pretty">
            <span className="mark-sweep" data-read={read("sub")} data-scan-line="sub">
              function withdraw(uint256 amount) external
            </span>
          </p>
          <p className="mt-5 inline-block rounded-md bg-ink px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] text-white uppercase">
            <span className="mark-sweep [--mark:rgb(255_255_255/0.28)]" data-read={read("order")} data-scan-line="order">
              Order online for pickup
            </span>
          </p>
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <p className="leading-snug text-ink-2">
              <span className="mark-sweep" data-read={read("hours")} data-scan-line="hours">
                <span className="font-medium text-ink">withdraw()</span> · src/VaultCore.sol · external payable
              </span>
            </p>
            <p className="leading-snug text-ink-2">
              <span className="mark-sweep" data-read={read("congress")} data-scan-line="congress">
                <span className="font-medium text-ink">Congress Ave</span> · Mon–Thu 7am–4pm · Fri 8am–3pm · Closed weekends
              </span>
            </p>
          </div>
        </div>
        <InspectorOverlay items={INSPECT} elapsed={elapsed} />
      </div>
    </div>
  );
}

/* --------------------------------- Reviews --------------------------------- */

function ReviewsVisual({ elapsed }: { elapsed: number }) {
  return (
    <ul className="mx-auto grid max-w-md gap-3">
      {reviews.map((r) => {
        const [before, after] = r.text.split(r.mark);
        return (
          <li key={r.id} className="surface rounded-2xl px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">{r.author}</p>
              <p className="flex gap-0.5 text-[oklch(0.76_0.15_75)]" role="img" aria-label={`${r.stars} out of 5 stars`}>
                {Array.from({ length: r.stars }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-current" />
                ))}
              </p>
            </div>
            <p className="mt-2 font-serif text-[17px] leading-snug text-ink-2 text-pretty">
              {before}
              {/* The praise worth repeating, highlighted as each review is read */}
              <span className="mark-sweep text-ink" data-read={elapsed >= r.at + 700}>
                {r.mark}
              </span>
              {after}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------------- Ranking --------------------------------- */

function RankingVisual({ elapsed }: { elapsed: number }) {
  const youShown = elapsed >= ranking.youAt;
  return (
    <div className="mx-auto max-w-md">
      <div className="surface overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2.5 px-5 py-3 shadow-[inset_0_-1px_0_var(--border)]">
          <GoogleLogo className="size-4" />
          <p className="truncate text-sm text-ink-2">
            Searching <span className="text-ink">“{ranking.query}”</span>
          </p>
        </div>
        <ol className="divide-y divide-border">
          {ranking.above.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <p className="text-[15px] text-ink">{c.name}</p>
              <p className="shrink-0 text-sm text-ink-3">Above you</p>
            </li>
          ))}
          <li className="px-5 py-3.5">
            <p className="text-sm text-ink-2">{ranking.othersAbove} more attacks, also replayed</p>
          </li>
          <li className="flex items-center justify-between gap-3 bg-brand-soft px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BusinessMark className="size-8 rounded-lg" />
              <p className="truncate text-[15px] font-medium text-ink">VaultCore.sol</p>
            </div>
            {/* The one change in this scene: your place, once it's found */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={youShown ? "found" : "finding"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_EXIT } }}
                transition={{ duration: 0.3, ease }}
                className={
                  youShown
                    ? "shrink-0 text-[15px] font-medium text-brand tabular-nums"
                    : "shrink-0 text-sm text-ink-3"
                }
              >
                {youShown ? `#${ranking.you}` : "Finding you…"}
              </motion.p>
            </AnimatePresence>
          </li>
        </ol>
      </div>
      <p className="mt-3 text-center text-sm text-ink-2 text-pretty">
        The fork replays the top 3 attacks first.
      </p>
    </div>
  );
}

