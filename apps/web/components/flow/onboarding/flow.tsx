"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { locations, SCAN_DURATION, type Location } from "@/lib/flow/fleet";
import { useScanClock } from "@/lib/flow/use-scan-clock";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { ConcisionLogo } from "@/components/flow/brand";
import { SoundToggle } from "@/components/flow/ui/sound";
import { FindBusiness } from "./find-business";
import { ConfirmBusiness } from "./confirm-business";
import { PickRepo } from "./pick-repo";
import { LiveAttack, type ScanProgress } from "./live-attack";
import { ConnectedVerdict } from "./connected-verdict";
import type { GithubAccount, GithubRepo } from "@/lib/github-target";
import { LiveRead } from "./live-read";
import { Verdict } from "./verdict";
import { Dots, SETUP_STEPS } from "./setup-shell";
import type { FactDecisions } from "./types";
import { cn } from "@/lib/flow/utils";

type Stage = "find" | "confirm" | "scan" | "verdict";

const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: "find", label: "Repo", short: "Repo" },
  { id: "confirm", label: "Target", short: "Target" },
  { id: "scan", label: "Attack", short: "Attack" },
  { id: "verdict", label: "Verdict", short: "Verdict" },
];

export function OnboardingFlow() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>("find");
  const [location, setLocation] = useState<Location | null>(null);
  const [account, setAccount] = useState<GithubAccount | null>(null);
  // The repo connected for real, and its finished scan, once there is one
  const [connected, setConnected] = useState<{ repo: GithubRepo; installUrl: string } | null>(null);
  const [result, setResult] = useState<ScanProgress | null>(null);
  const [email, setEmail] = useState("");
  const [decisions, setDecisions] = useState<FactDecisions>({});
  const [runKey, setRunKey] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [scrolled, setScrolled] = useState(false);

  // The header's hairline only shows once content scrolls under it
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const elapsed = useScanClock({
    running: stage === "scan" && !connected,
    speed,
    duration: SCAN_DURATION,
    runKey,
  });

  const current = location ?? locations[0];

  // Each step starts at the top; arriving mid-page on a new screen reads as a bug
  function go(next: Stage) {
    setStage(next);
    window.scrollTo({ top: 0 });
  }

  function restartScan() {
    setDecisions({});
    setRunKey((k) => k + 1);
    go("scan");
  }

  // Replay the screen you're on, from its start. The scan also clears what was
  // checked during it; the shop and email carry over, since they belong to the flow
  function replay() {
    if (stage === "scan") return restartScan();
    setRunKey((k) => k + 1);
    window.scrollTo({ top: 0 });
  }

  return (
    <div data-component="OnboardingFlow" className="flex min-h-dvh flex-col">
      {/* One header for the whole flow: it never moves, so only the content changes */}
      <header
        data-component="Header"
        data-scrolled={scrolled}
        className="sticky top-0 z-40 bg-paper/75 backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-200 data-[scrolled=true]:shadow-[0_1px_0_var(--border)]"
      >
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-5 sm:px-8">
          <ConcisionLogo />
          <div className="flex items-center gap-3">
            {stage !== "verdict" && (
              <Dots step={STAGES.findIndex((s) => s.id === stage) + 1} total={SETUP_STEPS} />
            )}
            {/* Interface sounds are one press from off, and stay off once muted */}
            <SoundToggle />
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${stage}-${runKey}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(4px)" }}
          // Clear the filter once settled: any filter makes this a containing block and
          // would pin the screens' fixed mobile buttons to it instead of the viewport
          animate={{ opacity: 1, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
          exit={{
            opacity: 0,
            filter: reduce ? "blur(0px)" : "blur(4px)",
            transition: { duration: 0.18, ease: EASE_EXIT },
          }}
          transition={{ duration: 0.26, ease: EASE_OUT }}
          className="flex-1"
        >
          {stage === "find" && (
            <FindBusiness
              onPick={(a) => {
                setAccount(a);
                go("confirm");
              }}
            />
          )}
          {stage === "confirm" && account && (
            <PickRepo
              account={account}
              onBack={() => go("find")}
              onConnect={(repo, installUrl) => {
                setConnected({ repo, installUrl });
                setResult(null);
                go("scan");
              }}
            />
          )}
          {/* Reached from the prototype controls without a GitHub account */}
          {stage === "confirm" && !account && (
            <ConfirmBusiness
              location={current}
              onChange={setLocation}
              onBack={() => go("find")}
              onConfirm={restartScan}
            />
          )}
          {stage === "scan" && connected && (
            <LiveAttack
              repo={connected.repo}
              installUrl={connected.installUrl}
              onDone={(scan) => {
                setResult(scan);
                go("verdict");
              }}
            />
          )}
          {/* The prototype run, when no repo was connected */}
          {stage === "scan" && !connected && (
            <LiveRead
              location={current}
              elapsed={elapsed}
              email={email}
              onEmail={setEmail}
              decisions={decisions}
              onDecide={(id, state) => setDecisions((d) => ({ ...d, [id]: state }))}
              onDone={() => go("verdict")}
            />
          )}
          {stage === "verdict" && connected && result && <ConnectedVerdict repo={connected.repo} scan={result} />}
          {stage === "verdict" && !(connected && result) && (
            <Verdict location={current} email={email} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Prototype controls, so the flow can be reviewed out of order */}
      <nav
        aria-label="Prototype controls"
        data-component="PrototypeBar"
        className="surface-floating fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full p-1 text-sm sm:gap-1"
      >
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-current={stage === s.id ? "step" : undefined}
            onClick={() => (s.id === "scan" ? restartScan() : go(s.id))}
            className={cn(
              "press h-9 shrink-0 rounded-full px-2.5 font-medium sm:px-3",
              stage === s.id ? "bg-foreground text-background" : "text-ink-2 hover:bg-muted hover:text-ink",
            )}
          >
            <span className="sm:hidden">{s.short}</span>
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden />
        <button
          type="button"
          onClick={replay}
          aria-label="Replay this screen"
          className="press press-sm grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-muted hover:text-ink"
        >
          <RotateCcw className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 3 : 1))}
          aria-label={`Scan speed ${speed}x, switch to ${speed === 1 ? 3 : 1}x`}
          className="press press-sm h-9 shrink-0 rounded-full px-2.5 font-medium text-ink-2 tabular-nums hover:bg-muted hover:text-ink"
        >
          {speed}×
        </button>
      </nav>
    </div>
  );
}
