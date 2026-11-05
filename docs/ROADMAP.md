# Roadmap

Where the build stands and what comes next. We build end-to-end first, then polish component by
component — this tracks that.

## Done (end-to-end, tested)
- Referee council + two-room cheat defense, budget cap, ownership gate.
- Model swarm over the 0G router (cheap-first, escalating); live fixer.
- Scan pipeline (BullMQ) with live SSE scan room; queue → worker → Postgres proven.
- GitHub App (Probot): opens a check, queues a scan, resolves the check.
- Going-live gates (ENS deploy lock, Safe guard) + an enforceable `verify-deploy`.
- Watch mode, recipe library, security policy, encryption at rest, public proof, model receipt.
- Finding triage, scan cancellation, health check, rate limiting.
- CLI (`redline policy`, `redline scan`, `redline verify-deploy`), MCP connector.
- Dashboard with every view; prep-for-prod sweep applied (viewport, dvh, focus, mobile nav, errors).

## Needs you (unblocks live behaviour)
- Register the GitHub App (App ID, private key, webhook secret) — `docs/GITHUB_APP.md`.
- Approve the Foundry install (sandbox blocks the installer; Python 3.14 is too new for Slither) so
  the real fork-based council replaces the simulation.
- Provide independent archive-RPC providers (`ARCHIVE_RPC_URLS`) for true referee independence.
- A funded Sepolia wallet + an ENS name for the on-chain deploy-lock / Safe demo.
- Say when to flip the repo public.

## Polish, per component (the next days)
- Engine: wire the real Foundry referee end-to-end once Foundry is in; add a cheatcode AST pass.
- Swarm: tune the tier roster and per-model budgets against real cost data from 0G.
- Web: device QA (iPhone/Android drawer, safe-area, screen-reader order); richer replay view.
- GitHub App: finish the Fix-it PR flow and the check-completion octokit path against the live app.
- Partners: wire recipes to Arkiv, the deploy lock to ENSv2 EAC on Sepolia, and the Safe guard.
- Sandboxing: move scans into sealed throwaway VMs (Firecracker / Fly / E2B / Modal).
