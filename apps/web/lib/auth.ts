import { NextResponse } from 'next/server';

/**
 * Admin guard for ops-only endpoints. When REDLINE_ADMIN_TOKEN is set, the
 * request must carry `Authorization: Bearer <token>`. When it is unset (local
 * dev), the guard is a no-op so the demo works. User-facing mutations need the
 * session-auth layer (GitHub OAuth) — tracked in docs/ROADMAP.md — not this.
 */
export function requireAdmin(req: Request): NextResponse | null {
  const expected = process.env.REDLINE_ADMIN_TOKEN;
  if (!expected) return null; // dev: open
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Same-origin guard for state-changing requests. Blocks a browser on another
 * site from POSTing to our endpoints (cross-site request forgery) without
 * needing a login: a same-origin fetch carries a matching Origin; a cross-site
 * one does not. A direct non-browser client (no Origin) is allowed through —
 * the real defence for those is the session-auth layer (see ROADMAP).
 */
/**
 * The hosts a same-origin request may carry. Behind a reverse proxy or tunnel
 * (e.g. Cloudflare), the request reaches the app as `localhost:3000` while the
 * browser's Origin is the public hostname, so comparing Origin to the local host
 * alone wrongly rejects legitimate same-origin requests. We therefore also accept
 * the forwarded host the proxy sets, and an explicitly configured public origin.
 * This only governs the Origin check; the HMAC CSRF token remains the real gate.
 */
function allowedHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  try { hosts.add(new URL(req.url).host); } catch { /* ignore */ }
  const fwd = req.headers.get('x-forwarded-host');
  if (fwd) for (const h of fwd.split(',')) hosts.add(h.trim());
  const pub = process.env.REDLINE_PUBLIC_ORIGIN;
  if (pub) { try { hosts.add(new URL(pub).host); } catch { /* ignore */ } }
  return hosts;
}

export function sameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) return null; // non-browser client; no CSRF risk
  try {
    if (!allowedHosts(req).has(new URL(origin).host)) {
      return NextResponse.json({ error: 'cross-origin request blocked' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  return null;
}

// ---- Mutation authorization (CSRF + optional bearer) --------------------------
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Secret backing the mutation (CSRF) token. Prefers a dedicated secret, then the
 * at-rest ENCRYPTION_KEY. The whole guarantee of requireMutationAuth — that a blind
 * client cannot forge a token — rests on this secret being unknown, so in
 * production a missing secret is a HARD failure (fail closed), mirroring
 * crypto.ts / the GitHub App's webhook-secret check. Only local dev falls back to
 * a clearly-marked constant, and never silently in production.
 */
function mutationSecret(): string {
  const configured = process.env.REDLINE_MUTATION_SECRET || process.env.ENCRYPTION_KEY;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'REDLINE_MUTATION_SECRET (or ENCRYPTION_KEY) is required in production; refusing to sign mutation tokens with the world-known dev fallback, which would let anyone forge them.',
    );
  }
  return 'redline-dev-mutation-secret';
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Mint a short-lived mutation token to embed in a server-rendered page. It is an
 * HMAC over an expiry, so it cannot be forged without the server secret: a blind
 * client that never loaded one of our pages cannot produce a valid token. This is
 * CSRF/again-blind-request defence, not per-user authorization — every viewer of
 * a page gets a usable token. Real per-user authz is the GitHub OAuth session
 * layer tracked in docs/ROADMAP.md; until then these mutations are single-tenant.
 */
export function issueMutationToken(now = Date.now()): string {
  const exp = now + TOKEN_TTL_MS;
  const mac = createHmac('sha256', mutationSecret()).update(String(exp)).digest('hex');
  return `${exp}.${mac}`;
}

function verifyMutationToken(token: string | null, now = Date.now()): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const exp = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = createHmac('sha256', mutationSecret()).update(String(exp)).digest('hex');
  if (mac.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Guard a state-changing endpoint. A request is allowed when EITHER it carries a
 * valid admin bearer token (programmatic/ops use) OR it is same-origin AND carries
 * a valid mutation token minted for one of our pages. Unlike the old same-origin
 * check, a request with NO Origin and NO token is now REFUSED — that was the hole
 * that let `curl` resolve a finding or cancel a scan. Returns a 403 response to
 * send back, or null when the request may proceed.
 */
export function requireMutationAuth(req: Request): NextResponse | null {
  // Ops/programmatic path: a configured admin bearer token always suffices.
  const expectedAdmin = process.env.REDLINE_ADMIN_TOKEN;
  if (expectedAdmin) {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (token === expectedAdmin) return null;
  }
  // Browser path: reject a cross-origin request outright (proxy-aware; see allowedHosts).
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (!allowedHosts(req).has(new URL(origin).host)) {
        return NextResponse.json({ error: 'cross-origin request blocked' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'bad origin' }, { status: 403 });
    }
  }
  // Require a valid mutation token. This blocks a blind client (no Origin, no
  // token) — the case the bare same-origin check used to let through.
  if (!verifyMutationToken(req.headers.get('x-redline-csrf'))) {
    return NextResponse.json({ error: 'missing or invalid mutation token' }, { status: 403 });
  }
  return null;
}

/**
 * Whether the demo-only endpoints (the paced, simulated showcase scan) are
 * enabled. These write findings from the deterministic simulation — NOT from a
 * measured referee — so they must never be reachable as if they were real proof.
 * On in production they require an explicit opt-in; in local dev they default on.
 */
export function isDemoEnabled(): boolean {
  if (process.env.REDLINE_DEMO === '1') return true;
  if (process.env.REDLINE_DEMO === '0') return false;
  return process.env.NODE_ENV !== 'production';
}
