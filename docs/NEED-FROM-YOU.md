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
Before flipping I'll run a secret-scan over history to be 100% sure no key ever landed
in a commit (they're all in gitignored `.env`, so this should be clean).

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

## Update (Foundry)
- Foundry (forge/anvil) install keeps getting blocked by the sandbox (its one-line
  installer pipes external code to a shell). When you're back, approve it or run:
  `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- Until then the engine runs on the deterministic simulation. A ready-to-run Foundry
  fixture (vulnerable vault + a real reentrancy PoC) is in fixtures/vault/ to validate
  the real fork path the moment Foundry is installed.

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
