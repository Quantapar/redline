/**
 * Turns whatever someone pastes into the onboarding field into a GitHub owner and,
 * when present, a repository: `octocat`, `@octocat`, `octocat/vault`,
 * `github.com/octocat`, `https://github.com/octocat/vault/tree/main/src`,
 * `git@github.com:octocat/vault.git`. Returns null for anything that can't be a
 * GitHub account, so the server never builds an API path from raw input.
 */
export interface GithubTarget {
  owner: string;
  repo: string | null;
}

// GitHub logins: 1–39 chars, alphanumerics and single hyphens, not at the edges.
const OWNER = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
// Repository names: letters, digits, '.', '-', '_' (but never just '.' or '..').
const REPO = /^[\w.-]{1,100}$/;

export function parseGithubTarget(input: string): GithubTarget | null {
  let s = input.trim();
  if (!s) return null;

  s = s.replace(/^git@github\.com:/i, '');
  s = s.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com(?:\/|$)/i, '');
  // Something else that looks like a URL (gitlab.com/…, a contract site) isn't ours.
  if (/^[a-z][\w+.-]*:\/\//i.test(s) || /^[\w-]+\.[a-z]{2,}(?:\/|$)/i.test(s)) return null;
  s = s.replace(/^@/, '').replace(/[?#].*$/, '');

  const parts = s.split('/').filter(Boolean);
  // github.com/orgs/acme/… is the org's own page
  if (parts[0]?.toLowerCase() === 'orgs') parts.shift();

  const owner = parts[0];
  if (!owner || !OWNER.test(owner)) return null;

  const rawRepo = parts[1]?.replace(/\.git$/i, '');
  if (!rawRepo) return { owner, repo: null };
  if (!REPO.test(rawRepo) || rawRepo === '.' || rawRepo === '..') return null;
  return { owner, repo: rawRepo };
}

/** What /api/github/lookup resolves a username or URL to. */
export interface GithubAccount {
  owner: { id: number; login: string; name: string | null; type: 'user' | 'organization'; avatarUrl: string; publicRepos: number };
  repo: { id: number; fullName: string; description: string | null; private: boolean; language: string | null } | null;
  installUrl: string | null;
}

/** One row of /api/github/repos. */
export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  language: string | null;
  stars: number;
  pushedAt: string | null;
}

/**
 * The picker's order: Solidity repos first (that's what Redline attacks), then
 * the most starred, then the most recently pushed.
 */
export function rankRepos<T extends Pick<GithubRepo, 'language' | 'stars' | 'pushedAt'>>(repos: T[]): T[] {
  const contracts = (r: T) => (r.language === 'Solidity' ? 1 : 0);
  const pushed = (r: T) => (r.pushedAt ? Date.parse(r.pushedAt) : 0);
  return [...repos].sort((a, b) => contracts(b) - contracts(a) || b.stars - a.stars || pushed(b) - pushed(a));
}

/** Repos whose name or description contains every word of the query. */
export function filterRepos<T extends Pick<GithubRepo, 'name' | 'description'>>(repos: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return repos;
  return repos.filter((r) => {
    const hay = `${r.name} ${r.description ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
