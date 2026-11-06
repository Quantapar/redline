import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getScanDetail } from '@/lib/queries';
import { LiveScanFeed } from '@/components/live-scan-feed';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icon';
import { GitBranchIcon, Bug01Icon, ArrowRight01Icon, AiBrain01Icon } from '@hugeicons/core-free-icons';
import { WEAKNESS_LABEL, SEVERITY_HUE, CONSENSUS_LABEL, shortSha, SCAN_STATUS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getScanDetail(id);
  if (!data) notFound();
  const { scan, repo, candidates, findings } = data;
  const isDone = scan.status === 'complete' || scan.status === 'failed';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link href="/repositories" className="hover:text-foreground">Repositories</Link>
        <Icon icon={ArrowRight01Icon} size={13} />
        <span className="text-foreground">{repo?.fullName ?? 'Scan'}</span>
      </nav>

      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/50">
          <Icon icon={GitBranchIcon} size={19} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{repo?.fullName}</h1>
            <StatusBadge hue={isDone ? (scan.redFindingCount > 0 ? 'error' : 'success') : 'info'} size="sm">
              {isDone ? (scan.redFindingCount > 0 ? `${scan.redFindingCount} red` : 'Clean') : SCAN_STATUS_LABEL[scan.status]}
            </StatusBadge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span className="font-mono">{shortSha(scan.commitSha)}</span>
            <span>·</span>
            <span>{scan.isIncremental ? 'incremental' : 'full'} scan</span>
            <span>·</span>
            <span>budget {(scan.budgetCapCents / 100).toFixed(2)} USD</span>
          </div>
        </div>
      </div>

      <LiveScanFeed scanId={scan.id} initialStatus={scan.status} />

      {candidates.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[13px] font-semibold">Candidates ({candidates.length})</div>
          {candidates.map((c) => (
            <Card key={c.id} className="flex items-center gap-3 p-3">
              <Icon icon={AiBrain01Icon} size={16} className="text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13px]">{c.summary}</div>
                <div className="text-[11px] text-muted-foreground">{c.hunterModel} · {WEAKNESS_LABEL[c.weaknessClass] ?? c.weaknessClass}</div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div className="space-y-2">
          <div className="text-[13px] font-semibold">Findings</div>
          {findings.map((f) => {
            const c = CONSENSUS_LABEL[f.consensus] ?? { label: f.consensus, hue: 'neutral' as const };
            return (
              <Link key={f.id} href={`/findings/${f.id}`} className={`group flex items-center gap-3 rounded-lg border bg-card p-3 outline-none transition-[transform,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-ring/50 motion-safe:active:scale-[0.99] ${f.isRed ? 'border-border hover:border-destructive/40' : 'border-border'}`}>
                <span className={`flex size-7 items-center justify-center rounded-md ${f.isRed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  <Icon icon={Bug01Icon} size={14} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[13px] font-medium">{f.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{f.plainSentence}</div>
                </div>
                {f.severity ? <StatusBadge hue={SEVERITY_HUE[f.severity] ?? 'neutral'} size="sm">{f.severity}</StatusBadge> : null}
                <StatusBadge hue={c.hue} size="sm">{c.label}</StatusBadge>
                <Icon icon={ArrowRight01Icon} size={15} className="text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
