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
