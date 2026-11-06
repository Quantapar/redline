import { describe, it, expect } from 'vitest';
import { decideUnlock, type OwnershipClaim } from '../src/policy/ownership.js';

const base: OwnershipClaim = {
  contractAddress: '0xContract',
  chainId: 1,
  signerAddress: '0xOwner',
  onchainOwner: '0xOwner',
  challengeFresh: true,
  signatureValid: true,
};

describe('decideUnlock — runnable attack is gated on proven ownership', () => {
  it('unlocks only when the owner proves control with a fresh valid signature', () => {
    expect(decideUnlock(base).unlocked).toBe(true);
  });
  it('locks when signature is invalid', () => {
    expect(decideUnlock({ ...base, signatureValid: false }).unlocked).toBe(false);
  });
  it('locks when the challenge is stale/replayed', () => {
    expect(decideUnlock({ ...base, challengeFresh: false }).unlocked).toBe(false);
  });
  it('locks when signer is not the on-chain owner', () => {
    expect(decideUnlock({ ...base, signerAddress: '0xAttacker' }).unlocked).toBe(false);
  });
  it('locks when on-chain owner cannot be read', () => {
    expect(decideUnlock({ ...base, onchainOwner: null }).unlocked).toBe(false);
  });
  it('is case-insensitive on address comparison', () => {
    expect(decideUnlock({ ...base, signerAddress: '0xOWNER' }).unlocked).toBe(true);
  });
  it('locks when the on-chain owner reads as an empty string, not only null', () => {
    // A failed read that returns '' (falsy but not null) must not slip through.
    expect(decideUnlock({ ...base, onchainOwner: '' }).unlocked).toBe(false);
  });
  it('an empty signer never matches a real owner', () => {
    expect(decideUnlock({ ...base, signerAddress: '' }).unlocked).toBe(false);
  });
});
