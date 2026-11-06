# Security policy

Redline is a security tool, so we hold our own code to the bar we set for others.

## Reporting a vulnerability
Please do not open a public issue for a security problem. Report it privately through GitHub's
"Report a vulnerability" (Security → Advisories) on this repository. Include what you found, how to
reproduce it, and the impact. We aim to acknowledge within a few days.

## Scope
In scope: the services in this repo — the scan pipeline, the referee council and its consensus, the
model-router client, the GitHub App, the API routes, the CLI, and the MCP server.

Out of scope: the intentionally-vulnerable fixtures under `fixtures/` and any contract a scan targets
(those are the subject of a scan, not part of Redline).

## The two-room guarantee and its current limit
The core promise is "proof, not opinion": a finding turns red only when independent referees
re-run the attack as **plain transactions**, with Foundry cheatcodes removed, and still see value
move. Cheatcodes (`vm.deal`, `vm.prank`, raw calls to the cheatcode precompile, etc.) fabricate
advantage and must not reach a referee run.

Two layers enforce this:
1. **Static stripping/detection** (`packages/engine/src/cheatcodes.ts`). A source-text scanner
   removes cheat-bearing lines and refuses any candidate where a cheat survives. It catches the
   inherited `vm`/`hevm` handle, bare forge-std helpers, aliasing the `Vm` interface, and any
   reference to the cheatcode precompile address `0x7109…DD12D`.
2. **Execution-level isolation** — the real guarantee, now implemented in
   `packages/engine/src/broadcast.ts`. Static text matching alone cannot be trusted: a determined
   hunter can reach the cheatcode precompile without a literal token (e.g. an address computed at
   runtime, or a raw assembly call). The trustworthy defense is to run the attack as **broadcast
   transactions from a funded EOA** against an anvil node (fresh chain or fork), where the
   cheatcode precompile `0x7109…DD12D` is just a codeless address — a call to it succeeds as an
   inert no-op, so a cheat-dependent "exploit" fabricates nothing and simply fails to move money.
   `runBroadcastExploit` deploys the attacker as ordinary creation code, runs its entrypoint as a
   real transaction, and measures net theft from the attacker's **actual on-chain balance** (gas is
   paid by the EOA, so the contract balance is already net of gas). Because every step is a plain
   JSON-RPC transaction via `cast`, no cheatcode and no `ffi`/filesystem access is reachable at all.
   This is proven by `packages/engine/test/broadcast.test.ts`: a genuine reentrancy attacker drains
   a seeded vault (`moved`, ≥ the honest deposit), while a `CheatAttacker` that calls
   `vm.deal(address(this), 1000 ether)` nets **exactly zero** (`did-not-move`) — the same call that
   would "succeed" under `forge test`.

   PR-authored contract source paths are also normalised through `safeProjectPath` before any file
   is written into the sandbox project, rejecting absolute paths and `..` traversal so a crafted
   filename cannot escape the project dir.

**The measurement now runs through the execution path.** The default `FoundryRefereeEngine`
(`packages/engine/src/foundry-referee.ts`) no longer measures via `forge test`, and never reads
anything the attack prints. For each candidate it compiles the attacker contract against the
prepared project (ffi off, empty `fs_permissions`), starts an anvil node (a fork at the referee's
block, or a fresh chain), deploys the contract under review and replays the candidate's honest-user
setup from a separate wallet, then runs the attack through `runBroadcastExploit` — a real
transaction from a funded EOA, where the cheatcode precompile is a codeless no-op. The verdict comes
only from measured balances: `theftFromTarget` requires value to leave the TARGET and land with the
attacker, both at or above the threshold, so a gain funded by the attack's own setup (or by anything
other than the contract under review) is not counted as a theft. A candidate without a runnable
`ExploitPlan`, a build failure, or a reverted attack can never be `moved`.

Two further checks make a red impossible to fake by assertion:
- **Vote audit** (`auditRun`, `packages/shared/src/consensus/money.ts`): before the council tally,
  any `moved` run whose deltas are missing or do not reconcile with the measured before/after
  balances (`deltaIsConsistent`) is demoted to `error`. An error is never a valid vote, so it can
  never contribute to a red.
- **Fail closed on the toolchain**: `createRefereeEngine` throws when Foundry is absent instead of
  silently using the simulation. The deterministic simulation engine (which reads a `@redline-sim`
  directive from the attack text) is now OPT-IN only — `preferSimulation`, or
  `REDLINE_REFEREE=simulation` — and is for offline dev, CI and the in-app demo, never a production
  default.

The toolchain also runs with a scrubbed environment (`toolEnv`): forge/cast/anvil receive only a
small allowlist (PATH, HOME, TMPDIR, Foundry config), never the worker's secrets, so an attack that
reaches `vm.envString` on a mis-stripped path finds nothing to exfiltrate.

**Remaining (tracked):** an end-to-end run of the broadcast-based council against a real archive RPC
on a forked mainnet target (fork path: the plan supplies the deployed target address). The
fresh-chain path is covered end to end by `packages/engine/test/foundry-referee.test.ts`, which
proves a genuine reentrancy reproduces (target loses what the attacker gains) while an attacker that
only *claims* a huge net, one that reaches the cheatcode precompile through a runtime-assembled
address, and one run against an empty vault all net exactly zero.

## Handling of secrets and customer code
- Secrets live only in gitignored `.env` / `.env.local`; only `*.example` files are committed.
- Saved attacks are encrypted at rest with a customer-held key.
- A finding's runnable attack is redacted server-side and unlocked only on proof of contract ownership.
- Each scan is meant to run in its own sealed, throwaway sandbox.

We never claim a contract is "safe" — only that it survived these attacks at this time.
