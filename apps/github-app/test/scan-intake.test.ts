import { describe, it, expect } from 'vitest';
import { decideIntake, buildCheckOutput, type IntakeEvent } from '../src/scan-intake.js';
import type { Finding } from '@redline/shared';

const base: IntakeEvent = {
  action: 'pull_request', defaultBranch: 'main', ref: 'feature/x',
  headSha: 'head', baseSha: 'base', prNumber: 7,
  changedFiles: ['src/Vault.sol', 'README.md'],
};

describe('decideIntake', () => {
  it('scans incrementally when Solidity contracts change in a PR', () => {
    const d = decideIntake(base);
    expect(d.shouldScan).toBe(true);
    expect(d.trigger).toBe('pull-request');
    expect(d.isIncremental).toBe(true);
    expect(d.solidityFiles).toEqual(['src/Vault.sol']);
  });
  it('treats a null base as the first full scan', () => {
    const d = decideIntake({ ...base, action: 'push', prNumber: null, ref: 'refs/heads/main', baseSha: null });
    expect(d.trigger).toBe('first-scan');
    expect(d.isIncremental).toBe(false);
    expect(d.shouldScan).toBe(true);
  });
  it('skips when no contracts changed', () => {
    const d = decideIntake({ ...base, changedFiles: ['README.md', 'package.json'] });
    expect(d.shouldScan).toBe(false);
  });
  it('ignores test/mock/script solidity files', () => {
    const d = decideIntake({ ...base, changedFiles: ['test/Vault.t.sol', 'script/Deploy.s.sol', 'src/Vault.sol'] });
    expect(d.solidityFiles).toEqual(['src/Vault.sol']);
  });
  it('ignores pushes to non-default branches without a PR', () => {
    const d = decideIntake({ ...base, action: 'push', prNumber: null, ref: 'refs/heads/wip' });
    expect(d.shouldScan).toBe(false);
  });
});

function finding(isRed: boolean, id: string): Finding {
  return {
    id, scanId: 's', candidateId: 'c', weaknessClass: 'reentrancy', title: 'Reentrancy in Vault',
    plainSentence: 'x', consensus: isRed ? 'reproduced' : 'not-reproduced', isRed,
    refereeRunIds: [], agreementCount: isRed ? 3 : 0, refereeCount: 3,
    regressionTestRef: null, replayRef: null, judgment: null, createdAt: new Date().toISOString(),
  };
}

describe('buildCheckOutput', () => {
  it('fails the check and links proof when a theft reproduced', () => {
    const out = buildCheckOutput([finding(true, 'f1'), finding(false, 'f2')], 'https://app.test');
    expect(out.conclusion).toBe('failure');
    expect(out.summary).toContain('https://app.test/findings/f1');
    expect(out.title).toMatch(/reproduced theft/);
  });
  it('passes the check when nothing reproduced', () => {
    const out = buildCheckOutput([finding(false, 'f2')], 'https://app.test');
    expect(out.conclusion).toBe('success');
  });
});
