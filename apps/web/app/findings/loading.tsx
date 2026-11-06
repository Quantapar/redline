import { HeadSkeleton, PanelSkeleton } from '@/components/overlay/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeadSkeleton />
      <PanelSkeleton rows={8} title={160} />
    </div>
  );
}
