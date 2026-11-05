# Contributing

## Setup
See `docs/SETUP.md`. In short: `pnpm install`, create the `redline` and `redline_test` databases,
`pnpm --filter @redline/db push`, then `pnpm --filter @redline/web dev`.

## Checks (what CI runs)
```bash
pnpm install --frozen-lockfile
pnpm --filter @redline/db push      # DATABASE_URL points at a test database
pnpm -r typecheck
pnpm -r test                        # TEST_DATABASE_URL + REDIS_URL set
```
All packages are source-first TypeScript (no build step needed to run); the apps run through
Next.js and tsx.

## Conventions
- Keep the consensus core (`packages/shared`) pure and exhaustively tested — a red alarm must only
  ever come from reproduced consensus.
- Style the web through Kobra component variants and theme tokens, not raw palette classes.
- Never commit secrets. Real values live in gitignored `.env` / `.env.local`; only `*.example` files
  are tracked.

## Layout
See `docs/ARCHITECTURE.md` for the system and `README.md` for the package map.
