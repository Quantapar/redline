import type { RefereeEngine } from './referee.js';
import { SimulationRefereeEngine } from './referee.js';
import { FoundryRefereeEngine } from './foundry-referee.js';
import { detectFoundry } from './foundry.js';

/**
 * Choose the referee engine. The real Foundry engine is the only one whose votes
 * measure anything; the simulation reads a `@redline-sim` directive from the
 * hunter's own text and exists for offline dev, CI and demos. It is therefore
 * OPT-IN only (`preferSimulation`, or REDLINE_REFEREE=simulation): a worker
 * that finds no Foundry toolchain fails closed instead of quietly switching to
 * an engine whose "moved" is whatever the attack text asserts.
 */
export async function createRefereeEngine(opts: { preferSimulation?: boolean } = {}): Promise<RefereeEngine> {
  if (opts.preferSimulation || process.env.REDLINE_REFEREE === 'simulation') return new SimulationRefereeEngine();
  const foundry = await detectFoundry();
  if (!foundry.available) {
    throw new Error(
      'Foundry (forge + anvil) is not installed; refusing to fall back to the simulation referee. ' +
        'Install Foundry, or set REDLINE_REFEREE=simulation to opt in to the deterministic demo engine.',
    );
  }
  return new FoundryRefereeEngine();
}
