import { describe, it, expect, afterAll } from 'vitest';
import { publisher, subscriber, publishEvent, channelFor } from '../lib/scan-events';

const conns: { quit: () => Promise<unknown> }[] = [];
afterAll(async () => { await Promise.all(conns.map((c) => c.quit().catch(() => {}))); });

describe('scan-events Redis pub/sub (the live scan-room backbone)', () => {
  it('derives a per-scan channel', () => {
    expect(channelFor('abc')).toBe('redline:scan:abc');
  });

  it('delivers a published event to a subscriber of that scan', async () => {
    const pub = publisher();
    const sub = subscriber();
    conns.push(pub, sub);
    const scanId = 'test-' + Math.random().toString(36).slice(2);

    const received = new Promise<Record<string, unknown>>((resolve) => {
      sub.on('message', (_ch, msg) => resolve(JSON.parse(msg)));
    });
    await sub.subscribe(channelFor(scanId));
    // small delay so the subscription is active before we publish
    await new Promise((r) => setTimeout(r, 50));
    publishEvent(pub, { type: 'finding', scanId, findingId: 'f1', isRed: true, consensus: 'reproduced', title: 'Reentrancy', at: new Date().toISOString() });

    const ev = await received;
    expect(ev.type).toBe('finding');
    expect(ev.findingId).toBe('f1');
    expect(ev.isRed).toBe(true);
  }, 10000);

  it('does not deliver events for a different scan', async () => {
    const pub = publisher();
    const sub = subscriber();
    conns.push(pub, sub);
    let got = false;
    sub.on('message', () => { got = true; });
    await sub.subscribe(channelFor('scan-A'));
    await new Promise((r) => setTimeout(r, 50));
    publishEvent(pub, { type: 'done', scanId: 'scan-B', redCount: 0, at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 200));
    expect(got).toBe(false);
  }, 10000);
});
