# Architecture

## The two-room split

AI is creative but unreliable, and will cheat to look successful. Redline separates
*finding* from *proving*:

- **Hunters** (the swarm) may use any shortcut while searching for weak spots. They
  produce *candidates*: hypotheses with a proof-of-concept attack. A candidate is an
  opinion until it is reproduced.
- **Referees** decide the verdict by running the attack for real. The hunter's
  cheat shortcuts are stripped: the attack is reduced to plain transactions from one
  ordinary wallet funded only for gas, on a fresh fork. If the money moves, it is a
  bug; if not, no alarm.

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
webhook -> queue scan -> prepare (clone, detect, diff)
        -> static analysis (Slither, Aderyn)
        -> hunt (swarm, cheap models first, budget-capped)
        -> verify (referee council on candidates only)
        -> judge (panel)
        -> post check + live updates
```

Incremental scans probe only changed + connected code. A hard per-scan budget cap
(`BudgetGuard`) gates every model call.

## Misuse controls (mandatory)

- Findings are visible to all; the **runnable attack is locked** until the requester
  proves they control the live contract (`decideUnlock`).
- Each scan runs in its own sealed, throwaway sandbox, wiped after.
- Customer artifacts are encrypted at rest; attacks are stored only briefly.

## Subsystems

- **Swarm** (`packages/hunters`) — a model-agnostic OpenAI-compatible client for the 0G router.
  Cheap models run first across all targets; stronger tiers come in only where they stall. Every
  call is reserved against a hard per-scan budget before it is made. Sensitive attack-writing can
  route through the router's private/TEE mode.
- **Engine** (`packages/engine`) — sealed-room sandbox, the cheatcode stripper (so referees run
  plain transactions), Foundry fork + forge-test orchestration, Slither/Aderyn wrappers that
  degrade gracefully, and both a real and a simulated referee behind one interface.
- **Pipeline** (`packages/worker`) — a BullMQ queue so scans run in order and big customers do not
  block small ones. `runScan` chains prepare → hunt → verify → judge and persists everything, one
  bad candidate never sinking the whole scan. `watch-mode` turns a new hack into a recipe and
  re-tests every repo; `cancel` stops an in-flight scan.
- **Going-live gates** (`packages/gates`) — `canDeploy` allows a deploy only against a complete,
  green council attestation for that exact version, issued by a council key (ENS deploy lock); the
  same decision backs a Safe transaction guard.
- **Data** (`packages/db`) — PostgreSQL via Drizzle. Saved attacks are AES-256-GCM encrypted at
  rest with a customer-held key.
- **Surfaces** — `apps/web` (dashboard, live SSE scan room, finding, recipes, going-live),
  `apps/github-app` (Probot: opens a check, queues a scan, resolves the check red/green),
  `apps/mcp-server` (your own AI tool pulls a finding and writes the fix), and `packages/cli`
  (`redline policy`, `redline scan`).

## Audit trail

Each candidate records the provider receipt proving which model found it; each referee run records
the measured balance deltas. The public proof (`/api/findings/[id]/proof`) publishes the discovery
receipt and the verification receipts — the votes anyone can re-check — without the runnable attack.
