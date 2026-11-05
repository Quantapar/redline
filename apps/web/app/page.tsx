import Link from 'next/link';
import { getStats, listRecentScans, listAllFindings } from '@/lib/queries';
import { StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Icon } from '@/components/icon';
import {
  FolderLibraryIcon, Target01Icon, Bug01Icon, Shield01Icon, ArrowRight01Icon, GitBranchIcon,
} from '@hugeicons/core-free-icons';
import { timeAgo, shortSha, CONSENSUS_LABEL, SEVERITY_HUE, WEAKNESS_LABEL, SCAN_STATUS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const [stats, scans, findings] = await Promise.all([getStats(), listRecentScans(8), listAllFindings()]);
  const red = findings.filter((f) => f.finding.isRed);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            An alarm only when the money provably moves. Everything below is a reproduced theft, not a guess.
          </p>
        </div>
        <Button variant="default" size="default" nativeButton={false} render={<Link href="/repositories" />}>
          <Icon icon={Target01Icon} size={16} />
          Run a scan
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Repositories watched" value={stats.repos} icon={FolderLibraryIcon} />
        <StatTile label="Scans run" value={stats.scans} icon={Target01Icon} />
        <StatTile label="Red findings" value={stats.redFindings} icon={Bug01Icon} accent="error" hint="reproduced by the council" />
        <StatTile label="Forever-tests" value={stats.regressionTests} icon={Shield01Icon} hint="re-run on every change" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent scans</CardTitle>
            <CardDescription>Each change is attacked on a throwaway fork before it can merge.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-6">Repository</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end pe-6">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scans.map(({ scan, repoName }) => (
                  <TableRow key={scan.id} className="cursor-default">
                    <TableCell className="ps-6">
                      <Link href={`/scans/${scan.id}`} className="flex items-center gap-2 font-medium hover:underline">
                        <Icon icon={GitBranchIcon} size={15} className="text-muted-foreground" />
                        {repoName}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">{shortSha(scan.commitSha)}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{SCAN_STATUS_LABEL[scan.status]}</TableCell>
                    <TableCell className="text-end pe-6">
                      {scan.redFindingCount > 0 ? (
                        <StatusBadge hue="error" size="sm">{scan.redFindingCount} red</StatusBadge>
                      ) : (
                        <StatusBadge hue="success" size="sm">Clean</StatusBadge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Open red findings</CardTitle>
            <CardDescription>{red.length} proven, each with a replayable attack.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {red.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">No open alarms.</p>
            ) : (
              red.map(({ finding, repoName }) => (
                <Link
                  key={finding.id}
                  href={`/findings/${finding.id}`}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-destructive/40"
                >
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                    <Icon icon={Bug01Icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium">{WEAKNESS_LABEL[finding.weaknessClass] ?? finding.weaknessClass}</span>
                      {finding.severity ? (
                        <StatusBadge hue={SEVERITY_HUE[finding.severity] ?? 'neutral'} size="sm">{finding.severity}</StatusBadge>
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{repoName}</div>
                  </div>
                  <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
