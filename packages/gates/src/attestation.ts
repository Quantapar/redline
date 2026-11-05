/**
 * A council attestation is the signed fact that a specific version was checked
 * and what the verdict was. The deploy lock and the Safe guard both read it.
 * The approved-version record on ENS holds the latest green attestation.
 */
export interface VerdictAttestation {
  /** hash of the exact version checked (commit or artifact hash) */
  versionHash: string;
  /** reproduced (red) findings at this version; 0 means it is green */
  redFindingCount: number;
  /** the council reached quorum on every verdict (no inconclusive gaps) */
  councilComplete: boolean;
  issuedAt: string;
  /** address/key that issued it; must be a council key to be trusted */
  issuer: string;
}

export function buildAttestation(input: {
  versionHash: string;
  redFindingCount: number;
  councilComplete: boolean;
  issuer: string;
}): VerdictAttestation {
  return { ...input, issuedAt: new Date().toISOString() };
}

/** Only the referee council's keys may set the approved-version record (ENS EAC). */
export function councilMayWrite(writer: string, councilKeys: string[]): boolean {
  return councilKeys.some((k) => k.toLowerCase() === writer.toLowerCase());
}
