import { describe, it, expect } from 'vitest';
import { createRefereeEngine, SimulationRefereeEngine, FoundryRefereeEngine, detectFoundry } from '../src/index.js';

describe('createRefereeEngine — chooses real vs simulated referee', () => {
  it('always returns the deterministic simulation engine when preferSimulation is set', async () => {
    const e = await createRefereeEngine({ preferSimulation: true });
    expect(e).toBeInstanceOf(SimulationRefereeEngine);
  });

  it('returns the Foundry engine only when Foundry is available, else the simulation', async () => {
    const foundry = await detectFoundry();
    const e = await createRefereeEngine();
    // whichever engine, it must satisfy the referee interface
    expect(typeof e.run).toBe('function');
    if (foundry.available) {
      expect(e).toBeInstanceOf(FoundryRefereeEngine);
    } else {
      // no Foundry -> never silently pick the real engine that can't run
      expect(e).toBeInstanceOf(SimulationRefereeEngine);
    }
  });
});
