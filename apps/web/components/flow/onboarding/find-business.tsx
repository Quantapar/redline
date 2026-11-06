"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { parseGithubTarget, type GithubAccount } from "@/lib/github-target";
import { StepHeading, StepShell } from "./setup-shell";
import { SourceRadar } from "./source-radar";
import { PendingButton } from "./pending-button";
import { GithubMark } from "./github-mark";
import { Spinner } from "@/components/flow/ui/spinner";
import { Input } from "@/components/flow/ui/input";
import { Button } from "@/components/flow/ui/button";
import { cn } from "@/lib/flow/utils";

type Resolved = GithubAccount;

type Lookup =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "found"; result: Resolved }
  | { state: "missing"; what: "owner" | "repo" }
  | { state: "invalid" }
  | { state: "error"; message: string };

const ERRORS: Record<string, string> = {
  rate_limited: "Too many lookups. Wait a minute and try again.",
  github_rate_limited: "GitHub is limiting lookups right now. Try again in a few minutes.",
  github_unreachable: "Couldn’t reach GitHub. Check your connection and try again.",
};


function describe(r: Resolved): string {
  if (r.repo) {
    const bits = [r.repo.private ? "Private repository" : "Public repository", r.repo.language].filter(Boolean);
    return r.repo.description ? `${bits.join(" · ")} · ${r.repo.description}` : bits.join(" · ");
  }
  const kind = r.owner.type === "organization" ? "Organization" : "User";
  const n = r.owner.publicRepos;
  return `${kind} · ${n} public ${n === 1 ? "repository" : "repositories"}`;
}

/** GitHub avatars take a size param; ask for the pixels we draw, at 2x. */
function avatar(url: string, px: number) {
  const u = new URL(url);
  u.searchParams.set("s", String(px * 2));
  return u.toString();
}

function label(r: Resolved) {
  return r.repo ? r.repo.fullName : r.owner.login;
}

export function FindBusiness({ onPick }: { onPick: (account: GithubAccount) => void }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [picked, setPicked] = useState(false);
  // Waiting on the GitHub sign-in tab opened by "Connect GitHub"
  const [githubTab, setGithubTab] = useState(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const q = query.trim();

  // The sign-in tab reports which GitHub account connected; take it straight to
  // that account's repositories, no pasting
  useEffect(() => {
    let cancelled = false;
    async function connected(data: unknown) {
      const msg = data as { type?: string; login?: unknown } | null;
      if (msg?.type !== "github-connected" || typeof msg.login !== "string") return;
      const login = msg.login;
      setQuery(login);
      setPicked(false);
      try {
        const res = await fetch(`/api/github/lookup?q=${encodeURIComponent(login)}`);
        if (res.ok && !cancelled) return onPickRef.current((await res.json()) as Resolved);
      } catch {
        // Falls back to the typed lookup below, already filled in
      }
      if (!cancelled) setGithubTab(false);
    }
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("redline-github");
      channel.onmessage = (e) => connected(e.data);
    } catch {
      // No BroadcastChannel: the opener message below still arrives
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) connected(e.data);
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      channel?.close();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  function connectGithub() {
    setGithubTab(true);
    const tab = window.open("/connect/github", "_blank");
    // Pop-up blocked: sign in in this tab; it lands back on the onboarding
    if (!tab) window.location.assign("/connect/github");
  }

  // Resolve what's typed against GitHub, once typing pauses. A newer query aborts
  // the older request, so a slow answer can never overwrite a fresh one.
  useEffect(() => {
    if (picked) return;
    if (!q) return setLookup({ state: "idle" });
    if (!parseGithubTarget(q)) return setLookup({ state: "invalid" });
    setLookup({ state: "loading" });
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/github/lookup?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = await res.json().catch(() => ({}));
        if (res.ok) return setLookup({ state: "found", result: body as Resolved });
        if (res.status === 404) return setLookup({ state: "missing", what: body.what === "repo" ? "repo" : "owner" });
        if (res.status === 400) return setLookup({ state: "invalid" });
        setLookup({ state: "error", message: ERRORS[body.error] ?? "Something went wrong looking that up. Try again." });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setLookup({ state: "error", message: ERRORS.github_unreachable! });
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, picked]);

  const result = lookup.state === "found" ? lookup.result : null;
  const selected = picked && result ? result : null;
  const open = q.length > 0 && !picked && lookup.state !== "idle";

  function pick() {
    if (!result) return;
    setQuery(label(result));
    setPicked(true);
  }

  function connect() {
    if (selected) onPick(selected);
  }

  return (
    <StepShell
      footer={
        // Hidden while the result floats over it, so its edges don't show past theirs
        <PendingButton
          size="xl"
          type="submit"
          form="find-form"
          pending={false}
          disabled={!selected?.installUrl}
          className={cn("w-full", open && "invisible")}
        >
          <GithubMark className="size-4" />
          Connect
        </PendingButton>
      }
      after={<SourceRadar business={selected ? label(selected) : null} />}
    >
      <StepHeading title="Let’s secure your contracts">
        We’ll attack every contract on a mainnet fork and show you what provably moves.
        Free, about 3 minutes.
      </StepHeading>

      <form
        id="find-form"
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter on a found account picks it; Enter again connects
          if (result && !picked) pick();
          else connect();
        }}
      >
        <label htmlFor="github-target" className="text-sm font-medium text-ink">
          GitHub username or repository URL
        </label>
        <div className="relative mt-2">
          {selected ? (
            // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar, any size
            <img
              src={avatar(selected.owner.avatarUrl, 24)}
              alt=""
              className="pointer-events-none absolute top-1/2 left-3 size-6 -translate-y-1/2 rounded-md"
            />
          ) : (
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
              strokeWidth={1.75}
              aria-hidden
            />
          )}
          <Input
            id="github-target"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(false);
            }}
            placeholder="octocat or github.com/octocat/vault"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            // Enter picks the result here: the form can't submit while Connect is disabled
            onKeyDown={(e) => {
              if (e.key === "Enter" && result && !picked) {
                e.preventDefault();
                pick();
              }
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls="find-results"
            aria-describedby="github-target-hint"
            className={cn(
              "h-12 rounded-[12px] bg-card pl-10 text-base md:text-base [&::-webkit-search-cancel-button]:hidden",
              q ? "pr-3" : "pr-44",
            )}
          />
          {/* No username to paste? Sign in with GitHub instead, in a new tab */}
          {!q && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={connectGithub}
              aria-busy={githubTab || undefined}
              className="absolute top-1/2 right-2.5 -translate-y-1/2"
            >
              {githubTab ? <Spinner className="size-3.5" /> : <GithubMark className="size-3.5" />}
              {githubTab ? "Waiting for GitHub" : "Connect GitHub"}
            </Button>
          )}

          {/* The result floats over the page like autocomplete, so Connect never moves */}
          <div id="find-results" aria-live="polite" className="absolute inset-x-0 top-full z-20 mt-2">
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  key={lookup.state === "found" ? "found" : "other"}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-4px) scale(0.99)" }}
                  animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                  exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_EXIT } }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="surface-floating origin-top rounded-[14px] p-1.5"
                >
                  {lookup.state === "found" ? (
                    <button
                      type="button"
                      onClick={pick}
                      className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- GitHub avatar */}
                      <img src={avatar(lookup.result.owner.avatarUrl, 36)} alt="" className="size-9 shrink-0 rounded-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{label(lookup.result)}</span>
                        <span className="block truncate text-sm text-ink-3">{describe(lookup.result)}</span>
                      </span>
                      <GithubMark className="size-4 shrink-0 text-ink-3" />
                    </button>
                  ) : lookup.state === "loading" ? (
                    <div className="flex items-center gap-2.5 px-2.5 py-2 text-[15px] text-ink-2">
                      <Spinner className="size-4" />
                      Looking up {q} on GitHub
                    </div>
                  ) : (
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[15px] text-ink">
                        {lookup.state === "missing"
                          ? lookup.what === "repo"
                            ? `No repository at ${q.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}`
                            : `No GitHub account called “${parseGithubTarget(q)?.owner ?? q}”`
                          : lookup.state === "invalid"
                            ? "That doesn’t look like a GitHub username or URL"
                            : "Couldn’t look that up"}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {lookup.state === "missing"
                          ? lookup.what === "repo"
                            ? "Check the name. Private repos show up once you install the app."
                            : "Check the spelling, or paste the GitHub URL."
                          : lookup.state === "invalid"
                            ? "Try a username like octocat, or github.com/owner/repo."
                            : lookup.state === "error"
                              ? lookup.message
                              : null}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <p id="github-target-hint" className="mt-2 text-sm text-ink-3">
          {selected && !selected.installUrl
            ? "The Redline GitHub App isn’t configured on this server yet (GITHUB_APP_SLUG)."
            : "Next, pick the repository to attack from their GitHub."}
        </p>
      </form>
    </StepShell>
  );
}
