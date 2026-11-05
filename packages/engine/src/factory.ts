import type { RefereeEngine } from './referee.js';
import { SimulationRefereeEngine } from './referee.js';
import { FoundryRefereeEngine } from './foundry-referee.js';
import { detectFoundry } from './foundry.js';

/**
 * Choose the referee engine: real Foundry when available and a fork is in play,
 * otherwise the deterministic simulation (offline dev, CI, and demos).
 */
export async function createRefereeEngine(opts: { preferSimulation?: boolean } = {}): Promise<RefereeEngine> {
  if (opts.preferSimulation) return new SimulationRefereeEngine();
  const foundry = await detectFoundry();
  return foundry.available ? new FoundryRefereeEngine() : new SimulationRefereeEngine();
}
