import { NextResponse } from 'next/server';
import { gh, githubToken, installUrl, isRateLimited } from '@/lib/github-api';
import { parseGithubTarget, rankRepos, type GithubRepo } from '@/lib/github-target';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/github/repos?owner=<login>
 *
 * An account's repositories for the onboarding's repo picker: up to 300 of its
 * most recently pushed, ranked contracts-first (see rankRepos). Forks and
 * archived repos are left out: neither is something you'd ship from.
 */

type GhRepo = {
  id: number; name: string; full_name: string; description: string | null; private: boolean;
  fork: boolean; archived: boolean; language: string | null; stargazers_count: number; pushed_at: string | null;
  owner: { id: number };
};

const PER_PAGE = 100;
const MAX_PAGES = 3;

export async function GET(req: Request) {
  const rl = rateLimit(`gh-repos:${clientKey(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const target = parseGithubTarget(new URL(req.url).searchParams.get('owner') ?? '');
  if (!target) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const token = await githubToken();
  const owner = encodeURIComponent(target.owner);
  try {
    const all: GhRepo[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await gh<GhRepo[]>(`/users/${owner}/repos?type=owner&sort=pushed&per_page=${PER_PAGE}&page=${page}`, token);
      if (res.status === 404) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      if (isRateLimited(res.status)) return NextResponse.json({ error: 'github_rate_limited' }, { status: 503 });
      if (!res.data) return NextResponse.json({ error: 'github_error' }, { status: 502 });
      all.push(...res.data);
      if (res.data.length < PER_PAGE) break;
    }

    const repos: GithubRepo[] = rankRepos(
      all
        .filter((r) => !r.fork && !r.archived)
        .map((r) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          description: r.description,
          private: r.private,
          language: r.language,
          stars: r.stargazers_count,
          pushedAt: r.pushed_at,
        })),
    );
    const ownerId = all[0]?.owner.id ?? null;
    return NextResponse.json({
      repos,
      // Truncated at MAX_PAGES: the picker says so instead of pretending it's all
      partial: all.length >= PER_PAGE * MAX_PAGES,
      installUrl: ownerId != null ? installUrl(ownerId) : null,
    });
  } catch {
    return NextResponse.json({ error: 'github_unreachable' }, { status: 502 });
  }
}
