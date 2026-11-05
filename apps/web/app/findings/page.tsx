import Link from 'next/link';
import { listAllFindings } from '@/lib/queries';
import { StatusBadge } from '@/components/status-badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Icon } from '@/components/icon';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Bug01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { WEAKNESS_LABEL, SEVERITY_HUE, CONSENSUS_LABEL, timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function FindingsPage() {
  const findings = await listAllFindings();
  const red = findings.filter((f) => f.finding.isRed);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Findings</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {red.length} red {red.length === 1 ? 'alarm' : 'alarms'}, each a theft reproduced by the council. The rest were searched and did not reproduce.
        </p>
      </div>
      {findings.length === 0 ? (
        <Empty className="rounded-xl border border-border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Icon icon={Bug01Icon} size={22} /></EmptyMedia>
            <EmptyTitle>No findings yet</EmptyTitle>
            <EmptyDescription>Run a scan on a repository. A finding appears here only when the council reproduces a theft.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-5">Finding</TableHead>
              <TableHead>Repository</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Council</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pe-5 text-end">Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map(({ finding, repoName }) => {
              const c = CONSENSUS_LABEL[finding.consensus] ?? { label: finding.consensus, hue: 'neutral' as const };
              return (
                <TableRow key={finding.id}>
                  <TableCell className="ps-5">
                    <Link href={`/findings/${finding.id}`} className="group flex items-center gap-2.5 font-medium hover:underline">
                      <span className={`flex size-6 items-center justify-center rounded-md ${finding.isRed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                        <Icon icon={Bug01Icon} size={13} />
                      </span>
                      {WEAKNESS_LABEL[finding.weaknessClass] ?? finding.weaknessClass}
                      <Icon icon={ArrowRight01Icon} size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{repoName}</TableCell>
                  <TableCell>{finding.severity ? <StatusBadge hue={SEVERITY_HUE[finding.severity] ?? 'neutral'} size="sm">{finding.severity}</StatusBadge> : <span className="text-[12px] text-muted-foreground">—</span>}</TableCell>
                  <TableCell><StatusBadge hue={c.hue} size="sm">{c.label}</StatusBadge></TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1.5 text-[12px] ${finding.status === 'resolved' ? 'text-[var(--success)]' : finding.status === 'acknowledged' ? 'text-muted-foreground' : 'text-foreground'}`}>
                      <span className={`size-1.5 rounded-full ${finding.status === 'resolved' ? 'bg-[var(--success)]' : finding.status === 'open' || finding.status === 'reopened' ? 'bg-destructive' : 'bg-muted-foreground'}`} />
                      {finding.status[0]!.toUpperCase() + finding.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell className="pe-5 text-end text-[12px] text-muted-foreground">{timeAgo(finding.createdAt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      )}
    </div>
  );
}
