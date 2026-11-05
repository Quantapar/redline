import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runSlither } from '../src/analyzers/slither.js';
import { runAderyn } from '../src/analyzers/aderyn.js';
import { detectFoundry } from '../src/foundry.js';

// These tools are optional; the engine must degrade gracefully when they are absent.
describe('optional toolchain degrades gracefully', () => {
  it('runSlither never throws and reports availability', async () => {
    const r = await runSlither(tmpdir());
    expect(r.tool).toBe('slither');
    expect(typeof r.available).toBe('boolean');
    expect(Array.isArray(r.hits)).toBe(true);
    if (!r.available) expect(r.hits).toEqual([]);
  });

  it('runAderyn never throws and reports availability', async () => {
    const r = await runAderyn(tmpdir());
    expect(r.tool).toBe('aderyn');
    expect(typeof r.available).toBe('boolean');
    expect(Array.isArray(r.hits)).toBe(true);
  });

  it('detectFoundry reports availability without throwing', async () => {
    const f = await detectFoundry();
    expect(typeof f.available).toBe('boolean');
    // when unavailable, versions are null
    if (!f.available) {
      expect(f.forgeVersion === null || f.anvilVersion === null).toBe(true);
    }
  });
});
