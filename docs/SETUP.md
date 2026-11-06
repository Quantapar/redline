# Local setup

## Prerequisites
- Node 20+ and pnpm 9
- PostgreSQL 14+ running locally
- Redis running locally
- Foundry (`forge`, `anvil`) for real fork-based verification (optional; the engine
  falls back to a deterministic simulation when Foundry is absent)

## Install
```bash
pnpm install
cp .env.example .env          # fill in keys; blank keys fall back to offline fixtures
createdb redline
createdb redline_test
pnpm --filter @redline/db push
DATABASE_URL=postgresql://$USER@localhost:5432/redline_test pnpm --filter @redline/db push
```

## Seed demo data (runs real scans through the pipeline)
```bash
pnpm exec tsx scripts/seed-demo.mts
```

## Run
```bash
pnpm --filter @redline/web dev        # dashboard on http://localhost:3000
pnpm --filter @redline/worker start   # scan worker (BullMQ)
```

## Run with Docker (full stack + the real Foundry council)
`docker compose up` brings up Postgres, Redis, the dashboard, and the scan worker. The worker image
ships Foundry, so the real fork-based council runs inside the container without any host install.

```bash
cp .env.example .env     # fill in OG_ROUTER_API_KEY, ARCHIVE_RPC_URLS, ENCRYPTION_KEY
docker compose up --build
```

The dashboard is on http://localhost:3000; the worker processes scans off the queue.

## Web app env (apps/web/.env.local)
The Next.js app reads its own `.env.local` (gitignored). It needs:
```
KOBRA_TOKEN=...            # UI component registry
DATABASE_URL=...           # same Postgres as the worker
REDIS_URL=redis://localhost:6379
OG_ROUTER_API_KEY=...      # for the Fix-it flow and the live demo scan
ENCRYPTION_KEY=...         # 32-byte base64; encrypts saved attacks at rest
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Check your setup
`pnpm smoke` verifies every external dependency (Postgres, Redis, the 0G router, the archive RPC,
and whether Foundry is installed) and exits non-zero if any is unreachable.

## Keys (.env)
- `OG_ROUTER_API_KEY` — the model router. Blank → the model layer uses fixtures.
- `ARCHIVE_RPC_URL` — archive RPC for forking a chain at a block.
- `KOBRA_TOKEN` (web `.env.local`) — the UI component registry.
- GitHub App secrets — see `GITHUB_APP.md`.

## Install Foundry (for real verification)
```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```
