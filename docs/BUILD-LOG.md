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

## 2026-11-06 — public proof export
- GET /api/findings/[id]/proof returns the council's votes and receipts (per-referee provider,
  block, outcome, balance deltas) so anyone can re-check that the money moved. It never includes
  the runnable attack. This is the publishable proof (the Arkiv public-proofs fit).
- Live-verified: reproduced finding returns 3/3 agreement, 3 runs, zero attack code.
- Slither install abandoned: Python 3.14 is too new for its toolchain (noted as external blocker).

## 2026-11-06 — sandbox tests + public-proof UI
- LocalSandbox tests: stdout/stderr capture, exit codes, timeout flag, env pass-through (5 tests).
- "Copy public proof" button on the finding page (fetches the votes-and-receipts JSON).
- Totals: 121 tests across 10 packages, all green.

## 2026-11-06 — scan cancellation
- cancelScan marks a scan cancelled and drops its queued job if it has not started; refuses to
  cancel a complete/failed scan. POST /api/scans/[id]/cancel. 3 tests.
- Totals: 127 tests across 10 packages, all green.

## 2026-11-06 — model receipt in the audit trail
- candidates.model_receipt stores the provider receipt proving which model found a candidate
  (the 0G receipt). The hunt captures it, the pipeline persists it, and the public proof includes
  it as the discovery provenance.

## 2026-11-06 — more coverage (foundry helpers, web utils, cancel, receipt, triage, proof)
- Foundry referee helpers (parseNet, wrapTest) tested. Web pure utils (format, redact, referee-value)
  tested. Scan cancellation, model-receipt provenance, finding triage, public-proof export all added.
- Totals: 140 tests across 10 packages, all green; production build passes.

## 2026-11-06 — real-fork wiring
- The council dispatch now resolves each referee's fork RPC from ARCHIVE_RPC_URLS (comma-separated
  independent providers) or ARCHIVE_RPC_URL. The Foundry referee forks from these the moment Foundry
  is installed; the simulation ignores them. Documented the multi-provider independence need.

## 2026-11-06 — CI certified on a fresh database
- Ran the exact CI sequence against a brand-new empty database: db push created all 10 tables,
  typecheck passed, all 140 tests passed. The public repo's CI will be green on first run.
- Added CONTRIBUTING.md.

## 2026-11-06 — CI serial tests + visual bug fix + more coverage
- CI runs tests with --workspace-concurrency=1 so the DB-touching suites (worker, mcp-server)
  don't race on the shared test database. Serial run is consistently green.
- Visual QA caught and fixed a Kobra Card layout bug (repositories + going-live cards stacked
  because Card defaults to flex-col; forced flex-row).
- Added coverage: domain schema validation, swarm roster tiering, parseSlitherJson.
- Totals: 154 tests across 10 packages, all green.

## 2026-11-06 — triage E2E verified in-browser
- Resolved a finding from the finding page: status flipped to Resolved with a Reopen action, and
  the dashboard's open-alarms section dropped it (3 -> 2). CLI dispatch now covered (6 tests),
  recipes empty state added. Production build passes.
- Totals: 160 tests across 10 packages, all green.

## 2026-11-06 — prep-for-prod sweep
- Added a viewport meta (device-width, viewport-fit=cover) and theme-color matching the dark shell
  (was missing). Changed the app shell from 100vh to 100dvh so it doesn't overflow behind a mobile
  URL bar. Added visible focus rings to the sidebar nav links, the wordmark, and the clickable
  finding cards (keyboard users had no focus indicator on these custom links).
- Verified from code: Kobra inputs already use 16px on mobile (no iOS zoom); reduced-motion is
  handled in globals; the app is dark-only so there is no theme flash; no secrets or stray debug
  logs in source. Device checks (real iPhone/Android, screen reader order) remain for the user.

## 2026-11-06 — mobile navigation (prep-for-prod blocker)
- Below md the sidebar was hidden with no menu, so mobile users could not navigate. Added a menu
  button that opens a Sheet drawer with the same nav, closing on selection. The desktop sidebar is
  unchanged. (The in-tool browser renders a fixed viewport, so verify the drawer on a real phone.)

## 2026-11-06 — enforceable deploy gate
- GET /api/deploy-check?repo=&version= returns the going-live decision (blocks a red or unchecked
  version). `redline verify-deploy --repo --version` calls it and exits non-zero when blocked, so a
  deploy script can refuse to publish an unchecked or red version. Live-verified: a red version is
  blocked with exit 2.

## 2026-11-06 — watch mode + deploy gate as APIs; analyzer parsers
- POST /api/watch turns a new hack into a recipe and queues a re-scan of every repo (live-verified:
  recipe added, 3 scans queued). GET /api/deploy-check + `redline verify-deploy` gate a deploy.
- Extracted and tested parseSlitherJson and parseAderynJson.
- NOTE: GitHub push endpoint returned a server-side "fatal error in commit_refs" for this repo for a
  stretch; commits are safe locally and a background retry pushes them when it clears.

## 2026-11-06 — second independent review fixes (10 findings)
1. HIGH cancel did nothing + reverted: pipeline now checks cancellation after hunt and before
   complete, stops and keeps 'cancelled' (the post-hunt status write was overwriting it); UI honors
   the cancel response. New deterministic test.
2. HIGH /api/watch mass trigger: guarded by requireAdmin (REDLINE_ADMIN_TOKEN; open in dev).
3. HIGH unauth status mutation: admin-guard infra added; user-facing mutations need session auth
   (GitHub OAuth) — a roadmap item, documented.
4. HIGH value-at-risk tripled: the dedup set was dead; now counts one moved run per finding
   (351 ETH -> 108.5 ETH on the seed).
5. MED encryption defeated: candidates.forge_test was plaintext; now encrypted at rest and
   decrypted server-side in getFindingDetail (decrypt now has a caller; redaction unaffected).
6. MED value-at-risk ignored status: now excludes resolved findings.
7. MED triage vs deploy disconnected: deploy-check counts LIVE unresolved red findings, so resolving
   a false positive unblocks the deploy (verified).
8. MED 500 on bad id: id routes validate the uuid and return 400 (verified).
9. LOW XFF-spoofable/in-memory rate limit: documented; the admin guard mitigates the worst case.
10. LOW SSE heartbeat leak: cleared on cancel and done.
- Totals: 163 tests, all green; production build passes.

## 2026-11-06 — GitHub App handler coverage
- redlineApp now accepts injectable deps (db, queue, skipCompletion) for testing. A mocked-Probot
  test exercises the pull_request handler end to end: a changed contract creates a scan, captures
  its source, stores the check-run id, and enqueues; no contract change -> no scan. 2 tests.
- Added uuid-validator and admin-guard tests; an encryption-at-rest pipeline test.
- Totals: 171 tests across 10 packages, all green.

## 2026-11-06 — CSRF hardening
- Added a same-origin guard on the UI-called mutation endpoints (scan run, finding status, fix,
  scan cancel). A malicious site can no longer POST to them from a browser (cross-origin -> 403)
  while the same-origin dashboard works unchanged. Non-browser clients (no Origin) still pass; the
  real defence for those is the session-auth layer (ROADMAP). 3 tests. Verified live.
- Totals: 174 tests across 10 packages, all green.

## 2026-11-06 — component testing + CSRF guard
- Set up jsdom component testing (@testing-library/react + polyfills for matchMedia/ResizeObserver/
  WAAPI). Tests for RunScanButton (posts + navigates) and FindingStatusControl (resolve flow +
  reopen state) — the interactive UI logic is now covered.
- Same-origin CSRF guard on the mutation endpoints (verified: cross-origin -> 403, UI unaffected).
- Totals: 178 tests across 10 packages, all green.

## 2026-11-06 — MCP server fix (live stdio smoke caught it)
- A live stdio smoke of the MCP server revealed it could not start: @modelcontextprotocol/sdk@1.32.2
  imports zod/v3, which only exists in zod >=3.25, but we pinned 3.24.1. Bumped zod to 3.25.76
  (backward-compatible). The server now starts and lists redline_list_findings + redline_fix_context.
- Lesson: the tool-handler unit tests passed, but the server process was broken — live smoke matters.
- Also added db-queries, fixer, and more component tests. Totals: 203 tests across 10 packages.

## 2026-11-06 — more live smokes
- GitHub App defaulted to Probot's port 3000, colliding with the web app. Defaulted it to 3001
  (matches the webhook-forwarding doc). Live smoke confirms it now starts cleanly and degrades
  gracefully without secrets ("configure APP_ID and PRIVATE_KEY in .env").
- Worker process live smoke: starts and listens on the queue.

## 2026-11-06 — containerized deployment
- docker-compose (postgres, redis, web, worker) + Dockerfiles. The worker image installs Foundry,
  so `docker compose up` runs the REAL fork-based council in-container without a host install
  (the host sandbox blocks Foundry). compose syntax validated. Addresses the sealed-room deployment.

## 2026-11-06 — craft pass (design-eng review)
- Clickable finding/scan cards now give press feedback (motion-safe active:scale 0.99, 150ms,
  project ease-out), matching the Kobra buttons, so they feel responsive.
- Aligned custom focus rings to Kobra's ring-3 for a cohesive focus treatment.
- Walked the states: hover is already (hover:hover)-gated by Tailwind v4; numbers are tabular;
  reduced-motion is handled; dark-only so no theme drift. The dashboard deliberately has NO entrance
  animation (seen every visit, not once).

## 2026-11-06 — more craft (scan room)
- Stage timeline + connectors transition smoothly between states as the scan advances.
- Live log lines fade in as they stream (reduced-motion safe).
- When a fast scan finishes before the browser's SSE connects (the poll fallback catches it), the log
  now says "This scan finished before the live view connected — see the results below" instead of a
  confusing "Waiting for the first attack…". Caught by live verification.

## 2026-11-06 — forever-tests re-run (brief feature)
- Every scan now re-runs the repo's saved attacks (the forever-tests) through the council, decrypting
  each, so a fixed bug cannot quietly come back — a reproduced one is flagged "Regression:". The save
  is guarded to the original discovery so they don't accumulate. New test covers the re-run.
- Totals: 208 tests across 10 packages, all green.

## 2026-11-06 — continued polish

- **Regression test contract names.** Added `target_contract` to the
  `regression_tests` table. When a red finding becomes a forever-test, the
  real contract name is now stored with the saved attack instead of being
  re-parsed from the forge source on each re-run (which failed when the test
  had no literal `contract X` declaration). Re-run titles read e.g.
  "Regression: reentrancy in EtherVault". Verified end-to-end: a reseed
  populated `target_contract` = EtherVault / RewardToken on the two
  forever-tests.
- **Hydration warning on `<body>`.** A live browser check surfaced a single
  dev-overlay error: a hydration mismatch caused by a browser extension
  injecting `cz-shortcut-listen` onto `<body>` before React hydrates. The
  `<html>` element already had `suppressHydrationWarning`; extended the same
  guard to `<body>`. The error toast and console error are now gone. All
  routes verified 200 server-side; console clean.
- Full suite still green: 208 tests across 10 packages.

## 2026-11-06 — cheat-isolation hardening (security review)

- **Found a real false-RED path in the two-room boundary.** `scanCheats` pinned
  each forbidden cheatcode to only its first line, so `stripForReferee` left a
  duplicate cheat on any later line, which then ran in the referee with the cheat
  active. Fixed to record and strip every occurrence. Added a `FoundryRefereeEngine`
  guard that re-scans the stripped source and refuses (error, not a valid vote) when
  a cheat survives — placed before Foundry detection so it's deterministic.
- **Independent subagent review** then showed static text matching is evadable:
  aliasing the `Vm` handle (`Vm V = Vm(0x7109…); V.deal(…)`) or calling the
  cheatcode precompile address directly leaves no `vm.`/`deal(` token. Hardened the
  scanner: detect the precompile address (case-insensitive), `Vm`/`IVm`/`Hevm`
  interface casts and handle aliases, the `hevm` handle, and `changePrank`/`deployCode`.
- **Honest limit, documented, not papered over.** Static detection is defense in
  depth; the real guarantee is execution-level — running the referee attack as
  broadcast transactions where the cheatcode precompile is inert. Recorded in
  SECURITY.md (new "two-room guarantee and its current limit" section), in a code
  SECURITY note in cheatcodes.ts, and as a tracked hardening in NEED-FROM-YOU.md.
  Nothing ships a false guarantee today (sim path runs no untrusted code; the real
  fork path can't run without Foundry).
- Tests: +7 adversarial cases (duplicate-line strip, cross-line detection, Vm alias,
  raw precompile call, hevm/changePrank/deployCode, referee refusal, council-never-reds).
  Full suite 215 green across 10 packages (was 208).

## 2026-11-06 — more security hardening (same review thread)

- **ffi / system-access cheats.** vm.ffi runs arbitrary shell commands on the
  referee host (RCE in a sandbox running untrusted hunter tests); it plus the
  filesystem (readFile/writeFile/removeFile/closeFile), env (setEnv), and
  arbitrary-bytecode (getCode/getDeployedCode) cheats were undetected. Now
  forbidden and stripped. SECURITY.md records the forge-config controls the real
  fork path must also set (ffi = false, empty fs_permissions).
- **Encryption-at-rest fails closed.** crypto.ts treated a set-but-malformed
  ENCRYPTION_KEY as "not configured" and silently stored sensitive attacks as
  plaintext — a prod operator mistyping the key would believe they were encrypted.
  A malformed key now throws from encrypt/decrypt/isEncryptionConfigured; an unset
  key keeps the documented dev plaintext fallback. The AES-256-GCM mechanics were
  otherwise sound (fresh random IV, auth tag set before final, correct offsets).
- Suite: 216 green across 10 packages.

## 2026-11-06 — audit: budget guard, model-output bounds, redaction

- **Budget guard + swarm: audited, sound.** Every paid call reserves its estimate
  before spending and no new call is made once the cap is hit; over-reservation is
  not refunded, erring toward underspend. No overrun hole. No change needed.
- **Bounded untrusted model output.** parseCandidates validated most fields (zod
  weakness class, regex claimedValueWei, 500-char summary) but left forgeTest and
  targetFunction unbounded and the candidate count uncapped. Since the forgeTest is
  stored and later compiled, a compromised/errant model could inject an oversized
  payload. Capped: 10 candidates, 24KB forgeTest, 120-char targetFunction.
- **Redaction / ownership gate: audited, clean.** The decrypted attack is used only
  in the finding server component, redacted before the client boundary; no API route
  returns it and no reveal endpoint exists, so the runnable attack never leaves the
  server. SECURITY.md's promise holds. No change needed.

## 2026-11-06 — audit: GitHub App intake bounds

- **Bounded the PR intake.** fetchChangedTargets fetched and stored every changed
  .sol file with no cap on count or size — a PR author (attacker-influenced input)
  could change thousands of files or ship an enormous one, exhausting GitHub API
  calls and bloating the scan row. Capped at 50 files and 256KB per source.
- **Path-traversal note.** The PR-controlled file path is safe as a GitHub API path
  and for storage, but flagged in code (prepare.ts) and NEED-FROM-YOU that the future
  Foundry src-prep must normalise it and reject traversal before any local disk write.
- Suite: 218 green across 10 packages.

## 2026-11-06 — a11y + error-state polish (interactive components)

- **aria-busy on async actions.** RunScanButton and FindingStatusControl showed
  their pending state only visually (spinner / disabled). Added aria-busy so a
  screen reader announces the in-flight action. The label is not rewritten to a
  status (per the design guidance); the pending cue is the spinner plus aria-busy.
- **No more silent failure.** FindingStatusControl did nothing visible when the
  status request failed — the user clicked Resolve and the UI just sat there. It
  now shows a role="alert" message and leaves the action available to retry. The
  FixItButton already handled errors; this brings the two to parity.
- Suite: 219 green across 10 packages.

## 2026-11-06 — doc/UI honesty: re-attack claim scoped to Foundry

- The README, the Fix-it dialog, and DEMO.md stated as fact that a proposed fix is
  "re-attacked before it can go green", but the fix route sets reattackPassed=null
  ("runs on a fork once Foundry is enabled") — that pre-merge re-attack isn't wired.
  Corrected all three to claim only what's true now: the attack is saved as a
  forever-test that re-runs on every future change (implemented + verified this
  session), with the fork-based re-attack-the-fix noted as Foundry-gated.
- Added a "What needs Foundry" section to DEMO.md so the simulation-vs-real-fork
  scope is explicit for anyone reading the repo.
- Verified the documented setup: `pnpm smoke` passes (Postgres, Redis, 0G 125 models,
  archive RPC block live, Foundry correctly reported absent).

## 2026-11-06 — more doc/UI honesty: PR-opening and ENS/Safe scoped

- Verified every README feature claim against the code. Two more overclaims:
  - "Fix it opens a reviewed PR" — the fix route generates a diff + explanation and
    stores a branch name; it does NOT call GitHub to open a PR. Reworded to "generates
    a reviewed fix", with PR-opening named as the integration step.
  - "Going-live gates ... ENS deploy lock ... Safe multisig deploy" — there is no ENS
    or Safe code at all (only the DB-backed `redline verify-deploy` gate is real, and
    the unlock policy logic). Scoped ENS/Safe as planned in the README, the going-live
    page label, and DEMO.md.
- DEMO.md now has a single "Honest scope: wired vs planned" section covering Foundry,
  PR-opening, and ENS/Safe, so the repo reads consistently for a public audience.

## 2026-11-06 — wire per-repo policy; scope the "connected code" claim

- **Per-repo .redline/policy.yml now actually applies during a scan.** The CLI managed
  the file and the schema cached it as policyJson, but the pipeline used DEFAULT_POLICY
  and never read the repository record — so a repo's rules never reached the hunt or the
  judge. The pipeline now loads repo.policyJson, validates it with the Policy schema, and
  uses it (falling back to the default when absent or invalid). This turns the README's
  "Security policy" claim from aspirational into true. +2 pipeline tests (applied; safe
  fallback on an invalid stored policy).
- **"Connected code" scoped.** README step 3 claimed changes are probed "plus connected
  code", but connectedFunctions is always empty (no call-graph analysis). Reworded to the
  contracts that changed, with call-graph expansion marked planned.

## 2026-11-06 — CLI verified end-to-end; lock the deploy gate's fail-closed behavior

- Ran the whole CLI for real: policy init/add/list write valid YAML; verify-deploy
  against the live server blocks a red version (exit 2), allows a green one (exit 0),
  and the --json form is correct.
- Checked the security-critical fail-closed paths: an unreachable server, a non-JSON
  response, and an unknown version/repo all BLOCK the deploy (non-zero exit), so a
  network blip can't let unchecked code ship. (An earlier "exit 0" reading was a
  measurement artifact of piping through `head`; the real exit is 1.)
- Added 5 CLI tests pinning the gate's fail-closed behavior so a refactor can't
  silently open it. Suite 226 green across 10 packages.

## 2026-11-06 — ARCHITECTURE.md accuracy pass

- Audited ARCHITECTURE.md against the code (same pass as the README). Corrected
  design-stated-as-fact claims to match the build:
  - Pipeline diagram said "prepare (clone...)" and showed a "static analysis
    (Slither, Aderyn)" step. prepare uses captured sources (no clone), and the
    analyzer wrappers exist in packages/engine but are not wired into the hunt
    (analyzerNotes is always empty). Reworded; analyzers noted as available-not-wired.
  - "only changed + connected code" -> changed contracts (call-graph expansion planned).
  - "Each scan runs in its own sealed, throwaway sandbox, wiped after" -> scoped to the
    real fork path; today's simulation runs no untrusted code.
  - "attacks are stored only briefly" -> encrypted at rest; expiry/retention is planned,
    not enforced (the expiresAt field is on recipes and unused).
  - Going-live gates: canDeploy/verify-deploy are real and fail closed; the on-chain ENS
    lock and Safe guard are the planned extension. Added verify-deploy to the CLI list.
- packages/gates and canDeploy confirmed to exist and be wired.

## 2026-11-06 — production build verified; SSE cancelled-poll fix

- Ran the production build of apps/web (next build): all 20 routes build cleanly, no
  SSR/type errors, reasonable bundle sizes. Confirms the app is production-buildable
  after this session's changes, not just dev-runnable.
- Live scan feed: the status-poll fallback ended the view only on 'complete'/'failed',
  not 'cancelled'. A scan cancelled elsewhere, whose stream missed the 'done' event,
  would leave the feed stuck on "Live" forever. Added 'cancelled' to the terminal
  check. +1 test (cancelled detected via the poll). Suite 227 green.

## 2026-11-06 — rate-limit consistency across mutation endpoints

- Audited rate limiting across the API. The expensive mutations (scans/run, fix,
  watch) were limited, but two cheaper mutations — findings/[id]/status and
  scans/[id]/cancel — were not. Both already have the same-origin CSRF guard (the
  main protection) and input validation, so no critical hole, but for consistency all
  mutations should be bounded. Added rate limiting to both (60/min status, 30/min
  cancel) matching the established pattern.
- Added 4 unit tests for the rate limiter itself (limit then 429, per-key isolation,
  window reset via fake timers, client-key derivation). Suite 231 green.
