import Link from 'next/link';
import { listRepositories } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Icon } from '@/components/icon';
import { GitBranchIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { timeAgo, shortSha } from '@/lib/format';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';

export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  const repos = await listRepositories();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Every change to these repos is attacked on a throwaway fork before it can merge.</p>
      </div>
      {repos.length === 0 ? (
        <Empty className="rounded-xl border border-border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Icon icon={GitBranchIcon} size={22} /></EmptyMedia>
            <EmptyTitle>No repositories connected</EmptyTitle>
            <EmptyDescription>Install the Redline GitHub App and pick your repos. Redline finds your contracts and test setup by itself.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
      <div className="grid gap-3">
        {repos.map((r) => (
          <Card key={r.id} className="flex items-center gap-4 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/50">
              <Icon icon={GitBranchIcon} size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium">{r.fullName}</span>
                {r.redCount > 0 ? <StatusBadge hue="error" size="sm">{r.redCount} red</StatusBadge> : <StatusBadge hue="success" size="sm">Clean</StatusBadge>}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {r.latestScan ? <>last scan {timeAgo(r.latestScan.createdAt)} · {shortSha(r.latestScan.commitSha)}</> : 'no scans yet'}
              </div>
            </div>
            {r.latestScan ? (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/scans/${r.latestScan.id}`} />}>
                View scan <Icon icon={ArrowRight01Icon} size={14} />
              </Button>
            ) : null}
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
