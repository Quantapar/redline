# Arkiv schema

Network: Arkiv testnet **Rabdi** (chain id 7794095, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`).
Writer wallet: see the "Arkiv" section of the root README.
Code: `packages/arkiv/src/index.ts` (schemas, writes, reads).

Two named schemas. Arkiv tags every entity with an indexed `arkiv.schema` attribute holding the
schema name, so a query through the schema only matches Redline's entities.

## `redline.recipes` — the shared attack-recipe library

One entity per attack pattern. The swarm reads the whole collection at the start of every scan and
hands the templates to the hunters as hints. No private customer code is ever stored here: a
recipe is a generic, parameterised description of an attack class.

| attribute | type | indexed | meaning |
| --- | --- | --- | --- |
| `redlineId` | str | yes | Redline's own id for the recipe (idempotency key for re-publishing) |
| `weaknessClass` | str | yes | `reentrancy`, `access-control`, `oracle-manipulation`, … (Redline's enum) |
| `severity` | str | yes | `critical` / `high` / `medium` / `low` / `info` |
| `source` | str | yes | `seed`, `watch-mode` (a new hack turned into a recipe), `community` |
| `chain` | str | no | the chain the pattern was written for (`ethereum`, `any`) |
| `title` | str | no | short name (≤120 bytes) |
| `labels` | bytes | no | JSON array of free-form tags |
| `template` | bytes | no | the attack template text |

Lifetime: 90 days (`ExpirationTime.fromDays(90)`), re-publishing extends it.

## `redline.proofs` — public proof that money moved

One entity per **reproduced** finding (the referee council agreed the theft is real). It holds the
council's votes and balance receipts, which is everything needed to re-check the verdict, and
**never the runnable attack** (that stays encrypted and ownership-gated in Redline).

| attribute | type | indexed | meaning |
| --- | --- | --- | --- |
| `findingId` | str | yes | Redline finding id (idempotency key) |
| `verdict` | str | yes | `red` (reproduced) or `neutral` |
| `weaknessClass` | str | yes | as above |
| `severity` | str | no | judged severity, or `unrated` |
| `agreement` | str | no | e.g. `3/3`: referees that saw the money move / referees that ran |
| `title` | str | no | finding title |
| `proof` | bytes | no | JSON: `{ finding, council[{referee, provider, forkBlock, outcome, thresholdWei, deltas, receipt}], discovery, verifiable }` |

Lifetime: 90 days.

## Queries judges can run

```ts
import { createPublicClient } from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { http } from 'viem'

const client = createPublicClient({ chain: rabdi({ accessKey: '' }), transport: http() })

// every recipe
await client.select().where(eq('arkiv.schema', 'redline.recipes')).fetch()

// every reproduced theft
await client.select().where(eq('arkiv.schema', 'redline.proofs')).where(eq('verdict', 'red')).fetch()
```

Or with the typed schemas from `@redline/arkiv`: `listRecipes()` and `listProofs({ verdict: 'red' })`.
