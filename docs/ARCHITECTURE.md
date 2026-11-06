# Architecture

## The two-room split

AI is creative but unreliable, and will cheat to look successful. Redline separates
*finding* from *proving*:

- **Hunters** (the swarm) may use any shortcut while searching for weak spots. They
  produce *candidates*: hypotheses with a proof-of-concept attack. A candidate is an
  opinion until it is reproduced.
- **Referees** decide the verdict by running the attack for real, as broadcast
  transactions from an ordinary funded wallet against an anvil node (a fork, or a
  fresh chain with the contract under review deployed). The cheatcode precompile is a
  codeless no-op there, so cheat shortcuts fabricate nothing. The verdict comes only
  from measured balances — value must leave the target and land with the attacker —
  never from anything the attack prints. If the money moves, it is a bug; if not, no
  alarm.

## The referee council

Several independent referees each run the same stripped attack in their own room, at
a different block, through a different provider. The council votes on one fact — did
the money move? — never on an opinion. A finding is **red** only when consensus is
`reproduced` (see `packages/shared/src/consensus/council.ts`). Any disagreement marks
the exploit `fragile` (conditional, not universal) and raises no alarm.

A second **judgment panel** assigns severity, judges whether the setup was realistic,
detects duplicates, and checks policy rules. It can rank and explain but can never
create or cancel a red result.

## Scan pipeline (BullMQ)

```
webhook -> queue scan -> prepare (captured sources, detect, diff)
        -> hunt (swarm, cheap models first, budget-capped)
        -> verify (referee council on candidates only)
        -> judge (panel)
        -> post check + live updates
```

`prepare` builds targets from the contract sources the GitHub App captured at the
scanned commit (no local clone). Static-analysis wrappers (Slither, Aderyn) live in
`packages/engine` and degrade gracefully, but are not yet wired to feed the hunt —
`analyzerNotes` is currently empty. Incremental scans probe the contracts that
changed (call-graph-connected expansion is planned). A hard per-scan budget cap
(`BudgetGuard`) gates every model call.

## Misuse controls (mandatory)

- Findings are visible to all; the **runnable attack is locked** until the requester
  proves they control the live contract (`decideUnlock`).
- The real fork-based referee runs each attack in a sealed, throwaway sandbox
  (`packages/engine` sandbox) that is wiped after. Today's deterministic simulation
  executes no untrusted code, so it needs no sandbox; the sandbox activates with the
  Foundry fork path.
- Saved attacks are AES-256-GCM encrypted at rest with a customer-held key. (A
  retention/expiry policy that deletes them after a window is planned, not yet enforced.)

## Subsystems

- **Swarm** (`packages/hunters`) — a model-agnostic OpenAI-compatible client for the 0G router.
  Cheap models run first across all targets; stronger tiers come in only where they stall. Every
  call is reserved against a hard per-scan budget before it is made. Sensitive attack-writing can
  route through the router's private/TEE mode.
- **Engine** (`packages/engine`) — the real referee runs each candidate as broadcast transactions
  against an anvil node and measures the theft from on-chain balances (`broadcast.ts`,
  `foundry-referee.ts`); the cheatcode stripper and a scrubbed toolchain environment are
  defense-in-depth on top. Slither/Aderyn wrappers degrade gracefully. A deterministic simulation
  referee sits behind the same interface for offline dev, CI and the demo, and is opt-in only —
  `createRefereeEngine` fails closed (no silent simulation fallback) when Foundry is absent.
- **Pipeline** (`packages/worker`) — a BullMQ queue so scans run in order and big customers do not
  block small ones. `runScan` chains prepare → hunt → verify → judge and persists everything, one
  bad candidate never sinking the whole scan. `watch-mode` turns a new hack into a recipe and
  re-tests every repo; `cancel` stops an in-flight scan.
- **Going-live gates** (`packages/gates`) — `canDeploy` allows a deploy only against a complete,
  green council attestation for that exact version, issued by a council key. This logic is wired
  and exposed through `redline verify-deploy` (which fails closed). Binding the council key to an
  on-chain ENS deploy-lock and backing a Safe transaction guard with the same decision are the
  planned on-chain extension, not yet wired.
- **Data** (`packages/db`) — PostgreSQL via Drizzle. Saved attacks are AES-256-GCM encrypted at
  rest with a customer-held key.
- **Surfaces** — `apps/web` (dashboard, live SSE scan room, finding, recipes, going-live),
  `apps/github-app` (Probot: opens a check, queues a scan, resolves the check red/green),
  `apps/mcp-server` (your own AI tool pulls a finding and writes the fix), and `packages/cli`
  (`redline policy`, `redline scan`, `redline verify-deploy`).

## Audit trail

Each candidate records the provider receipt proving which model found it; each referee run records
the measured balance deltas. The public proof (`/api/findings/[id]/proof`) publishes the discovery
receipt and the verification receipts — the votes anyone can re-check — without the runnable attack.
