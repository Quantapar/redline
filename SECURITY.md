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

## Handling of secrets and customer code
- Secrets live only in gitignored `.env` / `.env.local`; only `*.example` files are committed.
- Saved attacks are encrypted at rest with a customer-held key.
- A finding's runnable attack is redacted server-side and unlocked only on proof of contract ownership.
- Each scan is meant to run in its own sealed, throwaway sandbox.

We never claim a contract is "safe" — only that it survived these attacks at this time.
