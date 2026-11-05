# Redline

**Continuous security testing for smart contracts. Proof, not opinion.**

Static analysis and AI scanners tell you a bug *might* be reachable. Redline proves
it by reproducing the theft on a throwaway copy of the chain, where nothing real is
at stake. You only get an alarm when independent referees agree the money actually
moved — and the alarm comes with a replay you can run yourself.

## Screenshots

The dashboard — only reproduced thefts are shown, never guesses:

![Redline dashboard](docs/images/dashboard.jpg)

A finding — the referee council's proof, the value moved, and the attack (its runnable form
stays locked until you prove you control the contract):

![A reproduced finding](docs/images/finding.jpg)

## How it works

1. **Install** the GitHub App and pick your repos. It finds your contracts and test setup.
2. **First scan** probes the whole codebase once and shows a starting report.
3. **Every change** is probed incrementally — only what changed, plus connected code.
4. **Referee council** re-runs each candidate as plain transactions on independent
   fresh forks. A finding is red only if the referees agree value moved.
5. **Fix it** opens a PR with the smallest fix and saves the attack as a permanent
   regression test. The fix is re-attacked before it can go green.
6. **Going-live gates** block red code from merging or deploying.

The referee council is the heart of the product: the search can vary and cut corners,
but the verdict is a consensus of real runs voting on one fact — *did the money move?*

## What we promise

- Every alarm is real and comes with an attack you can run yourself.
- Every fix is checked against the attack that found the bug, forever.
- Your code stays private.

We never promise your code is "safe" or "bug-free," nor that we replace a human audit.
We say "survived these attacks, at this time."

## Monorepo layout

| Package | What it is |
| --- | --- |
| `packages/shared` | Domain model, the council consensus algorithm, budget and ownership guards |
| `packages/db` | PostgreSQL schema and data access |
| `packages/engine` | Fork orchestration (Foundry anvil/forge), static analysis, referee runs |
| `packages/hunters` | Model-agnostic swarm orchestration (OpenAI-compatible router client) |
| `packages/worker` | BullMQ job processors (scan pipeline) |
| `packages/cli` | `redline policy` and local tooling |
| `apps/github-app` | Probot GitHub App: webhooks and checks |
| `apps/web` | Next.js dashboard, live scan room, finding pages |

## Local development

Requires Node 20+, pnpm, Postgres, Redis, and Foundry.

```bash
pnpm install
cp .env.example .env     # fill in keys; blank keys fall back to offline fixtures
pnpm db:push
pnpm dev
```

See `docs/ARCHITECTURE.md` for the full design and `docs/SETUP.md` for toolchain setup.
