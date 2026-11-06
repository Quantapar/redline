import { describe, it, expect } from 'vitest';
import { createRefereeEngine, SimulationRefereeEngine, FoundryRefereeEngine, detectFoundry } from '../src/index.js';

describe('createRefereeEngine — real referee or nothing', () => {
  it('returns the deterministic simulation only when explicitly asked', async () => {
    const e = await createRefereeEngine({ preferSimulation: true });
    expect(e).toBeInstanceOf(SimulationRefereeEngine);
  });

  it('honors REDLINE_REFEREE=simulation as the opt-in switch', async () => {
    process.env.REDLINE_REFEREE = 'simulation';
    try {
      expect(await createRefereeEngine()).toBeInstanceOf(SimulationRefereeEngine);
    } finally {
      delete process.env.REDLINE_REFEREE;
    }
  });

  it('returns the Foundry engine when Foundry is available, and FAILS CLOSED when it is not', async () => {
    const foundry = await detectFoundry();
    if (foundry.available) {
      expect(await createRefereeEngine()).toBeInstanceOf(FoundryRefereeEngine);
    } else {
      // never silently pick an engine whose votes come from the attack text
      await expect(createRefereeEngine()).rejects.toThrow(/Foundry/);
    }
  });
});
