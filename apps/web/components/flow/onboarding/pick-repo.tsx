"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, Lock, Search, Star } from "lucide-react";
import { filterRepos, type GithubAccount, type GithubRepo } from "@/lib/github-target";
import { BackButton, IconTile, OptionGroup, OptionRow, StepHeading, StepShell } from "./setup-shell";
import { PendingButton } from "./pending-button";
import { GithubMark } from "./github-mark";
import { Input } from "@/components/flow/ui/input";
import { cn } from "@/lib/flow/utils";

type Load =
  | { state: "loading" }
  | { state: "ready"; repos: GithubRepo[]; partial: boolean; installUrl: string | null }
  | { state: "error"; message: string };

// The rows shown before anyone searches: the account's top repos
const TOP = 5;
// Rows shown for a search, so the list never runs off the screen
const MAX_MATCHES = 8;

const ERRORS: Record<string, string> = {
  rate_limited: "Too many requests. Wait a minute and try again.",
  github_rate_limited: "GitHub is limiting requests right now. Try again in a few minutes.",
  not_found: "That GitHub account no longer exists.",
};

const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function pushedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  if (days > -1) return "updated today";
  if (days > -30) return `updated ${ago.format(days, "day")}`;
  if (days > -365) return `updated ${ago.format(Math.round(days / 30), "month")}`;
  return `updated ${ago.format(Math.round(days / 365), "year")}`;
}

function detail(r: GithubRepo) {
  return (
    <span className="flex items-center gap-1.5">
      {r.private && <Lock className="size-3 shrink-0" strokeWidth={2} aria-label="Private" />}
      {[r.language, pushedAgo(r.pushedAt)].filter(Boolean).join(" · ")}
      {r.stars > 0 && (
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          · <Star className="size-3" strokeWidth={2} aria-hidden /> {r.stars.toLocaleString("en")}
        </span>
      )}
    </span>
  );
}

export function PickRepo({
  account,
  onBack,
  onConnect,
}: {
  account: GithubAccount;
  onBack: () => void;
  onConnect: (repo: GithubRepo, installUrl: string) => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [query, setQuery] = useState("");
  // A repo pasted on the first step comes in already picked
  const [pickedId, setPickedId] = useState<number | null>(account.repo?.id ?? null);
  const [connecting, setConnecting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const login = account.owner.login;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoad({ state: "loading" });
    fetch(`/api/github/repos?owner=${encodeURIComponent(login)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(ERRORS[body.error] ?? "Couldn’t load the repositories from GitHub.");
        setLoad({ state: "ready", repos: body.repos, partial: body.partial, installUrl: body.installUrl });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setLoad({ state: "error", message: err.message });
      });
    return () => ctrl.abort();
  }, [login, attempt]);

  const repos = load.state === "ready" ? load.repos : [];
  const q = query.trim();
  const shown = useMemo(() => {
    const list = q ? filterRepos(repos, q).slice(0, MAX_MATCHES) : repos.slice(0, TOP);
    // Keep the picked repo on screen even when it isn't a top one or a match
    const picked = repos.find((r) => r.id === pickedId);
    return picked && !list.some((r) => r.id === picked.id) ? [picked, ...list] : list;
  }, [repos, q, pickedId]);
  const picked = repos.find((r) => r.id === pickedId) ?? null;

  function connect() {
    if (!picked || load.state !== "ready" || !load.installUrl || connecting) return;
    // Connecting installs the Redline GitHub App on this repo; from then on its
    // pushes and pull requests are attacked, with the result as a check on GitHub.
    // GitHub opens in its own tab so this one can follow the attack live.
    const url = new URL(load.installUrl);
    url.searchParams.append("repository_ids[]", String(picked.id));
    const tab = window.open(url.toString(), "_blank");
    if (!tab) {
      // Pop-up blocked: go there in this tab instead
      setConnecting(true);
      window.location.assign(url.toString());
      return;
    }
    tab.opener = null;
    onConnect(picked, url.toString());
  }

  const name = account.owner.name || login;

  return (
    <StepShell
      footer={
        <div className="flex flex-1 items-center gap-2">
          <BackButton onClick={onBack} />
          <PendingButton
            size="xl"
            type="button"
            pending={connecting}
            disabled={!picked || load.state !== "ready" || !load.installUrl}
            onClick={connect}
            className="flex-1"
          >
            <GithubMark className="size-4" />
            {picked ? `Connect ${picked.name}` : "Pick a repository"}
          </PendingButton>
        </div>
      }
      note={
        <p className="text-center text-sm text-ink-3 text-pretty">
          Connecting installs the Redline GitHub App on this repository.{" "}
          <span className="text-ink-2">It reads your code and never pushes to it.</span>
        </p>
      }
    >
      <StepHeading title="Which repository should we attack?">
        {load.state === "ready"
          ? repos.length
            ? null
            : `${name} has no public repositories of their own yet.`
          : `Fetching ${name}’s repositories from GitHub.`}
      </StepHeading>

      <div className="mt-8">
        {load.state === "loading" ? (
          <div className="flex flex-col gap-2" aria-busy aria-label="Loading repositories">
            {Array.from({ length: TOP }, (_, i) => (
              <div key={i} className="h-[62px] animate-pulse rounded-[14px] bg-card shadow-[0_0_0_1px_var(--border)]" />
            ))}
          </div>
        ) : load.state === "error" ? (
          <div className="rounded-[14px] bg-card px-4 py-3.5 shadow-[0_0_0_1px_var(--border)]">
            <p className="text-[15px] text-ink">{load.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="mt-1 text-sm font-medium text-ink-2 underline underline-offset-4 hover:text-ink"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            {shown.length > 0 ? (
              <OptionGroup
                label="Repository"
                value={pickedId != null ? String(pickedId) : null}
                onValueChange={(id) => setPickedId(Number(id))}
              >
                {shown.map((r) => (
                  <OptionRow
                    key={r.id}
                    value={String(r.id)}
                    checked={r.id === pickedId}
                    media={<IconTile icon={BookMarked} tone={r.id === pickedId ? "brand" : "ink"} />}
                    title={r.name}
                    detail={detail(r)}
                  />
                ))}
              </OptionGroup>
            ) : (
              q && (
                <p className="rounded-[14px] bg-card px-4 py-3.5 text-[15px] text-ink-2 shadow-[0_0_0_1px_var(--border)]">
                  No repository matching “{q}”.
                </p>
              )
            )}
            {repos.length > TOP && (
              <div className="relative mt-2">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Not listed? Search ${repos.length} repositories`}
                  aria-label="Search repositories"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore
                  className={cn(
                    "h-12 rounded-[12px] bg-card pr-3 pl-10 text-base md:text-base [&::-webkit-search-cancel-button]:hidden",
                  )}
                />
              </div>
            )}
          </>
        )}
      </div>
    </StepShell>
  );
}
