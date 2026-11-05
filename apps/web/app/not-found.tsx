import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { DashboardSquare01Icon } from '@hugeicons/core-free-icons';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <div className="text-[13px] font-mono text-muted-foreground">404</div>
      <h1 className="text-lg font-semibold tracking-tight">Nothing here</h1>
      <p className="text-[13px] text-muted-foreground">
        That finding or scan does not exist, or it was removed. Head back to the overview.
      </p>
      <Button variant="default" size="sm" nativeButton={false} render={<Link href="/" />}>
        <Icon icon={DashboardSquare01Icon} size={15} /> Back to overview
      </Button>
    </div>
  );
}
