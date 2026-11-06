import { HeadSkeleton, CardListSkeleton } from '@/components/overlay/skeletons';

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeadSkeleton />
      <CardListSkeleton rows={5} />
    </div>
  );
}
