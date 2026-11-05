# Build log (for continuity across context resets)

Newest entries at the bottom. Terse. What I did, why, what I fixed, what I found.

## 2026-11-06 — session start
- Read brief (Redline: continuous security testing for smart contracts; proof via a
  referee council that re-runs attacks on forks and votes on the fact "did money move").
- Machine: Node 24, pnpm 9, Postgres 14 (started), Redis (installed+started), Docker off,
  gh logged in as Quantapar, Foundry NOT installed (curl|bash blocked by sandbox).
- Scope decision: build the legitimate defensive CI. AI layer = generic OpenAI-compatible
  router client generating PoC tests vs the user's OWN contracts in a sandbox. No jailbreaks,
  no canned third-party exploits, ownership-proof gate is mandatory.

## Architecture chosen
- Monorepo: pnpm workspaces + Turborepo. Source-first TS (run via tsx/vite/next), so lib
  packages are CHECK-ONLY (tsconfig noEmit; no composite/rootDir — those fought the
  path-mapping to source). Workspace imports resolved via tsconfig `paths` (tsc) and a
  vitest `resolve.alias` per consuming package.
- DB: PostgreSQL + Drizzle. Queue: Redis + BullMQ. Both live locally. DB `redline` created,
  schema pushed (10 tables), verified.

## Packages built so far
- @redline/shared: domain model + the consensus core.
  - council.ts `tallyCouncil`: red ONLY when consensus==='reproduced' (quorum of 'moved',
    zero dissent by default, distinct providers required). Proven by an exhaustive 256-combo test.
  - money.ts: attackerGained() decides movement from balances (the fact voted on).
  - budget.ts: BudgetGuard hard per-scan cap. ownership.ts: decideUnlock() gates runnable attacks.
  - 28 tests pass.
- @redline/db: Drizzle schema (accounts, installations, repositories, scans, candidates,
  referee_runs, findings, fixes, regression_tests, recipes) + client. Pushed to Postgres.
- @redline/engine: sandbox (LocalSandbox), cheatcodes (scan/strip forbidden cheats so
  referees run as plain txns), foundry (detectFoundry/startFork/forgeTest), referee
  (SimulationRefereeEngine + FoundryRefereeEngine-to-come + runCouncil), analyzers
  (slither/aderyn wrappers, graceful when absent). 10 tests pass.
  - SimulationRefereeEngine reads `// @redline-sim exploitable=.. netWei=.. cheatDependent=..
    flaky=..` directives so offline CI/demo exercises all four verdicts deterministically.

## Fixes/gotchas found
- vitest can't resolve workspace `@redline/*` by package.json alone -> added resolve.alias.
- tsc composite+rootDir incompatible with paths-to-source -> dropped them, check-only libs.
- `m[1]` under noUncheckedIndexedAccess -> `?? ''`.
- vitest exits 1 on no tests -> db uses --passWithNoTests until data-access tests land.

## Next
- @redline/db data-access (repositories) + integration test on live PG.
- @redline/hunters: 0G router client (OpenAI-compatible), swarm orchestration, PoC-test
  generation prompts (defensive framing), budget-aware.
- @redline/worker: BullMQ scan pipeline (prepare->static->hunt->verify->judge->post).
- apps/web: Next.js dashboard with Kobra design system + hugeicons. apps/github-app: Probot.
- packages/cli: `redline policy`. Then first subagent review + create private repo + push.

## 2026-11-06 — hunters package
- @redline/hunters: OGRouterClient (OpenAI-compatible, 0G router), SWARM roster (cheap->
  strong->reasoning tiers mapped to real 0G model ids), defensive PoC-test prompt, lenient
  candidate parser, huntSwarm orchestrator (cheap-first, escalate on miss, budget-capped,
  stop-after-N per target). 10 tests pass.
- LIVE smoke proven: qwen3-coder-flash via 0G found the reentrancy in a fixture vault,
  wrote a 970-char forge PoC, flagged usedShortcuts=true, receipt captured. ~9.5s, 922 tok.
- Fixes: (1) some coder models reject response_format json_object -> client retries plain,
  parser already tolerant. (2) added 3x retry w/ quadratic backoff for connect timeouts/5xx/429
  (hit a transient UND_ERR_CONNECT_TIMEOUT once). (3) scripts must be .mts for ESM TLA.

## 2026-11-06 — worker pipeline (backend spine complete)
- @redline/db: data-access queries (createScan, setScanStatus, insert candidate/referee/
  finding/regression, lists).
- @redline/engine: FoundryRefereeEngine (real forge run; passing exploit test == money
  moved; honest build-failed when foundry absent) + createRefereeEngine factory.
- @redline/worker: events (live SSE feed shape), judge (panel: severity by class, policy
  glob match, dup check — runs ONLY on reproduced, never creates/cancels red), pipeline
  runScan (prepare->hunt->verify council->judge->persist), BullMQ queue + processor, prepare
  stub (git clone TBD).
- Integration test on LIVE Postgres (redline_test db): genuine exploit -> red finding +
  saved regression test + 3 referee runs + scan complete; cheat-dependent -> no alarm;
  empty swarm -> clean complete. 3 tests.
- Fix: cheat-dependent fixture must actually contain a forbidden cheat for the stripper to
  bite (engine was right; test fixture was wrong).
- Totals: 51 tests across 5 packages, all typecheck clean.

## Next
- apps/web: Next.js dashboard (Kobra design system + hugeicons), live scan room (SSE),
  findings pages, policy view. THE visual deliverable — no slop.
- apps/github-app: Probot (webhooks, checks API, Fix-it PR).
- packages/cli: redline policy. Then subagent review -> create private repo -> push.

## 2026-11-06 — web dashboard + fixer (demo spine live)
- apps/web: Next 15 + React 19 + Tailwind v4 + Kobra design system (shadcn registry) + hugeicons (free set).
- Design system: dark-first, achromatic neutrals + 4 status hues, red reserved for alarms/brand.
  Tokens in globals.css (OKLCH), merged cleanly with Kobra's component styles.
- Installed ~36 Kobra components. Pages: Overview dashboard (stats, recent scans, open red
  findings) and Finding detail (council panel with per-referee money-moved, the attack code-block
  with ownership lock, Fix-it, value/model/forever-test sidebar).
- Fixer: @redline/hunters fixer.ts + /api/findings/[id]/fix route. LIVE PROVEN: a mainstream fixer model
  via 0G read the real vulnerable EtherVault and produced a correct checks-effects-interactions
  diff + plain explanation, saved as a Fix row on branch redline/fix-...
- Seed: scripts/seed-demo.mts runs the real pipeline to populate 3 repos / 2 red findings.
- Schema: added candidates.contract_source (the fixer needs the source); wired through pipeline.
- Fixes/gotchas (Next + Kobra):
  - Tailwind v4 "Missing field negated" -> bump tailwindcss + @tailwindcss/postcss to 4.3.4 (match).
  - workspace .js imports -> next.config webpack resolve.extensionAlias {.js:[.ts,.tsx,.js]}.
  - Kobra code-block (and copy-check/dropdown/sidebar/spinner/task-list/toast) ship without
    'use client' but use hooks -> added the directive so server components can import them.
  - code-block imports lucide-react -> installed (iconLibrary: lucide in components.json).
  - Button-as-Link needs nativeButton={false} (Base UI).
  - Badge sizes are only default|sm (no xs). Web tsconfig lib bumped to ES2023 (Kobra uses toSorted).
  - Dev webpack cache ENOENT races when rm -rf .next hits a live server -> disabled dev cache +
    always kill ALL :3000 PIDs before restart.
- Hydration warning on <body> is a browser extension (cz-shortcut-listen), not our bug.

## 2026-11-06 — live scan room + remaining nav pages (demo spine complete)
- Pages: Findings list, Repositories, Security policy (explains the plain-English policy +
  `redline policy` command), Referee council (two-room explainer + verdict distribution),
  Scan room (/scans/[id]).
- LIVE scan room: SSE at /api/scans/[id]/stream (Redis pub/sub, channel redline:scan:<id>),
  /api/scans/run creates a scan and runs the real pipeline fire-and-forget with a paced
  sim engine + fake client, publishing events to Redis. LiveScanFeed (EventSource) renders a
  stage timeline + streaming log; a 2s status poll is the fallback for missed events.
- PROVEN live in browser: Run a scan -> watch Prepare/Hunt/Verify/Judge stream, 3 referees
  "moved", consensus "reproduced", finding appears. Full red->proof->fix loop is interactive.
- Race fix: Redis pub/sub has no replay, and a sim scan finishes in ~2.5s before the client
  SSE connects -> added a 1.5s startup delay before the run emits + the status-poll fallback.

## 2026-11-06 — GitHub App (Probot) + CLI
- apps/github-app: Probot app. Pure, tested decideIntake (scan only when .sol contracts change,
  incremental unless first scan, ignores test/mock/script + non-default pushes) and
  buildCheckOutput (red -> check failure with proof links). Handlers: PR open/sync/reopen, push,
  installation — upsert account/installation/repo, open in-progress check, create+enqueue scan.
  7 tests. Registration checklist in docs/GITHUB_APP.md (needs App ID/private key/webhook secret).
- packages/cli: `redline policy` (init/add/list/remove) over .redline/policy.yml, validated by the
  shared Policy schema. Pure policy module (7 tests) + a tsx launcher bin. Live-smoke verified.
- Totals: 65 tests across 8 packages, all typecheck clean.

## Next
- Going-live gates scaffolding (ENS deploy lock, Safe guard) — partner ENS.
- Subagent code review of the uncommitted/whole diff -> create PRIVATE GitHub repo (Quantapar)
  -> push. Secret-scan history before any push.

## 2026-11-06 — going-live gates package
- packages/gates: pure, tested deploy-lock. canDeploy() allows a version only when the
  approved-version record is a council attestation FOR THAT EXACT version, issued by a
  council key, council-complete, and green (0 reproduced). safeGuardDecision reuses it.
  councilMayWrite enforces the ENS EAC write permission. 8 tests.
- On-chain wiring (ENS text record read/write on Sepolia, Safe Guard contract) is the
  integration point; verification logic is pure so it tests without a chain.
- Totals: 73 tests across 9 packages.
- Repo github.com/Quantapar/redline created (private). Secret scan of history: clean
  (only .env.example tracked, no .npmrc, no key fragments in any commit). Awaiting the
  independent review before first push.

## 2026-11-06 — independent review fixes (pre-push)
Addressed all 10 findings from the independent review subagent:
1. HIGH: council never checked value vs threshold — wired attackerGained() into BOTH referee
   engines; a passing test that moves < threshold is now 'did-not-move'. New test locks it in.
2. HIGH: budget cap not hard — swarm now RESERVES the estimate before each paid call and stops;
   if actual cost overruns, it halts before any further call. New test exercises actual>estimate.
3. HIGH: cheat detection was naive substring — now whitespace/newline/block-comment tolerant
   regexes (catches `vm . deal(`, `vm./* */deal(`, split lines). New obfuscation tests.
4. HIGH: runnable exploit shown to everyone — redactAttack() redacts server-side so the full
   attack never reaches the client; LockedAttack shows a silhouette + "prove ownership".
5. MED: fix endpoint now requires a red finding (422 otherwise).
6. HIGH: in-progress GitHub check never resolved — store check-run id on the scan; github-app
   runs a BullMQ QueueEvents 'completed' handler that updates the check red/green via an
   installation octokit.
7. MED: runCouncil no longer mislabels the candidate as "stripped" — engines strip internally.
8. MED: listRepositories N+1 collapsed to 3 queries.
9. LOW: Finding.refereeCount now counts valid (non-error) runs, matching the tally.
10. LOW: live feed no longer closes the stream on a transient SSE error (native reconnect).
- Totals: 76 tests across 9 packages, all typecheck clean. Production `next build` passes.

## 2026-11-06 — real queue e2e
- Added a true runtime test: BullMQ queue -> Worker -> pipeline -> Postgres, with Redis.
  Enqueues a scan, the worker processes it, a red finding is persisted. Proves the queue path
  the brief calls out ("the queue of the Redis"), not just the inline pipeline.
- Renamed the queue 'redline:scans' -> 'redline-scans' (BullMQ forbids ':' in queue names).
- seedRepo uses unique ids; worker test files run sequentially (shared test DB).
- Totals: 78 tests across 9 packages, all green. Repo pushed to Quantapar/redline (private).

## 2026-11-06 — test hardening
- Property tests (shared): ~14,000 randomized councils confirm red⟹reproduced+quorum+zero-dissent;
  sybil providers never red; BudgetGuard never overruns over random charge sequences; attackerGained
  monotonic in threshold.
- Engine: Foundry-absent path returns build-failed → council inconclusive → never red (honest
  no-proof-no-alarm).
- Totals: 86 tests across 9 packages, all green.

## 2026-11-06 — GitHub App path made functional (review gap #6 follow-up)
- The App now fetches each changed .sol file's content at the scanned commit (octokit
  repos.getContent) and stores it on the scan's changedTargets.
- gitPrepare builds real HuntTargets from those captured sources (contract name + functions
  derived when not provided). A GitHub-triggered scan now actually hunts the changed code.
- Added ChangedTarget.source to the shared schema. 4 gitPrepare tests.
- Totals: 90 tests across 9 packages, all green; all typechecks clean.

## 2026-11-06 — checkpoint summary
Complete end-to-end and pushed to Quantapar/redline (private). 9 packages, ~90 tests all green,
all typechecks clean, production build passes, no secrets tracked, no AI-assistant mentions.
Live-verified: swarm hunts real contracts via 0G, fixer returns correct diffs, live scan room
streams over SSE, full queue→worker→Postgres path. Independent review done + all 10 findings fixed.
Rate-limited paid endpoints. GitHub-App path fetches sources and hunts the changed code.

Outstanding (user-blocked, all with fallbacks): GitHub App registration secrets, Foundry install,
flip repo public, Sepolia wallet for the ENS/Safe demo. See docs/NEED-FROM-YOU.md.

## 2026-11-06 — Going-live page (surfaces the deploy lock)
- New /going-live page uses @redline/gates canDeploy over each repo's latest complete scan:
  clean -> deploy allowed, a reproduced finding -> deploy blocked with the reason. Shows the
  ENS-controlled approved-version record (redline.council.eth). Added to the sidebar nav.
- Totals: 100 tests; the gates feature is now visible and functional in the product.

## 2026-11-06 — attack-recipe library (Arkiv feature)
- Seeded a public recipe library (6 patterns: reentrancy, access-control, oracle, flash-loan,
  unchecked-call, signature-replay). The pipeline fetches recipes and the swarm includes them as
  hints in the hunt prompt on every scan. New /recipes page surfaces the library.
- Tests: recipe hints appear in the prompt when provided, omitted otherwise.
- Totals: 102 tests across 9 packages, all green.

## 2026-11-06 — encryption at rest
- @redline/db crypto: AES-256-GCM encrypt/decrypt with a customer-held ENCRYPTION_KEY (base64,
  32 bytes). Marker prefix enc:v1:; plaintext fallback in dev; GCM auth rejects tampering.
- The pipeline encrypts the saved attack (regression_tests.forge_test) at rest, so a stolen DB
  yields ciphertext, not runnable exploits. Verified: stored value is enc:v1:...
- 5 crypto tests. Totals: 107 tests across 9 packages.

## 2026-11-06 — watch mode
- triggerWatchMode(db, {recipe, enqueue}): adds a new attack to the shared recipe library
  (source: watch-mode) and queues a watch-mode scan of every enabled repo's latest version.
  Enqueue is injected for testability. 2 tests.
- Totals: 109 tests across 9 packages, all green.

## 2026-11-06 — MCP connector + health + empty states
- apps/mcp-server: MCP server (stdio) exposing redline_list_findings and redline_fix_context so a
  developer's own AI coding tool can pull a finding + vulnerable source and write the fix itself.
  Returns plain finding/source, never a weaponised exploit. 3 tests. Doc: docs/MCP.md.
- /api/health reports DB + Redis connectivity. Empty states on findings/repositories pages.
- Fixed apps/* vitest alias paths (needed ../../packages, not ../).
- Totals: 112 tests across 10 packages, all green; production build passes.

## 2026-11-06 — pipeline resilience + README + a11y + web encryption config
- Pipeline wraps each candidate's verification in try/catch: one failure is logged and skipped,
  never sinking the whole scan. Test with a throwing engine confirms the scan still completes.
- Decorative icons are aria-hidden. README expanded with the full feature set + CLI quickstart.
- apps/web/.env.local needs ENCRYPTION_KEY so the inline demo-scan path encrypts saved attacks too.
- Totals: 113 tests across 10 packages, all green.

## 2026-11-06 — finding triage workflow
- findings.status enum (open/acknowledged/resolved/reopened). setFindingStatus query, POST
  /api/findings/[id]/status route (validated), and a status control on the finding page.
  Teams can acknowledge, resolve, and reopen findings. 2 tests + live-verified.
- Totals: 115 tests across 10 packages, all green.

## 2026-11-06 — 0G private mode + findings-list status
- OGRouterClient private mode is env-configurable (OG_PRIVATE_MODE) and sends x-0g-private so
  sensitive attack-writing can run in the router's private/TEE mode. Test confirms the header is
  present only when enabled.
- Findings list shows triage status; the dashboard excludes resolved findings from open alarms.
- Totals: 116 tests across 10 packages, all green.
