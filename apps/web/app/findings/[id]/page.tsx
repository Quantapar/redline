import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFindingDetail } from '@/lib/queries';
import { CouncilPanel } from '@/components/council-panel';
import { FixItButton } from '@/components/fix-it-button';
import { FindingStatusControl } from '@/components/finding-status-control';
import { PublicProofButton } from '@/components/public-proof-button';
import { StatusBadge } from '@/components/status-badge';
import { LockedAttack } from '@/components/locked-attack';
import { redactAttack } from '@/lib/redact';
import { highlightCode } from '@/lib/highlight-code';
import { Icon } from '@/components/icon';
import {
  Bug01Icon, LockedIcon, SourceCodeIcon, ArrowRight01Icon, Shield01Icon, Coins01Icon, AiBrain01Icon,
} from '@hugeicons/core-free-icons';
import {
  WEAKNESS_LABEL, SEVERITY_HUE, CONSENSUS_LABEL, shortSha, formatEth,
} from '@/lib/format';
import { netMovedWei } from '@/lib/referee-value';

export const dynamic = 'force-dynamic';

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFindingDetail(id);
  if (!data) notFound();
  const { finding, candidate, runs, scan, repo } = data;
  const consensus = CONSENSUS_LABEL[finding.consensus] ?? { label: finding.consensus, hue: 'neutral' as const };
  const movedRun = runs.find((r) => r.outcome === 'moved');
  const redacted = candidate?.forgeTest ? redactAttack(candidate.forgeTest) : null;
  const atRisk = movedRun ? netMovedWei(movedRun.deltas) : candidate?.claimedValueWei ?? '0';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Link href="/findings" className="hover:text-foreground">Findings</Link>
        <Icon icon={ArrowRight01Icon} size={13} />
        <span className="text-foreground">{WEAKNESS_LABEL[finding.weaknessClass] ?? finding.weaknessClass}</span>
      </nav>

      <div className="flex items-start gap-4">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${finding.isRed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
          <Icon icon={Bug01Icon} size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{WEAKNESS_LABEL[finding.weaknessClass] ?? finding.weaknessClass} in {candidate?.targetContract}</h1>
            {finding.severity ? <StatusBadge hue={SEVERITY_HUE[finding.severity] ?? 'neutral'} size="sm">{finding.severity}</StatusBadge> : null}
            <StatusBadge hue={consensus.hue} size="sm">{consensus.label}</StatusBadge>
          </div>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{finding.plainSentence}</p>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground">
            {repo ? <span className="font-medium text-foreground">{repo.fullName}</span> : null}
            {scan ? <span className="font-mono">{shortSha(scan.commitSha)}</span> : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <CouncilPanel runs={runs} agreement={finding.agreementCount} total={finding.refereeCount} />

          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
              <Icon icon={SourceCodeIcon} size={16} className="text-muted-foreground" />
              <div className="flex-1 text-[13px] font-semibold">The attack</div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                <Icon icon={LockedIcon} size={12} /> Runnable form locked until you prove ownership
              </span>
            </div>
            <div className="p-3">
              {redacted ? <LockedAttack preview={redacted.preview} previewLines={highlightCode(redacted.preview.replace(/\n$/, ''), 'ts')} hiddenLines={redacted.hiddenLines} /> : <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">No attack recorded.</div>}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <FixItButton findingId={finding.id} />
            <p className="mt-2.5 text-center text-[11px] text-muted-foreground">Drafts the smallest fix as a diff for you to review.</p>
            <div className="mt-2 border-t border-border pt-2">
              <PublicProofButton findingId={finding.id} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Detail icon={Coins01Icon} label="Value moved" value={formatEth(atRisk)} accent />
            <Detail icon={AiBrain01Icon} label="Found by" value={candidate?.hunterModel ?? '—'} mono />
            <Detail icon={Shield01Icon} label="Forever-test" value={finding.isRed ? 'Saved' : 'Not saved'} />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <FindingStatusControl findingId={finding.id} status={finding.status} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ icon, label, value, accent, mono }: { icon: Parameters<typeof Icon>[0]['icon']; label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Icon icon={icon} size={16} className="text-muted-foreground" />
      <div className="flex-1 text-[12px] text-muted-foreground">{label}</div>
      <div className={`text-[13px] font-medium ${accent ? 'text-destructive' : ''} ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</div>
    </div>
  );
}
