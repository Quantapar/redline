import { describe, it, expect } from 'vitest';
import { tallyCouncil, DEFAULT_COUNCIL } from '../src/consensus/council.js';
import { runs, makeRun } from './helpers.js';

describe('tallyCouncil — core verdict rules', () => {
  it('reproduces only when quorum of referees independently agree money moved', () => {
    const r = tallyCouncil(runs(['moved', 'moved', 'moved']));
    expect(r.consensus).toBe('reproduced');
    expect(r.isRed).toBe(true);
    expect(r.agreementCount).toBe(3);
  });

  it('is NOT red when any referee dissents (strict, not universal)', () => {
    const r = tallyCouncil(runs(['moved', 'moved', 'moved', 'did-not-move']));
    expect(r.consensus).toBe('fragile');
    expect(r.isRed).toBe(false);
  });

  it('tolerates dissent only when allowDissent is set and quorum still met', () => {
    const r = tallyCouncil(runs(['moved', 'moved', 'moved', 'did-not-move']), {
      ...DEFAULT_COUNCIL,
      allowDissent: true,
    });
    expect(r.consensus).toBe('reproduced');
    expect(r.isRed).toBe(true);
  });

  it('is fragile when some moved but quorum not reached', () => {
    const r = tallyCouncil(runs(['moved', 'did-not-move', 'did-not-move']));
    expect(r.consensus).toBe('fragile');
    expect(r.isRed).toBe(false);
  });

  it('is not-reproduced when no referee moves the money', () => {
    const r = tallyCouncil(runs(['did-not-move', 'did-not-move', 'did-not-move']));
    expect(r.consensus).toBe('not-reproduced');
    expect(r.isRed).toBe(false);
  });

  it('is inconclusive below minimum valid runs', () => {
    const r = tallyCouncil(runs(['moved', 'moved']));
    expect(r.consensus).toBe('inconclusive');
    expect(r.isRed).toBe(false);
  });

  it('treats errors/build-failures as invalid runs', () => {
    const r = tallyCouncil(runs(['moved', 'moved', 'error', 'build-failed']));
    expect(r.validCount).toBe(2);
    expect(r.errorCount).toBe(2);
    expect(r.consensus).toBe('inconclusive');
  });

  it('is inconclusive when providers are not distinct (collusion guard)', () => {
    const r = tallyCouncil([
      makeRun('moved', { provider: 'same' }),
      makeRun('moved', { provider: 'same' }),
      makeRun('moved', { provider: 'same' }),
    ]);
    expect(r.providersDistinct).toBe(false);
    expect(r.consensus).toBe('inconclusive');
    expect(r.isRed).toBe(false);
  });

  it('NEVER raises red on anything but reproduced consensus (exhaustive)', () => {
    const outcomes = ['moved', 'did-not-move', 'error', 'build-failed'] as const;
    let redCount = 0;
    // enumerate all 4^4 = 256 combinations of 4 referees
    for (const a of outcomes)
      for (const b of outcomes)
        for (const c of outcomes)
          for (const d of outcomes) {
            const res = tallyCouncil([
              makeRun(a, { provider: 'p1' }),
              makeRun(b, { provider: 'p2' }),
              makeRun(c, { provider: 'p3' }),
              makeRun(d, { provider: 'p4' }),
            ]);
            if (res.isRed) {
              redCount += 1;
              expect(res.consensus).toBe('reproduced');
              // red requires >=3 moved AND zero dissent (strict default)
              expect(res.agreementCount).toBeGreaterThanOrEqual(3);
              expect(res.dissentCount).toBe(0);
            }
          }
    expect(redCount).toBeGreaterThan(0);
  });
});
