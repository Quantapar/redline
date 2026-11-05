import type { VerdictAttestation } from './attestation.js';

export interface GateDecision {
  allowed: boolean;
  reason: string;
}

/**
 * The deploy lock. A version may go live only when the approved-version record
 * is a council attestation FOR THAT EXACT version, issued by a council key, with
 * no unresolved reproduced findings. Anything else is blocked.
 */
export function canDeploy(input: {
  candidateVersionHash: string;
  attestation: VerdictAttestation | null;
  councilKeys: string[];
}): GateDecision {
  const { candidateVersionHash, attestation, councilKeys } = input;
  if (!attestation) return { allowed: false, reason: 'no approved-version record; this version was never checked' };
  if (!councilKeys.some((k) => k.toLowerCase() === attestation.issuer.toLowerCase())) {
    return { allowed: false, reason: 'approved-version record was not issued by the referee council' };
  }
  if (attestation.versionHash.toLowerCase() !== candidateVersionHash.toLowerCase()) {
    return { allowed: false, reason: 'the approved version does not match the version being deployed' };
  }
  if (!attestation.councilComplete) {
    return { allowed: false, reason: 'the council did not reach a verdict on every candidate' };
  }
  if (attestation.redFindingCount > 0) {
    return { allowed: false, reason: `${attestation.redFindingCount} reproduced finding(s) are unresolved` };
  }
  return { allowed: true, reason: 'version matches a complete, green council attestation' };
}

/** The Safe transaction guard reuses the same decision before a multisig deploy. */
export const safeGuardDecision = canDeploy;
