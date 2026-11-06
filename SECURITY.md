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

**Remaining integration (tracked):** the execution-level engine above exists and is proven in
isolation. The default `FoundryRefereeEngine` still *measures* via `forge test` (where cheatcodes
are available) and leans on layer 1 to keep them out; switching the council's real-fork measurement
over to `runBroadcastExploit` requires candidates expressed as deployable attackers against the live
fork target, and an end-to-end run against a real archive RPC to validate (see item #5 in
`docs/NEED-FROM-YOU.md`). Until that measurement swap lands, a red verdict from the `forge test`
path is treated as **defense-in-depth, not a full proof**; the broadcast path, where it runs, is a
full proof. The deterministic simulation path (used for CI and demos) is unaffected, as it never
executes untrusted code.

## Handling of secrets and customer code
- Secrets live only in gitignored `.env` / `.env.local`; only `*.example` files are committed.
- Saved attacks are encrypted at rest with a customer-held key.
- A finding's runnable attack is redacted server-side and unlocked only on proof of contract ownership.
- Each scan is meant to run in its own sealed, throwaway sandbox.

We never claim a contract is "safe" — only that it survived these attacks at this time.
