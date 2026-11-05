import { Icon } from '@/components/icon';
import { StatusBadge } from '@/components/status-badge';
import { formatEth } from '@/lib/format';
import { netMovedWei } from '@/lib/referee-value';
import { CheckmarkCircle02Icon, Cancel01Icon, AlertCircleIcon, JusticeScale01Icon } from '@hugeicons/core-free-icons';

type Run = {
  id: string;
  refereeName: string;
  provider: string;
  forkBlock: number;
  outcome: string;
  deltas: unknown;
};

const OUTCOME = {
  moved: { label: 'Money moved', hue: 'error' as const, icon: CheckmarkCircle02Icon },
  'did-not-move': { label: 'Held', hue: 'success' as const, icon: Cancel01Icon },
  error: { label: 'Error', hue: 'neutral' as const, icon: AlertCircleIcon },
  'build-failed': { label: 'Build failed', hue: 'neutral' as const, icon: AlertCircleIcon },
};

export function CouncilPanel({ runs, agreement, total }: { runs: Run[]; agreement: number; total: number }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-muted">
          <Icon icon={JusticeScale01Icon} size={15} />
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-semibold">Referee council</div>
          <div className="text-[11px] text-muted-foreground">Independent rooms vote on one fact: did the money move?</div>
        </div>
        <StatusBadge hue={agreement >= total && total > 0 ? 'error' : 'warning'} size="sm">
          {agreement}/{total} agreed
        </StatusBadge>
      </div>
      <div className="divide-y divide-border">
        {runs.map((r) => {
          const o = OUTCOME[r.outcome as keyof typeof OUTCOME] ?? OUTCOME.error;
          const moved = r.outcome === 'moved';
          return (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
              <div className={`flex size-6 items-center justify-center rounded-full ${moved ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                <Icon icon={o.icon} size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium capitalize">{r.refereeName.replace('-', ' ')}</div>
                <div className="text-[11px] text-muted-foreground">via {r.provider} · block {r.forkBlock || '—'}</div>
              </div>
              {moved ? (
                <span className="font-mono text-[12px] text-destructive tabular-nums">+{formatEth(netMovedWei(r.deltas))}</span>
              ) : null}
              <StatusBadge hue={o.hue} size="sm">{o.label}</StatusBadge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
