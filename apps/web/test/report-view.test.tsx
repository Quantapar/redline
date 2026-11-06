import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ReportView, type Report } from '../components/flow/onboarding/report-view';

afterEach(() => cleanup());

const report: Report = {
  repo: 'acme/vault',
  scan: { id: 's1', status: 'complete', commitSha: 'abc1234', contracts: 2 },
  score: 55,
  label: 'Needs work',
  attacks: 3,
  areas: [
    { weaknessClass: 'reentrancy', verdict: 'red', findings: 1 },
    { weaknessClass: 'access-control', verdict: 'ok', findings: 0 },
  ],
  fixes: [
    {
      id: 'f1', weaknessClass: 'reentrancy', title: 'Reentrancy drains the vault',
      plainSentence: 'withdraw() pays out before it zeroes the balance.', severity: 'critical',
      isRed: true, consensus: 'reproduced', agreementCount: 5, refereeCount: 5,
      targetContract: 'Vault', targetFunction: 'withdraw', movedWei: '8500000000000000000',
      exploitTest: 'function testExploit() public {}', fix: null,
    },
  ],
};

describe('ReportView', () => {
  it('shows the real score, every attacked area, and each fix', () => {
    render(<ReportView report={report} repoName="vault" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reentrancy drains the vault');
    expect(screen.getByText('Needs work')).toBeDefined();
    expect(screen.getByText(/Redline score: 55 out of 100/)).toBeDefined();
    expect(screen.getByText('Reentrancy')).toBeDefined();
    expect(screen.getByText('Access control')).toBeDefined();
    expect(screen.getByText('RED')).toBeDefined();
    expect(screen.getByText('OK')).toBeDefined();
    expect(screen.getByText('Vault.withdraw()')).toBeDefined();
  });

  it('copies a brief for a coding agent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ReportView report={report} repoName="vault" />);
    fireEvent.click(screen.getByRole('button', { name: /Copy fix for agent/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0]![0]).toContain('Fix this security issue in acme/vault, in Vault.withdraw().');
  });

  it('says so when nothing moved', () => {
    render(<ReportView report={{ ...report, score: 100, label: 'Holding up', fixes: [], areas: [{ weaknessClass: 'reentrancy', verdict: 'ok', findings: 0 }] }} repoName="vault" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No exploit moved money in vault.');
    expect(screen.queryByText('Fix these first')).toBeNull();
  });
});
