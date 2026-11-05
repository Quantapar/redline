/**
 * Misuse control (Part 8): everyone can see a finding, but the runnable attack
 * is locked unless the requester proves they own/control the live contract.
 * Proof is a signature over a fresh challenge by the contract's owner/admin key,
 * or an on-chain ownership check. This module decides whether to unlock.
 */
export interface OwnershipClaim {
  contractAddress: string;
  chainId: number;
  /** address recovered from the signed challenge */
  signerAddress: string;
  /** the contract's current owner/admin, as read on-chain */
  onchainOwner: string | null;
  challengeFresh: boolean;
  signatureValid: boolean;
}

export interface UnlockDecision {
  unlocked: boolean;
  reason: string;
}

export function decideUnlock(claim: OwnershipClaim): UnlockDecision {
  if (!claim.signatureValid) return { unlocked: false, reason: 'signature invalid' };
  if (!claim.challengeFresh) return { unlocked: false, reason: 'challenge expired or reused' };
  if (!claim.onchainOwner) return { unlocked: false, reason: 'could not read on-chain owner' };
  if (claim.signerAddress.toLowerCase() !== claim.onchainOwner.toLowerCase()) {
    return { unlocked: false, reason: 'signer is not the contract owner/admin' };
  }
  return { unlocked: true, reason: 'ownership proven' };
}
