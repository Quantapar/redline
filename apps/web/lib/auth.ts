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
export function sameOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get('origin');
  if (!origin) return null; // non-browser client; no CSRF risk
  try {
    if (new URL(origin).host !== new URL(req.url).host) {
      return NextResponse.json({ error: 'cross-origin request blocked' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  return null;
}
