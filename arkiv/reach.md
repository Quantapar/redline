# Reach

Who this is for and how it spreads.

- **Solidity teams using Redline**: every scan reads the shared library, so a recipe published by
  anyone immediately makes every customer's next scan stronger.
- **Other security tools**: the library is a named schema on a public chain. Any fuzzer, scanner,
  or agent can read `redline.recipes` with the SDK or raw JSON-RPC and use the same templates.
  Nothing about the entities is Redline-specific except the `redlineId` idempotency key.
- **Auditors and protocol users**: `redline.proofs` is a public ledger of reproduced thefts with
  referee receipts. A protocol can link its finding's proof entity in a disclosure instead of a
  screenshot.
- **Watch mode is the growth loop**: a new hack in the world becomes a recipe, lands on Arkiv, and
  every enabled repository is re-tested against it. The library grows with the threat landscape,
  not with our roadmap.

Current writer: a single Redline wallet (README). Next: per-contributor ownership for community
recipes, where the contributor's own wallet creates the entity and Redline only reads.
