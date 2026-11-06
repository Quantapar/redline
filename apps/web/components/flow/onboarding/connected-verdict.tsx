"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { GithubRepo } from "@/lib/github-target";
import type { ScanProgress } from "./live-attack";
import { ReportView, type Report } from "./report-view";
import { GithubMark } from "./github-mark";
import { StepHeading, StepShell } from "./setup-shell";
import { Button } from "@/components/flow/ui/button";
import { Spinner } from "@/components/flow/ui/spinner";

type Load =
  | { state: "loading" }
  | { state: "ready"; report: Report }
  | { state: "sign_in" }
  | { state: "not_yours" }
  | { state: "error" };

/**
 * The end of a real attack: the scan's own report, read from the backend. What
 * it found is only shown to someone signed in with GitHub who owns the repo, so
 * a visitor who isn't gets one button to connect GitHub, and the report loads
 * in place once they have.
 */
export function ConnectedVerdict({ repo, scan }: { repo: GithubRepo; scan: ScanProgress }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [connecting, setConnecting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const res = await fetch(`/api/onboarding/report?scan=${scan.id}`, { cache: "no-store" });
      if (res.status === 401) return setLoad({ state: "sign_in" });
      if (res.status === 404) return setLoad({ state: "not_yours" });
      if (!res.ok) return setLoad({ state: "error" });
      setLoad({ state: "ready", report: (await res.json()) as Report });
    } catch {
      setLoad({ state: "error" });
    }
  }, [scan.id]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // The GitHub sign-in tab says when it's done; then the report can load
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    const onDone = (data: unknown) => {
      if ((data as { type?: string } | null)?.type !== "github-connected") return;
      setConnecting(false);
      fetchReport();
    };
    try {
      channel = new BroadcastChannel("redline-github");
      channel.onmessage = (e) => onDone(e.data);
    } catch {
      // No BroadcastChannel: the opener message below still arrives
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) onDone(e.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      channel?.close();
      window.removeEventListener("message", onMessage);
    };
  }, [fetchReport]);

  function connectGithub() {
    setConnecting(true);
    if (!window.open("/connect/github", "_blank")) window.location.assign("/connect/github");
  }

  const checkLink = (
    <a
      href={scan.checkUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-ink-2 underline-offset-4 hover:text-ink hover:underline"
    >
      The same verdict is on GitHub as a check
      <ArrowUpRight className="size-3.5" strokeWidth={2} aria-hidden />
    </a>
  );

  if (load.state === "ready") {
    return (
      <div data-component="Verdict" className="mx-auto w-full max-w-[1120px] px-5 pt-8 pb-36 sm:px-8 lg:pt-14">
        <ReportView report={load.report} repoName={repo.name} />
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <Button variant="secondary" size="md" nativeButton={false} render={<a href={`/scans/${scan.id}`} />}>
            Open the full report
          </Button>
          {checkLink}
        </div>
      </div>
    );
  }

  if (load.state === "loading") {
    return (
      <StepShell footer={null}>
        <StepHeading title={`Reading ${repo.name}’s report`}>
          <span className="inline-flex items-center gap-2">
            <Spinner className="size-4" /> One moment
          </span>
        </StepHeading>
      </StepShell>
    );
  }

  const failed = scan.status !== "complete";
  return (
    <StepShell
      footer={
        load.state === "sign_in" ? (
          <Button size="xl" className="w-full" onClick={connectGithub} aria-busy={connecting || undefined}>
            {connecting ? <Spinner className="size-4" /> : <GithubMark className="size-4" />}
            {connecting ? "Waiting for GitHub" : "Connect GitHub to see it"}
          </Button>
        ) : load.state === "error" ? (
          <Button size="xl" variant="secondary" className="w-full" onClick={fetchReport}>
            Try again
          </Button>
        ) : null
      }
      note={<p className="text-center text-sm text-ink-3">{checkLink}</p>}
    >
      <StepHeading
        title={failed ? `The attack on ${repo.name} didn’t finish` : `${repo.name}’s report is ready`}
      >
        {load.state === "sign_in"
          ? "What the attack found stays private to the repo’s owner. Connect GitHub to open it here."
          : load.state === "not_yours"
            ? "It belongs to a different GitHub account than the one you’re signed in with."
            : "Couldn’t load the report. Check your connection and try again."}
      </StepHeading>
    </StepShell>
  );
}
