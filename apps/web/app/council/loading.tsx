import { HeadSkeleton, StatsSkeleton, PanelSkeleton } from '@/components/overlay/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeadSkeleton />
      <StatsSkeleton />
      <PanelSkeleton rows={5} />
    </div>
  );
}
