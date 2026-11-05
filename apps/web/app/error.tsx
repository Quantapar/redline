'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { Refresh01Icon } from '@hugeicons/core-free-icons';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[redline] page error:', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something failed to load</h1>
      <p className="text-[13px] text-muted-foreground">
        This view hit an error. It is usually transient — the database or the queue may be starting up.
        Try again, and if it persists check the health endpoint.
      </p>
      <Button variant="default" size="sm" onClick={reset}>
        <Icon icon={Refresh01Icon} size={15} /> Try again
      </Button>
    </div>
  );
}
