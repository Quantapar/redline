# Why Arkiv

Redline's recipe library and proofs are meant to be **shared and checkable by people who do not
trust Redline**. A security tool that says "we reproduced a theft, trust us" is just another
opinion. The council's receipts need to sit somewhere any team, auditor, or competing tool can
query without an API key from us.

What Arkiv gives that our Postgres cannot:

- **Queryable, not just stored.** Indexed attributes (`weaknessClass`, `verdict`, `source`) mean
  a judge or an auditor can ask "every reproduced reentrancy" with one query, no Redline involved.
- **Owned by whoever writes.** Each recipe entity names its owner. A community recipe stays the
  contributor's; Redline cannot edit or delete it. That is the right shape for a shared library.
- **Time-scoped.** Attack recipes age. A 90-day lifetime that is extended only when a recipe is
  re-published keeps stale patterns from piling up without a moderator.
- **Tamper-evident proofs.** Once the proof of a theft is an on-chain entity, Redline cannot
  quietly rewrite the agreement count or the deltas after the fact.
- **Ethereum-aligned.** Our users are Solidity teams. A GLM-powered chain with an EVM wallet is
  one less account to create.

What we tried before: a `recipes` table in Postgres with an `owner_wallet` and `expires_at`
column, pretending to be an owned, expiring, public database. Arkiv is that, for real.
