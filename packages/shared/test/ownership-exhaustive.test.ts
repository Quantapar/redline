import { describe, it, expect } from 'vitest';
import { decideUnlock, type OwnershipClaim } from '../src/policy/ownership.js';

// The gate has four independent conditions. Enumerate EVERY combination and prove
// the runnable exploit unlocks in exactly one: all four satisfied. Any other
// combination must stay locked — a full proof the gate has no bypass.
describe('decideUnlock — exhaustive proof only the fully-valid claim unlocks', () => {
  it('unlocks for exactly one of all input combinations', () => {
    let unlocks = 0;
    for (const signatureValid of [true, false]) {
      for (const challengeFresh of [true, false]) {
        for (const ownerReadable of [true, false]) {
          for (const signerMatches of [true, false]) {
            const owner = ownerReadable ? '0xOwner' : null;
            const claim: OwnershipClaim = {
              contractAddress: '0xC', chainId: 1,
              onchainOwner: owner,
              signerAddress: signerMatches ? '0xOWNER' : '0xAttacker', // case-insensitive match when true
              signatureValid, challengeFresh,
            };
            const allValid = signatureValid && challengeFresh && ownerReadable && signerMatches;
            const decision = decideUnlock(claim);
            expect(decision.unlocked).toBe(allValid);
            if (decision.unlocked) unlocks++;
            if (!decision.unlocked) expect(decision.reason.length).toBeGreaterThan(0); // always says why
          }
        }
      }
    }
    expect(unlocks).toBe(1); // exactly one combination of 16 unlocks
  });
});
