"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { ConcisionLogo } from "@/components/flow/brand";
import { SoundToggle } from "@/components/flow/ui/sound";
import type { GithubAccount, GithubRepo } from "@/lib/github-target";
import { FindBusiness } from "./find-business";
import { PickRepo } from "./pick-repo";
import { LiveAttack, type ScanProgress } from "./live-attack";
import { ConnectedVerdict } from "./connected-verdict";
import { Dots, SETUP_STEPS } from "./setup-shell";

/**
 * The public onboarding, on real data end to end: find a GitHub account, pick
 * one of its repositories, connect it (installing the Redline GitHub App), follow
 * the real attack, and read the scan's own report. Each step only exists once
 * the one before it has produced what it needs, so there's nothing to fake.
 */
type Stage = "find" | "repo" | "attack" | "verdict";

const STEP: Record<Stage, number> = { find: 1, repo: 2, attack: 3, verdict: 4 };

export function OnboardingFlow() {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<Stage>("find");
  const [account, setAccount] = useState<GithubAccount | null>(null);
  const [connected, setConnected] = useState<{ repo: GithubRepo; installUrl: string } | null>(null);
  const [result, setResult] = useState<ScanProgress | null>(null);
  const [scrolled, setScrolled] = useState(false);

  // The header's hairline only shows once content scrolls under it
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Each step starts at the top; arriving mid-page on a new screen reads as a bug
  function go(next: Stage) {
    setStage(next);
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
            {stage !== "verdict" && <Dots step={STEP[stage]} total={SETUP_STEPS} />}
            {/* Interface sounds are one press from off, and stay off once muted */}
            <SoundToggle />
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={stage}
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
                go("repo");
              }}
            />
          )}
          {stage === "repo" && account && (
            <PickRepo
              account={account}
              onBack={() => go("find")}
              onConnect={(repo, installUrl) => {
                setConnected({ repo, installUrl });
                setResult(null);
                go("attack");
              }}
            />
          )}
          {stage === "attack" && connected && (
            <LiveAttack
              repo={connected.repo}
              installUrl={connected.installUrl}
              onDone={(scan) => {
                setResult(scan);
                go("verdict");
              }}
            />
          )}
          {stage === "verdict" && connected && result && <ConnectedVerdict repo={connected.repo} scan={result} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
