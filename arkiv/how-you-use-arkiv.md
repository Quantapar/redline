# How Redline uses Arkiv

Redline is continuous security testing for smart contracts: a swarm of models writes attacks
against your contracts, and an independent referee council replays them on forked chains and only
raises an alarm when the money actually moves. Two pieces of that are public by design, and both
now live on Arkiv.

## 1. The recipe library is read from Arkiv on every scan

`packages/worker/src/pipeline.ts` → `loadRecipes()`. Before the hunt, the worker queries
`redline.recipes` on Rabdi and hands the templates to the hunters as "known attack patterns worth
trying". Postgres is only the fallback when Arkiv is off or unreachable.

Writes: `scripts/arkiv-publish.mts` publishes the seed library; **watch mode**
(`packages/worker/src/watch-mode.ts`) publishes every new recipe the moment a new hack is turned
into one, then re-tests every repository against it.

## 2. Every reproduced theft publishes its proof to Arkiv

`packages/worker/src/pipeline.ts`: when the council reproduces a theft, the worker calls
`publishFindingProof()` and writes the votes and balance receipts to `redline.proofs`. The log line
in the live scan room links to the entity on the Rabdi explorer.

## 3. What users see (reads from Arkiv)

- **`/recipes`** (`apps/web/app/recipes/page.tsx`): the library is read live from Arkiv, with the
  entity key and an explorer link on every card and a banner naming the schema and writer.
- **Finding page** (`apps/web/app/findings/[id]/page.tsx`): "Published on Arkiv" links to the
  proof entity once it exists.
- **`GET /api/findings/:id/proof`**: the public proof JSON, now with an `arkiv` block
  (`entityKey`, `explorerUrl`) so anyone can re-read it from the public database instead of
  trusting Redline's API.

## Doesn't count, and why this does

Arkiv is not a log here. The scan pipeline's hunt prompt depends on what the library on Arkiv
holds, and the recipes page renders from it. Remove Arkiv and the swarm falls back to a private,
local copy that nobody else can add to or read.
