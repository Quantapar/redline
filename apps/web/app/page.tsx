import { auth } from '@/auth';
import { FlowRoot } from '@/components/flow/flow-root';
import { getStats, listRecentScans, listAllFindings, listRepositories } from '@/lib/queries';
import { RunScanButton } from '@/components/run-scan-button';
import { Icon } from '@/components/icon';
import { Head, StatGrid, Stat, Panel, PanelLink, Meter, Agenda, AgendaRow, EmptyState, Dot } from '@/components/overlay/ui';
import {
  Bug01Icon, GitBranchIcon, ShieldCheckIcon, CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons';
import {
  timeAgo, shortSha, formatEth, WEAKNESS_LABEL, SEVERITY_HUE, SCAN_STATUS_LABEL, type StatusHue,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

const HUE_COLOR: Record<StatusHue, string> = {
  error: 'var(--error)',
  warning: 'var(--warning)',
  success: 'var(--success)',
  info: 'var(--info)',
  neutral: 'var(--ov-text-4)',
};

const longDate = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

export default async function HomePage() {
  // Signed-out visitors get the public onboarding flow in place of the dashboard.
  const session = await auth();
  if (!session?.user) return <FlowRoot />;

  const [stats, scans, findings, repos] = await Promise.all([
    getStats(),
    listRecentScans(6),
    listAllFindings(),
    listRepositories(),
  ]);

  const red = findings.filter((f) => f.finding.isRed);
  const openRed = red.filter((f) => f.finding.status !== 'resolved');
  const resolvedRed = red.length - openRed.length;

  return (
    <>
      <Head
        title="Security overview"
        meta={longDate.format(new Date())}
        actions={<RunScanButton />}
      />

      <StatGrid>
        <Stat
          label="Open alarms"
          value={openRed.length}
          tone={openRed.length ? 'alarm' : undefined}
          note={openRed.length ? `${formatEth(stats.valueAtRiskWei)} proven at risk` : 'All clear'}
          href="/findings"
        />
        <Stat label="Repositories" value={stats.repos} note="watched for every change" href="/repositories" />
        <Stat label="Scans run" value={stats.scans} note="attacked on a throwaway fork" />
        <Stat label="Forever-tests" value={stats.regressionTests} note="re-run on every change" />
      </StatGrid>

      <div className="ov-columns">
        <Panel
          title="Needs attention"
          aside={<span className="ov-num ov-muted">{resolvedRed}/{red.length || 0}</span>}
        >
          <Meter value={red.length ? resolvedRed / red.length : 0} label="Red findings resolved" />
          {openRed.length === 0 ? (
            <EmptyState
              icon={ShieldCheckIcon}
              title="No open alarms"
              text="Every reproduced theft has been resolved. New ones appear here the moment the council agrees."
            />
          ) : (
            <ul className="ov-list ov-list--tight" style={{ marginTop: 4 }}>
              {openRed.slice(0, 7).map(({ finding, repoName }) => {
                const hue = SEVERITY_HUE[finding.severity ?? 'info'] ?? 'neutral';
                return (
                  <li key={finding.id} className="ov-task ov-task--compact">
                    <Dot color={HUE_COLOR[hue]} title={finding.severity ?? 'reproduced'} />
                    <a href={`/findings/${finding.id}`} className="ov-task__title" style={{ color: 'inherit', textDecoration: 'none' }}>
                      {WEAKNESS_LABEL[finding.weaknessClass] ?? finding.weaknessClass}
                      <span className="ov-muted"> · {repoName}</span>
                    </a>
                    <span className="ov-task__due">{timeAgo(finding.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="ov-stack">
          <Panel title="Recent scans" aside={<PanelLink href="/repositories">Repositories</PanelLink>}>
            {scans.length === 0 ? (
              <EmptyState icon={GitBranchIcon} title="No scans yet" text="Open a pull request on a watched repository, or run a scan, to see results here." />
            ) : (
              <Agenda>
                {scans.map(({ scan, repoName }) => {
                  const clean = scan.redFindingCount === 0;
                  return (
                    <AgendaRow
                      key={scan.id}
                      href={`/scans/${scan.id}`}
                      lead={
                        <span className="ov-agenda__time ov-num">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <Dot color={clean ? 'var(--success)' : 'var(--error)'} />
                            {timeAgo(scan.createdAt)}
                          </span>
                        </span>
                      }
                      title={<><span style={{ color: 'var(--ov-text)' }}>{repoName}</span> <span className="ov-muted ov-num">{shortSha(scan.commitSha)}</span></>}
                      trailing={<span className="ov-muted ov-num">{clean ? SCAN_STATUS_LABEL[scan.status] ?? 'clean' : `${scan.redFindingCount} red`}</span>}
                    />
                  );
                })}
              </Agenda>
            )}
          </Panel>

          <Panel title="Coverage" aside={<PanelLink href="/repositories">All</PanelLink>}>
            {repos.length === 0 ? (
              <EmptyState icon={CheckmarkCircle02Icon} title="No repositories" text="Install the Redline GitHub App on a repository to start watching it." />
            ) : (
              <Agenda>
                {repos.slice(0, 4).map((r) => (
                  <AgendaRow
                    key={r.id}
                    lead={<Icon icon={Bug01Icon} size={16} strokeWidth={1.5} className="ov-muted" />}
                    title={r.fullName}
                    trailing={
                      r.redCount > 0 ? (
                        <span className="ov-late ov-num">{r.redCount} red</span>
                      ) : (
                        <span className="ov-muted ov-num">{r.latestScan ? 'clean' : 'not scanned'}</span>
                      )
                    }
                  />
                ))}
              </Agenda>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

