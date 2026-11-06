"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { GithubRepo } from "@/lib/github-target";
import { useScanClock } from "@/lib/flow/use-scan-clock";
import { ScanBento } from "./scan-bento";
import { GithubMark } from "./github-mark";
import { HEADING } from "./setup-shell";
import { Button } from "@/components/flow/ui/button";
import { Spinner } from "@/components/flow/ui/spinner";

/** What /api/onboarding/status reports for the connected repo. */
export type ScanProgress = {
  id: string;
  status: "queued" | "preparing" | "static-analysis" | "hunting" | "verifying" | "judging" | "complete" | "failed" | "cancelled";
  commitSha: string;
  contracts: number;
  attacks: number;
  refereeRuns: number;
  /** Redline posted a check run on the commit (absent from older payloads: treat as not posted). */
  checkPosted?: boolean;
  checkUrl: string;
};
type Status = { connected: false } | { connected: true; fullName: string; scan: ScanProgress | null };

const POLL_MS = 3000;
// Connected but no scan after this long: the default branch has no contracts
const NO_SCAN_AFTER_MS = 30_000;

const STAGES: ScanProgress["status"][] = ["queued", "preparing", "static-analysis", "hunting", "verifying", "judging"];
const TERMINAL = new Set<ScanProgress["status"]>(["complete", "failed", "cancelled"]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function stageLine(s: ScanProgress): string {
  switch (s.status) {
    case "queued":
      return "Queued, waiting for a free attacker";
    case "preparing":
      return `Reading ${plural(s.contracts, "contract")} from your default branch`;
    case "static-analysis":
      return "Mapping every external call and state write";
    case "hunting":
      return s.attacks
        ? `Agents are attacking: ${plural(s.attacks, "exploit")} drafted so far`
        : `Agents are attacking ${plural(s.contracts, "contract")}`;
    case "verifying":
      return `Replaying each exploit on a mainnet fork: ${plural(s.refereeRuns, "referee run")} so far`;
    case "judging":
      return "Measuring what each exploit actually moved";
    default:
      return "Wrapping up";
  }
}

export function LiveAttack({
  repo,
  installUrl,
  onDone,
}: {
  repo: GithubRepo;
  installUrl: string | null;
  onDone: (scan: ScanProgress) => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const connectedAt = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const done = useRef(onDone);
  done.current = onDone;

  // Poll until the scan reaches an end; GitHub's webhooks drive it, not us
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const res = await fetch(`/api/onboarding/status?repo=${repo.id}`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as Status;
          if (stop) return;
          setStatus(s);
          setNow(Date.now());
          if (s.connected && connectedAt.current == null) connectedAt.current = Date.now();
          if (s.connected && s.scan && TERMINAL.has(s.scan.status)) return done.current(s.scan);
        }
      } catch {
        // A dropped poll is retried on the next tick
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [repo.id]);

  const scan = status?.connected ? status.scan : null;
  const elapsed = useScanClock({ running: true, speed: 1, duration: Number.MAX_SAFE_INTEGER, runKey: 0 });

  const waitingForInstall = !status || !status.connected;
  const noContracts =
    status?.connected && !scan && connectedAt.current != null && now - connectedAt.current > NO_SCAN_AFTER_MS;
  const stageIndex = scan ? Math.max(0, STAGES.indexOf(scan.status)) : 0;
  const progress = scan ? (stageIndex + 0.5) / STAGES.length : 0;

  let title: string;
  let line: string;
  if (waitingForInstall) {
    title = `Finish connecting ${repo.name}`;
    line = "Install Redline in the GitHub tab. The attack starts the moment it’s connected.";
  } else if (noContracts) {
    title = `${repo.name} is connected`;
    line = "There are no contracts on its default branch yet. We’ll attack the next push that changes one.";
  } else if (!scan) {
    title = `${repo.name} is connected`;
    line = "Getting the attack ready";
  } else {
    title = `Stand by for ${repo.name}’s report`;
    line = stageLine(scan);
  }

  return (
    <div
      data-component="LiveAttack"
      className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[760px] flex-col px-5 pt-[clamp(16px,3vh,36px)] pb-[calc(max(16px,env(safe-area-inset-bottom))+72px)] sm:px-0 md:h-[calc(100dvh-4rem)]"
    >
      <header className="text-center">
        <h1 className={HEADING}>{title}</h1>
        <p className="mx-auto mt-3 flex max-w-[520px] items-center justify-center gap-2 text-[17px] text-ink-2 text-pretty" aria-live="polite">
          {(waitingForInstall || (!scan && !noContracts)) && <Spinner className="size-4 shrink-0" />}
          {line}
        </p>
        {scan && (
          <div
            role="progressbar"
            aria-label="Attack progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="relative mx-auto mt-5 h-1 max-w-[320px] overflow-hidden rounded-full bg-muted"
          >
            <div
              className="absolute inset-0 rounded-full bg-ink will-change-transform"
              style={{ transform: `translateX(${(progress - 1) * 100}%)`, transition: "transform 600ms var(--ease-out)" }}
            />
          </div>
        )}
        {waitingForInstall && installUrl && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => window.open(installUrl, "_blank")?.focus()}
          >
            <GithubMark className="size-3.5" />
            Open GitHub again
          </Button>
        )}
      </header>

      <div className="relative mt-6 flex-1 md:min-h-0">
        <ScanBento elapsed={elapsed} finished={false} repo={repo.fullName} />
      </div>

      {/* Like any review bot, the attack also runs as a check on the commit */}
      <div className="mx-auto mt-4 flex w-full max-w-[640px] shrink-0 items-center gap-3 rounded-[16px] bg-muted p-2 ps-4">
        <GithubMark className="size-4 shrink-0 text-ink-2" />
        <p className="flex-1 text-sm text-ink-2 text-pretty">
          {scan?.checkPosted ? (
            <>
              Live on GitHub as the <span className="text-ink">Redline</span> check on{" "}
              <span className="font-mono text-ink">{scan.commitSha.slice(0, 7)}</span>. You can close this tab.
            </>
          ) : scan ? (
            <>
              Attacking commit <span className="font-mono text-ink">{scan.commitSha.slice(0, 7)}</span> on {repo.name}.
            </>
          ) : (
            <>Once connected, pushes to {repo.name} are attacked and reported as a Redline check on GitHub.</>
          )}
        </p>
        {scan?.checkPosted && (
          <Button size="sm" variant="secondary" nativeButton={false} render={<a href={scan.checkUrl} target="_blank" rel="noreferrer" />}>
            View check
            <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
