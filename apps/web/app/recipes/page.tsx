import { getRecipes } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { Icon } from '@/components/icon';
import { Target01Icon } from '@hugeicons/core-free-icons';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { WEAKNESS_LABEL, SEVERITY_HUE } from '@/lib/format';
import { Head } from '@/components/overlay/ui';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const recipes = await getRecipes();

  return (
    <div className="space-y-6">
      <Head title="Attack recipes" meta="A shared, public library of attack patterns. The swarm pulls from it on every scan, and every proven attack is published back so anyone can replay it. No private code is ever stored here." />

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
          <Card key={r.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium">{r.title}</span>
              <StatusBadge hue={SEVERITY_HUE[r.severity] ?? 'neutral'} size="sm">{r.severity}</StatusBadge>
              {r.source === 'watch-mode' ? <StatusBadge hue="info" size="sm">watch mode</StatusBadge> : null}
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{r.template}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {WEAKNESS_LABEL[r.weaknessClass] ?? r.weaknessClass}
              </span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r.chain}</span>
              {(r.labels as string[]).map((l) => (
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
