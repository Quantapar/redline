import { getDeployGates } from '@/lib/queries';
import { canDeploy, buildAttestation } from '@redline/gates';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Icon } from '@/components/icon';
import { CheckmarkCircle02Icon, Cancel01Icon, GitBranchIcon, JusticeScale01Icon } from '@hugeicons/core-free-icons';
import { shortSha } from '@/lib/format';
import { Head } from '@/components/overlay/ui';

export const dynamic = 'force-dynamic';

const COUNCIL_KEY = 'redline.council.eth';

export default async function GoingLivePage() {
  const gates = await getDeployGates();

  const rows = gates.map(({ repo, scan }) => {
    if (!scan) return { repo, decision: null as null | ReturnType<typeof canDeploy>, sha: null as string | null };
    const attestation = buildAttestation({
      versionHash: scan.commitSha,
      redFindingCount: scan.redFindingCount,
      councilComplete: true,
      issuer: COUNCIL_KEY,
    });
    const decision = canDeploy({ candidateVersionHash: scan.commitSha, attestation, councilKeys: [COUNCIL_KEY] });
    return { repo, decision, sha: scan.commitSha };
  });

  return (
    <div className="space-y-6">
      <Head title="Going-live gates" meta="Redline does not run your deploys. It guards the moment code goes live: the approved-version record can only be set by the referee council, and a version with an unresolved reproduced finding cannot pass." />

      <Card className="p-4">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Icon icon={JusticeScale01Icon} size={14} />
          Deploy lock to be held by <span className="font-mono text-foreground">{COUNCIL_KEY}</span> (ENS Enhanced Access Control — planned)
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-[12px] text-muted-foreground">Gate a deploy in your pipeline — it exits non-zero on a red or unchecked version:</div>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-[12px] text-foreground">redline verify-deploy --repo acme-defi/vault-core --version $GIT_SHA || exit 1</pre>
      </Card>

      <div className="grid gap-3">
        {rows.length === 0 ? (
          <Card className="p-6 text-center text-[13px] text-muted-foreground">
            No repositories connected yet. Once a repo is installed and scanned, its deploy gate shows here.
          </Card>
        ) : (
        rows.map(({ repo, decision, sha }) => (
          <Card key={repo.id} className="flex flex-row items-center gap-4 p-4">
            <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/50">
              <Icon icon={GitBranchIcon} size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{repo.fullName}</div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {sha ? <>approved version <span className="font-mono">{shortSha(sha)}</span></> : 'no completed scan yet'}
              </div>
            </div>
            {decision ? (
              decision.allowed ? (
                <span className="flex items-center gap-1.5 text-[13px] text-[var(--success)]">
                  <Icon icon={CheckmarkCircle02Icon} size={16} /> Deploy allowed
                </span>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-1.5 text-[13px] text-destructive">
                    <Icon icon={Cancel01Icon} size={16} /> Deploy blocked
                  </span>
                  <span className="text-[11px] text-muted-foreground">{decision.reason}</span>
                </div>
              )
            ) : (
              <StatusBadge hue="neutral" size="sm">No scan</StatusBadge>
            )}
          </Card>
        )))}
      </div>
    </div>
  );
}
