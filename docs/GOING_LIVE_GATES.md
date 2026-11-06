# Going-live gates (design)

Redline does not run deployments. Instead it guards the moments code goes live, so a
red (reproduced) finding cannot reach production. Three gates, partner ENS for the
deploy lock and agent identities.

## 1. GitHub merge gate (built)
The GitHub App posts a Check Run. A reproduced theft sets the check to `failure`, and
branch protection blocks the merge. See `apps/github-app`.

## 2. Deploy lock (ENSv2 Enhanced Access Control) — planned on-chain; verify-deploy built
A text record on the project's ENS name holds the approved version (e.g. the commit
or artifact hash that last passed the council). EAC is configured so only the referee
council's key(s) may change that record.
- Deploy script reads the record and refuses to publish anything whose hash is not the
  approved one.
- Build the demo on Sepolia unless ENS confirm mainnet.
- Open question for ENS booth: how to lock a permission to exactly one key/group
  (master key + up to 15 holders). See NEED-FROM-YOU.md.
- Each agent/referee gets its own ENS sub-name + resolver → on-chain identity for the
  published council votes.

## 3. Safe transaction guard — planned
For teams using a Safe multisig, a Guard contract checks Redline's latest verdict for
the version being deployed and reverts a deploy transaction that carries an unresolved
red finding. The result is shown in the Safe UI before anyone approves.

## Implementation plan (packages/gates)
- `deploy-lock.ts` — **built, tested.** Pure verification of a candidate hash against the
  approved-version record and the council key(s); exposed today through `redline
  verify-deploy`, which fails closed. The on-chain ENS text-record read/write is planned.
- `attestation.ts` — **built.** The council's signed {versionHash, verdict, votes}
  attestation that the deploy lock and Safe guard both read.
- `safe-guard.sol` — **planned.** A minimal Safe Guard that reverts a deploy transaction
  carrying an unresolved red finding, plus a helper to publish the attestation on-chain.

The verification logic (`deploy-lock.ts`, `attestation.ts`) is pure and unit-tested; the
on-chain pieces (ENS record, Safe guard) target Sepolia and are not yet built.
