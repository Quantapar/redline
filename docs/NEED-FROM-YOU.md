# Need from you (when you're back)

Running list of things only you can do or decide. I update this as I go.
Nothing here blocks the build — everything below has a working fallback in place.

## Received (done)
- [x] GitHub account for repo + App: **Quantapar**, repo **private** for now.
- [x] 0G Compute Router API key — stored in `.env`, verified (124 models live).
- [x] Alchemy mainnet archive RPC — stored, verified (block ~26,350,718).
- [x] Alchemy Sepolia RPC (from the "testing" app key) — stored, verified.
- [x] Kobra registry token — stored in `.env`; wired via shadcn registry in the web app.
- [x] Hugeicons key — stored in `.env`.
- [x] Second partner to build deep: **ENS** (deploy-lock + agent identities).
- [x] Stripe — **skipped for now** per your call; billing is stubbed behind an interface.

## Still needed (have fallbacks, not blocking)

### 1. GitHub App registration  (I'll walk you through it)
To make the GitHub App live (install on real repos, receive webhooks), you register
an App at github.com/settings/apps/new under the Quantapar account. It produces three
secrets I can't generate for you:
- App ID
- a private key (.pem download)
- a webhook secret (you choose it)
I'll give you the exact field-by-field checklist when you're back. Until then the App
runs against a local webhook simulator with fixture payloads, fully testable.

### 2. Sepolia test wallet (for the ENS / Safe going-live demo only)
Not an API key — a real wallet secret. I will GENERATE a throwaway wallet for the demo
so you never hand me a real private key. You only need to:
- fund its address with Sepolia test ETH from a faucet (I'll give you the address), and
- (optional) pick an ENS name on Sepolia for the deploy-lock demo.
This is only for the going-live gate demo, which is the last feature, so no rush.

### 3. Decide when to flip the repo public
You said we go public to follow ETHGlobal rules. Tell me the moment and I'll flip it.
Secret-scan status (2026-11-06): I scanned the **entire commit history** for every
key you gave me (0G, Alchemy mainnet + Sepolia, Kobra, Hugeicons) and for PEM private
keys — **zero hits**. The real `.env` / `.env.local` are gitignored and untracked; only
the no-secret `.env.example` and `apps/web/.env.local.example` placeholders are committed.
So it is clean to flip today; I'll re-run the scan right before flipping, just to be sure.

### 4. Booth questions for partners (from the brief, Part 6 — your conversations)
Not for me to build, parking them here so we don't forget:
- 0G: which models run in fully-private (nothing-kept) mode vs routed; can we host a
  self-chosen security model in their private compute; does a dev tool qualify; rate limits.
- ENS: how to lock a permission to exactly one key/group (master key + up to 15 holders);
  does each agent need its own resolver; confirm ENS controls who-can-change only.
- All three: can one project win multiple prizes; must each feature be central or just used.

## Notes / decisions I made for you (flag if you disagree)
- Monorepo: pnpm workspaces + Turborepo.
- DB: PostgreSQL + Drizzle. Queue: Redis + BullMQ. Both running locally.
- Scope line on the sensitive part: the AI layer is a generic, model-agnostic router
  client that generates proof-of-concept tests against YOUR OWN contracts in a sandbox.
  No jailbreaks, no canned weaponized exploits against third-party live contracts, and
  the ownership-proof gate ships as a hard requirement. Say the word if you want this
  revisited.

## Update (web build)
- Hugeicons: using the FREE set (@hugeicons/core-free-icons, ~14.9k icons, same API). Your Pro
  key is stored; if you want Pro icon variants we can switch the import once I confirm their
  private-registry .npmrc setup. Not urgent — free covers everything on screen.
- Kobra components shipped without 'use client' on a few hook-using files; I added the directive.
  Harmless, but flagging since we edited their generated files.

## Update (GitHub App)
- The Redline GitHub App (Probot) is BUILT and unit-tested (intake + check output).
- Full registration checklist is in docs/GITHUB_APP.md (5 min in GitHub's UI). It needs:
  App ID, a private key .pem, and a webhook secret — the three things only you can create.
- Not blocking: everything else runs without it.

## Update (repo + license)
- Private repo created: github.com/Quantapar/redline (not pushed until the review clears).
- Added MIT LICENSE (ETHGlobal usually requires an OSI license for public repos). Change the
  license or the copyright holder line if you'd prefer something else.
- Added a CI workflow (.github/workflows/ci.yml): Postgres + Redis services, typecheck + tests.

## Update (Foundry — exact step)
Foundry can't be installed automatically in a sandboxed environment (neither the `curl | bash`
installer nor a direct binary download works there). To unlock the REAL fork-based council,
**run this in a terminal**:

```
curl -L https://foundry.paradigm.xyz | bash && ~/.foundry/bin/foundryup
```

Once `forge` and `anvil` are on PATH, the engine's FoundryRefereeEngine takes over from the
simulation automatically, and `fixtures/vault/` is ready to validate it. Everything else runs
without it.

## Update (Foundry)
- Foundry (forge/anvil) install keeps getting blocked by the sandbox (its one-line
  installer pipes external code to a shell). When you're back, approve it or run:
  `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- Until then the engine runs on the deterministic simulation. A ready-to-run Foundry
  fixture (vulnerable vault + a real reentrancy PoC) is in fixtures/vault/ to validate
  the real fork path the moment Foundry is installed.

## Update (referee cheat isolation — security-critical, decide before trusting real-fork reds)
An independent review of the cheatcode defense found that source-text detection alone can be
evaded: a hunter can alias the `Vm` handle or call the cheatcode precompile address directly, and
because every referee is fooled the same way, the council could reach a false RED. I hardened the
static scanner to catch every demonstrated vector (precompile address, `Vm` cast/alias, the `hevm`
handle, `changePrank`/`deployCode`) and the referee now refuses any candidate where a cheat
survives — so the bar is much higher and all current paths stay safe (the simulation path never
runs untrusted code; without Foundry the real path can't run at all).

But static matching can't be the *guarantee*. The real fix is execution-level: when Foundry is
installed, `FoundryRefereeEngine` should run the attack as **broadcast transactions from a funded
EOA** against the fork (not as a `forge test`), where the cheatcode precompile is inert. That's a
focused engine change I can build once Foundry is available to verify it end-to-end. Until then, a
red from the real fork path is defense-in-depth, not a full proof. Full write-up in SECURITY.md.
**Nothing ships a false guarantee today** — flagging so you can decide the priority of this
hardening relative to the demo. One more thing that engine step must do when it writes each
contract's source into the sandbox project: the file path comes from the PR author, so it has to
be normalised and checked for traversal (`..`, absolute paths) before being joined into a local
write path, or a crafted filename could escape the project dir. Noted in code at prepare.ts.

## Update (referee independence)
- For the REAL fork-based council (once Foundry is installed), referees should fork from
  INDEPENDENT RPC providers. Set ARCHIVE_RPC_URLS to a comma-separated list (e.g. Alchemy, Infura,
  Ankr). With a single provider the rooms share an upstream, which weakens the independence claim.
  Right now only one Alchemy URL is configured.

## Update (auth state, accurate)
- The mutation endpoints now block cross-site POSTs (same-origin CSRF guard), and the admin-only
  /api/watch requires REDLINE_ADMIN_TOKEN when set. That closes browser-based cross-site abuse.
- What's still open: a direct (non-browser) client with the URL can call the user-facing mutations
  (resolve a finding, run a scan). For a single-tenant demo that's acceptable; for multi-tenant
  production the real fix is a session-auth layer (GitHub OAuth) in front of the dashboard. It's a
  deliberate next-days item (changes the UX — adds login), not a quick patch. Decide when to add it.

## Update (Foundry — INSTALLED ✓, 2026-11-06)
You ran the installer: Foundry v1.9.0 (forge/cast/anvil/chisel) is live on this machine.
- Verified the engine's real path end-to-end: `fixtures/vault/` (vulnerable vault + real
  reentrancy PoC) compiles and reproduces the theft under `forge test` —
  `REDLINE_NET: 11 ETH` drained (10 honest + 1 attacker stake), test PASSES. That pass is
  exactly the fact the referee council votes on.
- `createRefereeEngine()` now auto-selects `FoundryRefereeEngine` (confirmed by factory test);
  simulation remains the fallback when Foundry is absent.
- Full suite still green (279) with Foundry present; the worker's queue-e2e test, previously
  skipped, now runs. (`forge install` restores `fixtures/vault/lib/forge-std`; it's gitignored.)

Remaining Foundry-related work (my side, not blocking you):
- Execution-level referee hardening: run each attack as **broadcast transactions from a funded
  EOA** against the anvil fork (not `forge test`), so the cheatcode precompile is inert — turns
  the static cheat scanner from defense-in-depth into a real guarantee. This is the substantial
  engine change; I'll run an independent review on it before pushing.
- Path-traversal normalisation when writing PR-authored contract sources into the sandbox
  (noted at prepare.ts) — pairs with the above.

## Update (referee now measures the theft — 2026-11-06)
The thing the earlier log flagged as "defense-in-depth, not a full proof" is now a full proof on
the fresh-chain path, and the forgeable self-report is gone. The real referee runs each attack as
broadcast transactions and reads only measured balances (value must leave the target AND land with
the attacker). A red can no longer be faked by printing a number; a vote that isn't backed by
consistent measured deltas is demoted before the tally; and the worker fails closed when Foundry is
absent. Details in docs/BUILD-LOG.md and SECURITY.md.

What's still only on my side (not blocking you):
- One end-to-end run of the broadcast council against a real archive RPC on a FORKED mainnet target
  (needs ARCHIVE_RPC_URLS set and a chosen target address in the plan). The fresh-chain path is
  covered by tests.
- The GitHub-App/worker path emits deployable attackers from real hunter models against real PRs —
  the fresh-chain reproduction works; validating fork-target reproduction end to end is the same
  archive-RPC run above.

New env knobs (all optional, safe defaults; see .env.example): REDLINE_MUTATION_SECRET,
ALLOW_INSECURE_WEBHOOK, REDLINE_REFEREE, REDLINE_DEMO, FIX_GLOBAL_PER_MIN, REDLINE_SCAN_QUEUE.
Note: in production (NODE_ENV=production) ENCRYPTION_KEY and GITHUB_WEBHOOK_SECRET are now REQUIRED
(the services refuse to start/encrypt without them) — this is deliberate fail-closed behaviour.

Decision for you: full per-user authorization on the dashboard mutations (resolve a finding, run a
scan, generate a fix) still needs the GitHub OAuth session layer. The current build closes the
blind-curl/cross-site hole with an HMAC CSRF token, which is enough for a single-tenant demo but is
not per-user authz. Tell me when you want the OAuth login layer (it adds a sign-in step to the UX).

## Update (repo is PUBLIC — 2026-11-06)
- Flipped Quantapar/redline to public after a final full-history secret scan: the 6 real
  credentials (0G, Alchemy mainnet+Sepolia, Kobra, Hugeicons, ENCRYPTION_KEY) had zero hits;
  the only matches were public config defaults (localhost URLs, 0G public base URL, passwordless
  local DB/redis strings) that live in tracked *.example files by design. No PEM keys in history.
