import { NextResponse } from 'next/server';
import { gh, githubToken, installUrl, isRateLimited } from '@/lib/github-api';
import { parseGithubTarget, type GithubAccount } from '@/lib/github-target';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/github/lookup?q=<username | owner/repo | GitHub URL>
 *
 * Resolves what someone typed on the onboarding screen to a real GitHub account
 * (and repository). Public, since the onboarding runs signed out, so it is rate
 * limited and only calls GitHub's read-only endpoints with a validated owner/repo.
 */

type GhUser = { id: number; login: string; type: string; name: string | null; avatar_url: string; public_repos: number };
type GhRepo = { id: number; full_name: string; description: string | null; private: boolean; language: string | null };

export async function GET(req: Request) {
  const rl = rateLimit(`gh-lookup:${clientKey(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  const target = parseGithubTarget(q.slice(0, 300));
  if (!target) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const token = await githubToken();
  try {
    const owner = await gh<GhUser>(`/users/${encodeURIComponent(target.owner)}`, token);
    if (owner.status === 404) return NextResponse.json({ error: 'not_found', what: 'owner' }, { status: 404 });
    if (isRateLimited(owner.status)) return NextResponse.json({ error: 'github_rate_limited' }, { status: 503 });
    if (!owner.data) return NextResponse.json({ error: 'github_error' }, { status: 502 });

    let repo: GhRepo | null = null;
    if (target.repo) {
      const r = await gh<GhRepo>(`/repos/${encodeURIComponent(owner.data.login)}/${encodeURIComponent(target.repo)}`, token);
      // A private repo the caller can't see also comes back 404.
      if (r.status === 404) return NextResponse.json({ error: 'not_found', what: 'repo' }, { status: 404 });
      if (isRateLimited(r.status)) return NextResponse.json({ error: 'github_rate_limited' }, { status: 503 });
      if (!r.data) return NextResponse.json({ error: 'github_error' }, { status: 502 });
      repo = r.data;
    }

    const o = owner.data;
    const body: GithubAccount = {
      owner: {
        id: o.id,
        login: o.login,
        name: o.name,
        type: o.type === 'Organization' ? 'organization' : 'user',
        avatarUrl: o.avatar_url,
        publicRepos: o.public_repos,
      },
      repo: repo && {
        id: repo.id,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
      },
      installUrl: installUrl(o.id, repo?.id ?? null),
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: 'github_unreachable' }, { status: 502 });
  }
}
