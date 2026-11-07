import { describe, it, expect } from 'vitest';
import {
  decideIntake, buildCheckOutput, buildVerdictComment, buildPendingComment, scanVerdict, inert, VERDICT_MARKER, type IntakeEvent,
} from '../src/scan-intake.js';
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

  it('scans a real contract whose path only resembles an ignored one', () => {
    // These must be SCANNED: a project's own libraries, and a contract file whose
    // NAME contains "test"/"mock" but which is not in a test/mock directory.
    const d = decideIntake({ ...base, changedFiles: [
      'src/libraries/SafeMath.sol',   // libraries/ is not the dependency dir lib/
      'src/TestableVault.sol',        // a filename, not a test/ directory
      'contracts/MockRegistryClient.sol',
    ] });
    expect(d.solidityFiles).toEqual([
      'src/libraries/SafeMath.sol', 'src/TestableVault.sol', 'contracts/MockRegistryClient.sol',
    ]);
  });

  it('ignores dependency and nested test/mock directories, case-insensitively', () => {
    const d = decideIntake({ ...base, changedFiles: [
      'lib/forge-std/src/Test.sol',   // vendored dependency
      'node_modules/@oz/Ownable.sol',
      'src/mocks/MockToken.sol',      // nested mock dir
      'src/Tests/Helper.sol',         // capital T, still a test dir
      'src/RealVault.sol',            // the only one to scan
    ] });
    expect(d.solidityFiles).toEqual(['src/RealVault.sol']);
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
  it('is NEUTRAL, never green, when the referees reached no verdict', () => {
    // The real failure seen end-to-end: every referee build-failed, consensus
    // inconclusive, 0/0. That proves nothing, so it must not read as a pass.
    const out = buildCheckOutput([unverified('f3')], 'https://app.test');
    expect(out.conclusion).toBe('neutral');
    expect(out.title).toMatch(/No verdict/);
    expect(out.summary).not.toMatch(/nothing paid out/);
  });
  it('still fails when one finding is red and another is unverified', () => {
    expect(buildCheckOutput([unverified('a'), finding(true, 'b')], 'https://app.test').conclusion).toBe('failure');
  });
});

function unverified(id: string, consensus: 'inconclusive' | 'fragile' = 'inconclusive'): Finding {
  return { ...finding(false, id), consensus, agreementCount: 0, refereeCount: 0, title: 'Reentrancy in DemoVault' };
}

describe('scanVerdict', () => {
  it('ranks red over unverified over clean', () => {
    expect(scanVerdict([finding(true, 'a'), unverified('b')])).toBe('red');
    expect(scanVerdict([finding(false, 'a'), unverified('b', 'fragile')])).toBe('unverified');
    expect(scanVerdict([finding(false, 'a')])).toBe('clean');
    expect(scanVerdict([])).toBe('clean');
  });
});

describe('PR verdict comment', () => {
  const ctx = { appUrl: 'https://app.test', scanId: 'scan-1', commitSha: '70684f852caecd31', candidateCount: 2 };

  it('every comment carries the hidden marker and links the scan and short commit', () => {
    for (const body of [
      buildPendingComment(ctx),
      buildVerdictComment([finding(true, 'f1')], ctx),
      buildVerdictComment([unverified('f1')], ctx),
      buildVerdictComment([finding(false, 'f1')], ctx),
      buildVerdictComment([], ctx, 'failed'),
    ]) {
      expect(body.startsWith(VERDICT_MARKER)).toBe(true);
      expect(body).toContain('https://app.test/scans/scan-1');
      expect(body).toContain('`70684f8`');
    }
  });
  it('red: blocks, tables each theft with referee agreement and a proof link', () => {
    const body = buildVerdictComment([{ ...finding(true, 'f1'), severity: 'critical' }, finding(false, 'f2')], ctx);
    expect(body).toMatch(/🔴 1 reproduced theft: merge blocked/);
    expect(body).toContain('| **Reentrancy in Vault** | critical | 3/3 agreed | [View proof](https://app.test/findings/f1) |');
    expect(body).not.toContain('findings/f2'); // a non-red finding is not listed as a theft
  });
  it('unverified: says plainly it is not a pass, and never claims nothing paid out', () => {
    const body = buildVerdictComment([unverified('f1')], ctx);
    expect(body).toMatch(/No verdict/);
    expect(body).toMatch(/This is not a pass/);
    expect(body).toMatch(/1 suspected weakness could not be replayed by the referees/);
    expect(body).not.toMatch(/nothing paid out/);
    expect(body).toContain('| Reentrancy in DemoVault | could not replay | [Open](https://app.test/findings/f1) |');
  });
  it('clean: says nothing paid out, with the honest "at this time" scope', () => {
    const body = buildVerdictComment([finding(false, 'f1'), finding(false, 'f2')], ctx);
    expect(body).toMatch(/🟢 No theft could be reproduced/);
    expect(body).toMatch(/2 candidate attacks were tried/);
    expect(body).toMatch(/not a guarantee/);
  });
  it('failed scan: explains it proved nothing and does not block', () => {
    expect(buildVerdictComment([finding(true, 'f1')], ctx, 'failed')).toMatch(/could not finish this scan[\s\S]*does not block/);
  });
  it('escapes pipes and newlines in attacker-influenced titles so the table cannot break', () => {
    const body = buildVerdictComment([{ ...finding(true, 'f1'), title: 'a | b\nc' }], ctx);
    expect(body).toContain('**a \\| b c**');
  });
  it('a fragile split is described as a split, not as "could not replay"', () => {
    const body = buildVerdictComment([{ ...unverified('f1', 'fragile'), agreementCount: 3, refereeCount: 4 }], ctx);
    expect(body).toMatch(/split the referees: some saw money move, some did not/);
    expect(body).toContain('3/4 saw money move');
    expect(body).not.toMatch(/could not be replayed/);
  });
});

describe('no false pass from an incomplete scan', () => {
  const ctx = { appUrl: 'https://app.test', scanId: 's', commitSha: 'abcdef0123' };
  it('a candidate whose verification errored (no finding row) makes the scan unverified', () => {
    const facts = { status: 'complete', candidateCount: 3 };
    expect(scanVerdict([finding(false, 'a')], facts)).toBe('unverified');
    const check = buildCheckOutput([finding(false, 'a')], 'https://app.test', facts);
    expect(check.conclusion).toBe('neutral');
    expect(check.summary).toMatch(/2 candidate attacks never reached the referees/);
    expect(buildVerdictComment([finding(false, 'a')], { ...ctx, ...facts })).not.toMatch(/nothing paid out/);
  });
  it('a cancelled scan is unverified and says it was cancelled', () => {
    const facts = { status: 'cancelled', candidateCount: 1 };
    expect(buildCheckOutput([finding(false, 'a')], 'https://app.test', facts).conclusion).toBe('neutral');
    expect(buildVerdictComment([finding(false, 'a')], { ...ctx, ...facts })).toMatch(/the scan was cancelled before it finished/);
  });
  it('a red proof still blocks even if the scan was cut short', () => {
    expect(buildCheckOutput([finding(true, 'a')], 'https://app.test', { status: 'cancelled', candidateCount: 5 }).conclusion).toBe('failure');
  });
  it('clean needs a complete scan where every candidate was judged not-reproduced', () => {
    const facts = { status: 'complete', candidateCount: 2 };
    const check = buildCheckOutput([finding(false, 'a'), finding(false, 'b')], 'https://app.test', facts);
    expect(check.conclusion).toBe('success');
    expect(check.summary).toMatch(/2 candidate attacks were tried/);
  });
  it('zero candidates reads as "no plausible attack", not "the referees agreed"', () => {
    const body = buildVerdictComment([], { ...ctx, status: 'complete', candidateCount: 0 });
    expect(body).toMatch(/found no plausible attack/);
    expect(body).not.toMatch(/referees agreed/);
  });
});

describe('inert() — model / PR-author text cannot inject into the comment', () => {
  it('cannot close <details> or forge a heading', () => {
    const t = inert('x</details>\n\n## 🟢 No theft could be reproduced');
    expect(t).not.toContain('</details>');
    expect(t).not.toContain('\n');
    expect(t).toContain('\\<');
  });
  it('defuses @mentions, #refs and links', () => {
    const t = inert('ping @octocat see #123 at https://evil.example and www.evil.example [click](https://x)');
    expect(t).not.toMatch(/@octocat/);
    expect(t).not.toMatch(/#123/);
    expect(t).not.toMatch(/https:\/\//);
    expect(t).not.toMatch(/www\.evil/);
    expect(t).not.toMatch(/\[click\]\(/);
  });
  it('a backslash before a pipe cannot split a table cell', () => {
    expect(inert('a\\|b')).toBe('a\\\\\\|b');
  });
  it('caps length so a giant model answer cannot push the comment past GitHub limits', () => {
    expect(inert('A'.repeat(10_000)).length).toBeLessThanOrEqual(300);
    const many = Array.from({ length: 200 }, (_, i) => ({ ...finding(true, `f${i}`), plainSentence: 'B'.repeat(5000) }));
    const body = buildVerdictComment(many, { appUrl: 'https://a', scanId: 's', commitSha: 'abcdef0' });
    expect(body.length).toBeLessThan(65_536);
    expect(body).toMatch(/…and 180 more/);
  });
});

describe('replayed attacks that moved no money', () => {
  const regression = { ...finding(false, 'r1'), title: 'Regression: reentrancy in CommunityVault' };
  it('names the saved forever-test in an open verdict, first', () => {
    const body = buildVerdictComment([unverified('u1'), finding(false, 'k1'), regression], { appUrl: 'https://app.test', scanId: 's', commitSha: 'abcdef1234' });
    expect(body).toMatch(/No verdict/);
    expect(body).toContain('**Replayed, no money moved:**');
    const saved = body.indexOf('Saved attack from a past finding: reentrancy in CommunityVault (forever-test) | 0/3 saw money move');
    expect(saved).toBeGreaterThan(-1);
    expect(saved).toBeLessThan(body.indexOf('| Reentrancy in Vault | 0/3 saw money move'));
  });
  it('says so in the check summary', () => {
    const out = buildCheckOutput([unverified('u1'), finding(false, 'k1'), regression], 'https://app.test');
    expect(out.conclusion).toBe('neutral');
    expect(out.summary).toContain('Replayed with no money moved: 1 saved attack from a past finding (forever-test) and 1 new attack.');
  });
  it('adds nothing when no attack was replayed', () => {
    expect(buildCheckOutput([unverified('u1')], 'https://app.test').summary).not.toContain('Replayed with no money moved');
  });
});
