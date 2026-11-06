"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Calculator, Check, Copy, Gauge, KeyRound, RefreshCcw, ShieldAlert, Zap, type LucideIcon } from "lucide-react";
import { EASE_OUT as ease } from "@/lib/flow/motion";
import { formatEth, timeAgo, WEAKNESS_LABEL } from "@/lib/format";
import { agentPrompt, findingVerdict, isUnreplayed, type ReportArea, type ReportFinding, type Verdict } from "@/lib/report";
import { Badge } from "@/components/flow/ui/badge";
import { Button } from "@/components/flow/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/flow/ui/card";
import { notify } from "@/components/flow/notify";
import { cn } from "@/lib/flow/utils";

/** What /api/onboarding/report returns. */
export type Report = {
  repo: string | null;
  scan: { id: string; status: string; commitSha: string; contracts: number; finishedAt?: string | null };
  score: number;
  label: string;
  areas: ReportArea[];
  fixes: ReportFinding[];
  attacks: number;
  /** Referee runs that actually executed on a fork. Absent from older payloads. */
  replays?: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The line under the headline when nothing was proven, stating only what the
 * scan recorded: how much was attacked, whether anything really ran on a fork,
 * and what is left unresolved below.
 */
function summaryLine(report: Report): string {
  const contracts = plural(report.scan.contracts, "contract");
  if (report.attacks === 0) return `No exploit was drafted against ${contracts}, so there was nothing to replay.`;
  const replayed = report.replays === undefined || report.replays > 0;
  const lead = replayed
    ? `We attacked ${contracts} with ${plural(report.attacks, "exploit")} and replayed them on a mainnet fork.`
    : `We drafted ${plural(report.attacks, "exploit")} against ${contracts}, but none could be replayed on a fork.`;
  const unconfirmed = report.fixes.filter(isUnreplayed).length;
  const shaky = report.fixes.length - unconfirmed;
  const open = [
    shaky && `${plural(shaky, "finding")} only partly reproduced`,
    unconfirmed && `${plural(unconfirmed, "finding")} still unconfirmed`,
  ].filter(Boolean);
  if (open.length) return `${lead} ${open.join(" and ")}; ${report.fixes.length === 1 ? "it’s" : "they’re"} below.`;
  return replayed ? `${lead} None of them took anything.` : lead;
}

const TILE = "gap-0 rounded-[24px] bg-white/[0.03] py-0 shadow-none ring-0";
const TILE_PANEL = "flex-1 rounded-[16px] bg-card shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.3)]";

const AREA_ICON: Record<string, LucideIcon> = {
  reentrancy: RefreshCcw,
  "access-control": KeyRound,
  "price-oracle-manipulation": Gauge,
  "integer-overflow": Calculator,
  "flash-loan": Zap,
};

const VERDICT_BADGE: Record<Verdict, { label: string; variant: "destructive" | "amber" | "green" }> = {
  red: { label: "RED", variant: "destructive" },
  warn: { label: "WARN", variant: "amber" },
  ok: { label: "OK", variant: "green" },
};

function areaDetail(a: ReportArea): string {
  if (a.verdict === "red") return a.findings === 1 ? "an exploit moved funds" : `${a.findings} exploits moved funds`;
  if (a.verdict === "warn") {
    return a.unreplayed && a.unreplayed === a.findings
      ? "flagged, but no referee could replay it yet"
      : "some referees reproduced it, not all";
  }
  return "attacked, nothing moved";
}

/* -------------------------------- Score ring ------------------------------- */
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

/* --------------------------------- The report ------------------------------ */

export function ReportView({ report, repoName }: { report: Report; repoName: string }) {
  const reduce = useReducedMotion();
  const rise = (delay: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(10px)" },
    animate: { opacity: 1, transform: "translateY(0px)" },
    transition: { duration: 0.5, ease, delay },
  });
  const repo = report.repo ?? repoName;
  const top = report.fixes[0];
  const proven = report.fixes.filter((f) => f.isRed);

  return (
    <div data-component="Report">
      <header>
        <motion.h1
          {...rise(0.08)}
          className="max-w-[900px] text-[32px] leading-[1.08] font-medium tracking-[-0.03em] text-ink text-balance sm:text-[52px]"
        >
          {top?.isRed
            ? top.title
            : report.replays === 0
              ? `Nothing was proven in ${repoName} yet.`
              : `No exploit moved money in ${repoName}.`}
        </motion.h1>
        <motion.p {...rise(0.16)} className="mt-5 max-w-[900px] text-lg leading-relaxed text-ink-2 text-balance">
          {top?.isRed
            ? `${top.plainSentence}${top.movedWei !== "0" ? ` ${formatEth(top.movedWei)} moved, and` : ""} ${top.agreementCount} of ${top.refereeCount} referees reproduced it on a mainnet fork.`
            : summaryLine(report)}
        </motion.p>
        {/* When this attack ran: an older scan must never read as one that just happened */}
        <motion.p {...rise(0.2)} className="mt-3 text-sm text-ink-3">
          From the attack on commit <span className="font-mono">{report.scan.commitSha.slice(0, 7)}</span>
          {report.scan.finishedAt ? `, ${timeAgo(report.scan.finishedAt)}` : ""}.
        </motion.p>
      </header>

      <motion.section {...rise(0.24)} className="mt-12" aria-labelledby="stand-heading">
        <h2 id="stand-heading" className="text-xl font-medium tracking-[-0.01em] text-ink">
          Where you stand
        </h2>
        <Card className={cn(TILE, "mt-4")}>
          <CardHeader className="grid min-h-[116px] grid-cols-[auto_1fr] content-center items-center gap-x-4 px-6 pt-6 pb-5">
            <ScoreRing score={report.score} />
            <div>
              <CardTitle className="text-[15px] font-medium text-ink">{report.label}</CardTitle>
              <CardDescription className="mt-0.5 text-[13px] text-ink-3">
                Redline score: {report.score} out of 100, from {proven.length} proven{" "}
                {proven.length === 1 ? "exploit" : "exploits"} on {repo}
              </CardDescription>
            </div>
          </CardHeader>
          {report.areas.length > 0 && (
            <CardContent className="flex flex-1 flex-col px-2 pb-2">
              <ul className={cn(TILE_PANEL, "flex flex-col justify-center px-4 py-1.5")}>
                {report.areas.map((a) => {
                  const Icon = AREA_ICON[a.weaknessClass] ?? ShieldAlert;
                  const badge = VERDICT_BADGE[a.verdict];
                  return (
                    <li key={a.weaknessClass} className="group flex items-center gap-3.5">
                      <span
                        aria-hidden
                        className="t-raise t-raise-secondary relative isolate grid size-9 shrink-0 place-items-center rounded-[10px] text-ink-2 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]"
                      >
                        <Icon className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-3 border-t border-border/70 py-3 group-first:border-t-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] text-ink">{WEAKNESS_LABEL[a.weaknessClass] ?? a.weaknessClass}</p>
                          <p className="truncate text-[13px] text-ink-3">{areaDetail(a)}</p>
                        </div>
                        <Badge variant={badge.variant} className="tabular-nums">
                          {badge.label}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          )}
        </Card>
      </motion.section>

      {report.fixes.length > 0 && (
        <motion.section {...rise(0.32)} data-component="Fixes" aria-labelledby="fixes-heading" className="mt-16">
          <h2 id="fixes-heading" className="text-xl font-medium tracking-[-0.01em] text-ink">
            Fix these first
          </h2>
          <ol className="mt-4 space-y-3">
            {report.fixes.map((f, i) => (
              <FixCard key={f.id} index={i + 1} finding={f} repo={repo} />
            ))}
          </ol>
        </motion.section>
      )}
    </div>
  );
}

/* --------------------------------- Fix cards ------------------------------- */

// Each fix's number sits on Kobra's raised surface, like its secondary button
const STEP_NUMBER =
  "t-raise t-raise-secondary relative isolate grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium text-ink-2 tabular-nums before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit]";

function FixCard({ index, finding: f, repo }: { index: number; finding: ReportFinding; repo: string }) {
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const verdict = findingVerdict(f);
  const unreplayed = isUnreplayed(f);

  async function copy() {
    try {
      await navigator.clipboard.writeText(agentPrompt(repo, f));
      setCopied("copied");
      notify({ message: "Fix copied", description: "Paste it into your coding agent" });
    } catch {
      setCopied("failed");
      notify({ message: "Couldn’t copy", description: "Your browser blocked the clipboard", tone: "error" });
    }
    window.setTimeout(() => setCopied("idle"), 1800);
  }

  return (
    <li data-component="FixCard" className="surface rounded-2xl p-5 sm:p-6">
      <div className="flex gap-4">
        <span className={STEP_NUMBER}>{index}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-medium text-ink text-pretty">{f.title}</h3>
          <p className="mt-1 text-ink-2 text-pretty">{f.plainSentence}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-3">
            {f.targetContract && (
              <span className="font-mono text-[13px]">
                {f.targetContract}
                {f.targetFunction ? `.${f.targetFunction}()` : ""}
              </span>
            )}
            <span>
              {unreplayed ? "No referee could replay it" : `${f.agreementCount} of ${f.refereeCount} referees`}
            </span>
            <Badge size="sm" variant={verdict === "red" ? "destructive" : unreplayed ? "neutral" : "amber"}>
              {verdict === "red" ? "Proven" : unreplayed ? "Unconfirmed" : "Likely"}
            </Badge>
          </p>
          <div className="mt-5">
            <Button type="button" variant="secondary" size="md" onClick={copy} data-sound="copy">
              {copied === "copied" ? (
                <Check className="size-4 text-good" strokeWidth={2} aria-hidden />
              ) : (
                <Copy className="size-4" strokeWidth={1.75} aria-hidden />
              )}
              <span aria-live="polite">
                {copied === "copied" ? "Copied" : copied === "failed" ? "Couldn’t copy" : "Copy fix for agent"}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
