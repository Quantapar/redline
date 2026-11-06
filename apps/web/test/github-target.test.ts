import { describe, it, expect } from 'vitest';
import { parseGithubTarget } from '@/lib/github-target';

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
