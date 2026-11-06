"use client";

import { ArrowUpRight } from "lucide-react";
import type { GithubRepo } from "@/lib/github-target";
import type { ScanProgress } from "./live-attack";
import { GithubMark } from "./github-mark";
import { StepHeading, StepShell } from "./setup-shell";
import { Button } from "@/components/flow/ui/button";

/**
 * The end of a real attack. What it found lives on the dashboard, behind a
 * GitHub sign-in, so only people with access to the repo see it; this screen
 * only says it's ready and where to look.
 */
export function ConnectedVerdict({ repo, scan }: { repo: GithubRepo; scan: ScanProgress }) {
  const ok = scan.status === "complete";
  return (
    <StepShell
      footer={
        <Button size="xl" nativeButton={false} className="w-full" render={<a href={`/scans/${scan.id}`} />}>
          <GithubMark className="size-4" />
          {ok ? "Sign in to see the report" : "Sign in to see what happened"}
        </Button>
      }
      note={
        <p className="text-center text-sm text-ink-3">
          <a
            href={scan.checkUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            The same verdict is on GitHub as a check
            <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
          </a>
        </p>
      }
    >
      <StepHeading title={ok ? `${repo.name}’s report is ready` : `The attack on ${repo.name} didn’t finish`}>
        {ok
          ? `We attacked ${scan.contracts} ${scan.contracts === 1 ? "contract" : "contracts"} with ${scan.attacks} ${scan.attacks === 1 ? "exploit" : "exploits"}, each replayed on a mainnet fork. Sign in with GitHub to open the dashboard and see what moved.`
          : "Nothing was proven either way, so it won’t block a merge. Sign in to see where it stopped; it runs again on the next push."}
      </StepHeading>
    </StepShell>
  );
}
