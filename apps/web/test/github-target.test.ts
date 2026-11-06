import { describe, it, expect } from 'vitest';
import { parseGithubTarget, rankRepos, filterRepos } from '@/lib/github-target';

describe('parseGithubTarget', () => {
  it.each([
    ['octocat', { owner: 'octocat', repo: null }],
    ['  @octocat ', { owner: 'octocat', repo: null }],
    ['octocat/vault-core', { owner: 'octocat', repo: 'vault-core' }],
    ['github.com/octocat', { owner: 'octocat', repo: null }],
    ['https://github.com/octocat/', { owner: 'octocat', repo: null }],
    ['https://www.github.com/acme-defi/vault-core.git', { owner: 'acme-defi', repo: 'vault-core' }],
    ['https://github.com/acme-defi/vault-core/tree/main/src?x=1', { owner: 'acme-defi', repo: 'vault-core' }],
    ['git@github.com:acme-defi/vault.js.git', { owner: 'acme-defi', repo: 'vault.js' }],
    ['github.com/orgs/acme-defi', { owner: 'acme-defi', repo: null }],
  ])('%s', (input, expected) => {
    expect(parseGithubTarget(input)).toEqual(expected);
  });

  it.each(['', '   ', 'gitlab.com/octocat/repo', 'https://example.com/x', 'bad--name', '-octo', 'octo_cat', 'a'.repeat(40), 'octocat/..', '../etc/passwd'])(
    'rejects %j',
    (input) => {
      expect(parseGithubTarget(input)).toBeNull();
    },
  );
});

describe('rankRepos', () => {
  it('puts Solidity first, then stars, then recent pushes', () => {
    const r = (name: string, language: string | null, stars: number, pushedAt: string) => ({ name, language, stars, pushedAt });
    const out = rankRepos([
      r('site', 'TypeScript', 900, '2026-01-01'),
      r('old-vault', 'Solidity', 3, '2024-01-01'),
      r('new-vault', 'Solidity', 3, '2026-06-01'),
      r('core', 'Solidity', 40, '2025-01-01'),
    ]);
    expect(out.map((x) => x.name)).toEqual(['core', 'new-vault', 'old-vault', 'site']);
  });
});

describe('filterRepos', () => {
  const repos = [
    { name: 'vault-core', description: 'ERC-4626 vault' },
    { name: 'docs', description: null },
    { name: 'staking', description: 'Rewards vault for stakers' },
  ];
  it('matches every word against name and description', () => {
    expect(filterRepos(repos, 'vault').map((r) => r.name)).toEqual(['vault-core', 'staking']);
    expect(filterRepos(repos, 'VAULT rewards').map((r) => r.name)).toEqual(['staking']);
    expect(filterRepos(repos, '  ')).toHaveLength(3);
  });
});
