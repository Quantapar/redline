import { HeadSkeleton, StatsSkeleton, ColumnsSkeleton } from '@/components/overlay/skeletons';

export default function Loading() {
  return (
    <>
      <HeadSkeleton actions />
      <StatsSkeleton />
      <ColumnsSkeleton />
    </>
  );
}
