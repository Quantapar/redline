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
