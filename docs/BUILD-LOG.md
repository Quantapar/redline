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
