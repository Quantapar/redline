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
2. **Execution-level isolation** — the real guarantee. Static text matching alone cannot be
   trusted: a determined hunter can reach the cheatcode precompile without a literal token (e.g.
   an address computed at runtime, or a raw assembly call). The trustworthy defense is to run the
   referee's attack as **broadcast transactions from a funded EOA** against the fork, where the
   cheatcode precompile is inert — a call to it hits empty code and does nothing, so a
   cheat-dependent "exploit" simply fails to move money. The referee's forge config must also set
   `ffi = false` and empty `fs_permissions`, so that even if a cheat were reached, host command
   execution and filesystem access stay off. The forge invocation already never passes `--ffi`.

**Known limit (tracked):** the real fork-based referee (`FoundryRefereeEngine`) currently runs the
attack as a `forge test`, where cheatcodes are available, and relies on layer 1 to keep them out.
Until it is hardened to the broadcast-transaction model of layer 2, a red verdict from the real
fork path is treated as **defense-in-depth, not a full proof**. The deterministic simulation path
(used for CI and demos) is unaffected, as it never executes untrusted code. This is recorded as a
required hardening in `docs/NEED-FROM-YOU.md`.

## Handling of secrets and customer code
- Secrets live only in gitignored `.env` / `.env.local`; only `*.example` files are committed.
- Saved attacks are encrypted at rest with a customer-held key.
- A finding's runnable attack is redacted server-side and unlocked only on proof of contract ownership.
- Each scan is meant to run in its own sealed, throwaway sandbox.

We never claim a contract is "safe" — only that it survived these attacks at this time.
