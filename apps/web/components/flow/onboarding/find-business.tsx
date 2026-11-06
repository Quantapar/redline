"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { parseGithubTarget } from "@/lib/github-target";
import { StepHeading, StepShell } from "./setup-shell";
import { SourceRadar } from "./source-radar";
import { PendingButton } from "./pending-button";
import { Spinner } from "@/components/flow/ui/spinner";
import { Input } from "@/components/flow/ui/input";
import { cn } from "@/lib/flow/utils";

/** What /api/github/lookup resolves a username or URL to. */
type Resolved = {
  owner: { id: number; login: string; name: string | null; type: "user" | "organization"; avatarUrl: string; publicRepos: number };
  repo: { id: number; fullName: string; description: string | null; private: boolean; language: string | null } | null;
  installUrl: string | null;
};

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

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

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

export function FindBusiness() {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [picked, setPicked] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const q = query.trim();

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
    if (!selected?.installUrl || connecting) return;
    setConnecting(true);
    // Connecting is installing the Redline GitHub App on this account or repo. GitHub
    // asks which repositories it may read; its webhooks take it from there.
    window.location.assign(selected.installUrl);
  }

  return (
    <StepShell
      footer={
        // Hidden while the result floats over it, so its edges don't show past theirs
        <PendingButton
          size="xl"
          type="submit"
          form="find-form"
          pending={connecting}
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
        We’ll attack every contract in your repo on a mainnet fork, and show you what provably
        moves. Free, about 3 minutes.
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
            className="h-12 rounded-[12px] bg-card pr-3 pl-10 text-base md:text-base [&::-webkit-search-cancel-button]:hidden"
          />

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
            : "Connecting installs the Redline GitHub App. You choose which repositories it can read."}
        </p>
      </form>
    </StepShell>
  );
}
