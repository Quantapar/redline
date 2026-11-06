# Redline MCP connector

Lets a developer's own AI coding tool (any MCP client) pull a reproduced finding and
the vulnerable source, and write the fix itself — an alternative to Redline's own Fix-it.

## Tools
- `redline_list_findings(repo, onlyRed?)` — reproduced findings for a repository (owner/repo).
- `redline_fix_context(findingId)` — the vulnerable contract source + the finding, so your AI
  tool writes the fix. It returns the plain finding and source, never a weaponised exploit.

## Run (stdio)
```bash
pnpm --filter @redline/mcp-server start
```

## Register with a client (example)
Add it to your MCP client's server config:
```json
{
  "mcpServers": {
    "redline": { "command": "pnpm", "args": ["--filter", "@redline/mcp-server", "start"] }
  }
}
```
Requires `DATABASE_URL`. The server reads findings from the same Postgres as the dashboard.
