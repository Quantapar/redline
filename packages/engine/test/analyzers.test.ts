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

import { parseSlitherJson } from '../src/analyzers/slither.js';

describe('parseSlitherJson', () => {
  const sample = JSON.stringify({
    results: {
      detectors: [
        {
          check: 'reentrancy-eth',
          confidence: 'High',
          description: 'Reentrancy in EtherVault.withdraw()',
          elements: [
            { type: 'function', name: 'withdraw', type_specific_fields: { parent: { name: 'EtherVault' } }, source_mapping: { lines: [12], filename_relative: 'src/EtherVault.sol' } },
          ],
        },
        { check: 'some-unknown-check', confidence: 'Medium', description: 'x', elements: [] },
      ],
    },
  });

  it('maps known checks to weakness classes with location', () => {
    const hits = parseSlitherJson(sample);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.weaknessClass).toBe('reentrancy');
    expect(hits[0]!.contract).toBe('EtherVault');
    expect(hits[0]!.functionName).toBe('withdraw');
    expect(hits[0]!.line).toBe(12);
    expect(hits[0]!.confidence).toBe('high');
  });
  it('falls back to "other" for unknown checks', () => {
    expect(parseSlitherJson(sample)[1]!.weaknessClass).toBe('other');
  });
  it('returns empty on non-JSON', () => {
    expect(parseSlitherJson('not json')).toEqual([]);
  });
  it('returns empty when there are no detectors', () => {
    expect(parseSlitherJson(JSON.stringify({ results: {} }))).toEqual([]);
  });
});
