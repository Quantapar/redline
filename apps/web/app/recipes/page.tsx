import { getRecipes } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Icon } from '@/components/icon';
import { Target01Icon, Database01Icon, LinkSquare02Icon } from '@hugeicons/core-free-icons';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { WEAKNESS_LABEL, SEVERITY_HUE } from '@/lib/format';
import { Head } from '@/components/overlay/ui';
import { ARKIV_EXPLORER } from '@redline/arkiv';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const { recipes, source, writer } = await getRecipes();

  return (
    <div className="space-y-6">
      <Head title="Attack recipes" meta="A shared, public library of attack patterns. The swarm pulls from it on every scan, and every proven attack is published back so anyone can replay it. No private code is ever stored here." />

      {source === 'arkiv' ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
          <Icon icon={Database01Icon} size={14} className="text-foreground" />
          <span><span className="font-medium text-foreground">Read live from Arkiv</span> (Rabdi testnet), {recipes.length} {recipes.length === 1 ? 'entity' : 'entities'} in <span className="font-mono">redline.recipes</span>.</span>
          {writer ? <span>Published by <span className="font-mono">{writer.slice(0, 6)}…{writer.slice(-4)}</span></span> : null}
          <a href={ARKIV_EXPLORER} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground hover:underline">
            Explorer <Icon icon={LinkSquare02Icon} size={12} />
          </a>
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <Empty className="rounded-xl border border-border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Icon icon={Target01Icon} size={22} /></EmptyMedia>
            <EmptyTitle>No recipes yet</EmptyTitle>
            <EmptyDescription>The library fills as the swarm proves attacks and as new hacks are turned into recipes.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
      <div className="grid gap-3">
        {recipes.map((r) => (
          <Card key={r.entityKey ?? r.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium">{r.title}</span>
              <StatusBadge hue={SEVERITY_HUE[r.severity] ?? 'neutral'} size="sm">{r.severity}</StatusBadge>
              {r.source === 'watch-mode' ? <StatusBadge hue="info" size="sm">watch mode</StatusBadge> : null}
              {r.explorerUrl ? (
                <a href={r.explorerUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground">
                  {r.entityKey?.slice(0, 10)}… <Icon icon={LinkSquare02Icon} size={11} />
                </a>
              ) : null}
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{r.template}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {WEAKNESS_LABEL[r.weaknessClass] ?? r.weaknessClass}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.chain}</span>
              {r.labels.map((l) => (
                <span key={l} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{l}</span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      )}
    </div>
  );
}
