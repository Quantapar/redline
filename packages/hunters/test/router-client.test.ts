import { describe, it, expect, vi, afterEach } from 'vitest';
import { OGRouterClient, retryAfterMs } from '../src/router-client.js';

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body,
  } as Response;
}
const okCompletion = { model: 'm', id: 'req-1', choices: [{ message: { content: '{"candidates":[]}' } }], usage: { total_tokens: 10 } };

afterEach(() => vi.unstubAllGlobals());

describe('OGRouterClient', () => {
  it('falls back to plain mode when the model rejects JSON mode', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(400, { error: { message: 'model does not support JSON mode' } }))
      .mockResolvedValueOnce(res(200, okCompletion));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OGRouterClient({ apiKey: 'k' });
    const r = await client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], jsonMode: true });
    expect(r.content).toContain('candidates');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // the retry must NOT carry response_format
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).response_format).toBeUndefined();
  });

  it('retries a 500 and then succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(500, 'upstream'))
      .mockResolvedValueOnce(res(200, okCompletion));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OGRouterClient({ apiKey: 'k' });
    const r = await client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    expect(r.model).toBe('m');
    expect(r.receipt).toBe('req-1');
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('throws a clear error without leaking the api key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(401, 'unauthorized')));
    const client = new OGRouterClient({ apiKey: 'super-secret-key' });
    await expect(client.chat({ model: 'm', messages: [] })).rejects.toThrow(/401/);
    await expect(client.chat({ model: 'm', messages: [] })).rejects.not.toThrow(/super-secret-key/);
  });

  it('sends the private-mode header only when private mode is on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200, okCompletion));
    vi.stubGlobal('fetch', fetchMock);
    await new OGRouterClient({ apiKey: 'k', privateMode: true }).chat({ model: 'm', messages: [] });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['x-0g-private']).toBe('true');

    fetchMock.mockClear();
    await new OGRouterClient({ apiKey: 'k', privateMode: false }).chat({ model: 'm', messages: [] });
    const headers2 = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers2['x-0g-private']).toBeUndefined();
  });

  it('requires an api key', () => {
    expect(() => new OGRouterClient({ apiKey: '' })).toThrow(/OG_ROUTER_API_KEY/);
  });

  it('honors a Retry-After header on 429, then succeeds', async () => {
    vi.useFakeTimers();
    try {
      const r429 = { ...res(429, 'slow down'), headers: { get: (k: string) => (k.toLowerCase() === 'retry-after' ? '2' : null) } } as Response;
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(r429)
        .mockResolvedValueOnce(res(200, okCompletion));
      vi.stubGlobal('fetch', fetchMock);
      const p = new OGRouterClient({ apiKey: 'k' }).chat({ model: 'm', messages: [] });
      await vi.advanceTimersByTimeAsync(2100); // past the 2s the header asked for
      const r = await p;
      expect(r.model).toBe('m');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('retryAfterMs', () => {
  const withHeader = (v: string | null) => ({ headers: { get: () => v } }) as unknown as Response;
  it('parses delta-seconds', () => {
    expect(retryAfterMs(withHeader('5'))).toBe(5000);
  });
  it('caps an absurd value so it cannot stall the scan', () => {
    expect(retryAfterMs(withHeader('99999'))).toBe(20_000);
  });
  it('returns null when absent or unparseable', () => {
    expect(retryAfterMs(withHeader(null))).toBeNull();
    expect(retryAfterMs(withHeader('soon'))).toBeNull();
    expect(retryAfterMs({ headers: undefined } as unknown as Response)).toBeNull();
  });
});
