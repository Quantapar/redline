import { describe, it, expect } from 'vitest';
import { canDeploy, buildAttestation, councilMayWrite } from '../src/index.js';

const COUNCIL = ['0xCouncilA', '0xCouncilB'];
const green = buildAttestation({ versionHash: '0xabc', redFindingCount: 0, councilComplete: true, issuer: '0xCouncilA' });

describe('canDeploy — the deploy lock', () => {
  it('allows a version that matches a complete, green council attestation', () => {
    expect(canDeploy({ candidateVersionHash: '0xabc', attestation: green, councilKeys: COUNCIL }).allowed).toBe(true);
  });
  it('blocks when there is no approved-version record', () => {
    const d = canDeploy({ candidateVersionHash: '0xabc', attestation: null, councilKeys: COUNCIL });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/never checked/);
  });
  it('blocks a version that differs from the approved one', () => {
    expect(canDeploy({ candidateVersionHash: '0xDIFFERENT', attestation: green, councilKeys: COUNCIL }).allowed).toBe(false);
  });
  it('blocks when the attestation issuer is not a council key', () => {
    const forged = buildAttestation({ versionHash: '0xabc', redFindingCount: 0, councilComplete: true, issuer: '0xAttacker' });
    expect(canDeploy({ candidateVersionHash: '0xabc', attestation: forged, councilKeys: COUNCIL }).allowed).toBe(false);
  });
  it('blocks when reproduced findings are unresolved', () => {
    const red = buildAttestation({ versionHash: '0xabc', redFindingCount: 2, councilComplete: true, issuer: '0xCouncilA' });
    expect(canDeploy({ candidateVersionHash: '0xabc', attestation: red, councilKeys: COUNCIL }).allowed).toBe(false);
  });
  it('blocks when the council did not finish', () => {
    const partial = buildAttestation({ versionHash: '0xabc', redFindingCount: 0, councilComplete: false, issuer: '0xCouncilA' });
    expect(canDeploy({ candidateVersionHash: '0xabc', attestation: partial, councilKeys: COUNCIL }).allowed).toBe(false);
  });
  it('is case-insensitive on hashes and keys', () => {
    expect(canDeploy({ candidateVersionHash: '0xABC', attestation: green, councilKeys: ['0xcouncila'] }).allowed).toBe(true);
  });
});

describe('councilMayWrite — ENS deploy-lock write permission', () => {
  it('permits only council keys to set the approved-version record', () => {
    expect(councilMayWrite('0xCouncilA', COUNCIL)).toBe(true);
    expect(councilMayWrite('0xStranger', COUNCIL)).toBe(false);
  });
});
