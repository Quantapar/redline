import { describe, it, expect, afterEach } from 'vitest';
import { isUuid } from '../lib/validate';
import { requireAdmin } from '../lib/auth';

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
