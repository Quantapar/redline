/**
 * A small in-memory fixed-window rate limiter. Guards the endpoints that spend
 * money (model calls) from abuse. For multi-instance deployments this moves to
 * Redis; for one instance it caps per-key request rate cheaply.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (w.count >= limit) return { ok: false, retryAfterMs: w.resetAt - now };
  w.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'local').trim();
}
