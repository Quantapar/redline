import { describe, it, expect, afterEach, vi } from 'vitest';
import { isUuid } from '../lib/validate';
import { requireAdmin } from '../lib/auth';
import { rateLimit, clientKey } from '../lib/rate-limit';

describe('isUuid', () => {
  it('accepts valid uuids', () => {
    expect(isUuid('bb21e5df-e0fd-46cd-8ce3-01cebf65c33c')).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
  });
  it('rejects non-uuids (which would otherwise 500 the DB)', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('123')).toBe(false);
    expect(isUuid("'; drop table findings; --")).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('requireAdmin', () => {
  afterEach(() => { delete process.env.REDLINE_ADMIN_TOKEN; });
  const req = (auth?: string) => new Request('http://x', auth ? { headers: { authorization: auth } } : {});

  it('is open when no token is configured (dev)', () => {
    expect(requireAdmin(req())).toBeNull();
  });
  it('rejects a missing or wrong token when configured', async () => {
    process.env.REDLINE_ADMIN_TOKEN = 'secret';
    const noAuth = requireAdmin(req());
    expect(noAuth?.status).toBe(401);
    expect(requireAdmin(req('Bearer wrong'))?.status).toBe(401);
  });
  it('allows the correct bearer token', () => {
    process.env.REDLINE_ADMIN_TOKEN = 'secret';
    expect(requireAdmin(req('Bearer secret'))).toBeNull();
  });
});

describe('rateLimit (guards mutation endpoints from abuse)', () => {
  it('allows up to the limit, then blocks with a retry-after', () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
  it('tracks each client key independently', () => {
    const a = `a:${Math.random()}`, b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000).ok).toBe(true);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false); // a is spent
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);  // b is independent
  });
  it('resets after the window elapses', () => {
    vi.useFakeTimers();
    try {
      const key = `w:${Math.random()}`;
      expect(rateLimit(key, 1, 1000).ok).toBe(true);
      expect(rateLimit(key, 1, 1000).ok).toBe(false); // spent within the window
      vi.advanceTimersByTime(1001);
      expect(rateLimit(key, 1, 1000).ok).toBe(true);  // window reset, allowed again
    } finally {
      vi.useRealTimers();
    }
  });
  it('derives a client key from forwarded headers, falling back to local', () => {
    expect(clientKey(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }))).toBe('1.2.3.4');
    expect(clientKey(new Request('http://x'))).toBe('local');
  });
});

import { sameOrigin } from '../lib/auth';

describe('sameOrigin (CSRF guard)', () => {
  const req = (origin?: string) => new Request('http://localhost:3000/api/x', { method: 'POST', headers: origin ? { origin } : {} });
  it('allows a same-origin request', () => {
    expect(sameOrigin(req('http://localhost:3000'))).toBeNull();
  });
  it('blocks a cross-origin request', () => {
    expect(sameOrigin(req('https://evil.example'))?.status).toBe(403);
  });
  it('allows a request with no Origin (non-browser client)', () => {
    expect(sameOrigin(req())).toBeNull();
  });
});
