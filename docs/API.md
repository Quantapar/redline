# HTTP API

All routes run on the Next.js server (`apps/web`). JSON in, JSON out. The write
endpoints that spend money or mutate state are rate-limited per client.

## Health
`GET /api/health` → `{ status, checks: { db, redis } }`. 200 when healthy, 503 when degraded.

## Scans
- `POST /api/scans/run` — start a scan and stream it. Returns `{ scanId }`. Rate-limited.
- `GET /api/scans/:id/status` → `{ status, redCount }`. 404 if unknown.
- `GET /api/scans/:id/stream` — Server-Sent Events of the scan (stage, candidate, referee,
  finding, done). Backed by Redis pub/sub.
- `POST /api/scans/:id/cancel` → `{ cancelled, reason }`. 200 cancelled, 409 already finished,
  404 unknown.

## Findings
- `POST /api/findings/:id/fix` — generate a fix for a reproduced finding (422 if not red). Returns
  `{ explanation, diff, branch }`. Rate-limited; one model call, cached per finding.
- `POST /api/findings/:id/status` — body `{ status: open|acknowledged|resolved|reopened }`.
  400 invalid, 404 unknown.
- `GET /api/findings/:id/proof` — the public, verifiable proof: the council's votes and
  balance-delta receipts plus the discovery receipt. Never includes the runnable attack.

## Going-live gate
`GET /api/deploy-check?repo=owner/repo&version=<sha>` → `{ allowed, reason }`. Blocks a red or
unchecked version. The `redline verify-deploy` CLI calls this and exits non-zero when blocked.

## Watch mode
`POST /api/watch` — body `{ weaknessClass, title, template, chain?, severity?, labels? }`.
Turns a new hack into a shared recipe and queues a re-scan of every repo. Returns
`{ recipeId, scansQueued }`. Rate-limited.

## MCP
A separate stdio server (`apps/mcp-server`) exposes `redline_list_findings` and
`redline_fix_context`. See `docs/MCP.md`.
