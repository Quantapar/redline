import { listAllFindings } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Icon } from '@/components/icon';
import { JusticeScale01Icon, Target01Icon, SourceCodeIcon } from '@hugeicons/core-free-icons';
import { CONSENSUS_LABEL } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CouncilPage() {
  const findings = await listAllFindings();
  const byConsensus = new Map<string, number>();
  for (const { finding } of findings) byConsensus.set(finding.consensus, (byConsensus.get(finding.consensus) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <Icon icon={JusticeScale01Icon} size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Referee council</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            The heart of Redline. The search can cut corners; the verdict cannot. A finding turns red only when
            independent referees, each in its own room, agree on one fact: the money moved.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Icon icon={Target01Icon} size={14} /> Hunters</div>
          <p className="mt-2 text-[13px] leading-relaxed">May use any shortcut while searching. Their output is a hypothesis with an attack — an opinion until it is reproduced.</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Icon icon={SourceCodeIcon} size={14} /> Referees</div>
          <p className="mt-2 text-[13px] leading-relaxed">Strip the shortcuts and run the attack as plain transactions from one ordinary wallet, on a fresh fork. Money moves, or no alarm.</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-[13px] font-semibold">Verdicts across all scans</div>
        <div className="mt-4 space-y-2.5">
          {(['reproduced', 'fragile', 'not-reproduced', 'inconclusive'] as const).map((k) => {
            const c = CONSENSUS_LABEL[k]!;
            const n = byConsensus.get(k) ?? 0;
            return (
              <div key={k} className="flex items-center gap-3">
                <StatusBadge hue={c.hue} size="sm">{c.label}</StatusBadge>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-foreground/30" style={{ width: `${findings.length ? (n / findings.length) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-end text-[12px] tabular-nums text-muted-foreground">{n}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Only <span className="font-medium text-foreground">reproduced</span> raises a red alarm. Disagreement means the exploit was fragile or conditional, not a universal bug.
        </p>
      </Card>
    </div>
  );
}
