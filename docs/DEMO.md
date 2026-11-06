# Demo spine — red, replay, Fix it, green

The one path that shows the whole product in two minutes. Everything below is live,
not a mockup.

1. **Overview** (`/`). Repositories watched, scans run, red findings, forever-tests.
   The red findings are reproduced thefts, not guesses.

2. **Run a scan** (button, top right). It creates a scan and drops you into the live
   room. Watch the stages stream: Prepare → Hunt → Verify → Judge → Done.
   - A hunter model proposes a reentrancy attack on the vault.
   - Three referees each run it on an independent sandbox.
   - All three move the money → consensus **reproduced** → a red finding.

3. **The proof** (click the finding). The referee council panel shows each referee,
   its room, and the value it moved. The attack is shown as a Foundry test; its
   runnable form is locked until you prove you own the live contract.

4. **Fix it** (button). A mainstream model reads the vulnerable contract and returns
   the smallest fix — checks-effects-interactions — with a plain explanation and a
   diff. It opens on a branch with the attack saved as a permanent regression test.

5. **Forever-test**. The attack is saved and re-runs on every future change, so the
   bug can never quietly come back — a reproduced one is flagged as a regression.
   (Re-attacking the proposed fix on a fresh fork before merge activates with Foundry.)

## The one line
Others reason that a bug might be reachable. Redline proves it by taking the money
on a copy where nothing real is at stake — and only then raises an alarm.

## What's real in this build
- Live model calls through the router (hunters + the fixer).
- Real Postgres persistence, Redis-backed live streaming, the full scan pipeline.
- The council consensus, the two-room cheat defense, the budget cap, and the
  ownership gate are all enforced in code and unit-tested.

## What needs Foundry (honest scope)
Referees currently vote on a deterministic simulation of each attack, not a real
fork execution. Installing Foundry switches the engine to the real fork-based
referee and enables re-attacking a proposed fix before merge. Nothing here claims a
real-fork proof until that is on; see SECURITY.md for the isolation that step adds.
