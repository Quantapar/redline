'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Icon } from '@/components/icon';
import { Target01Icon } from '@hugeicons/core-free-icons';
import { csrfHeaders } from '@/lib/csrf-client';

export function RunScanButton({ repoId, label = 'Run a scan' }: { repoId?: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch('/api/scans/run', {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ repoId }),
      });
      const data = await res.json();
      if (data.scanId) router.push(`/scans/${data.scanId}`);
      else setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button variant="default" onClick={run} disabled={loading} aria-busy={loading}>
      {loading ? <Spinner /> : <Icon icon={Target01Icon} size={16} />}
      {label}
    </Button>
  );
}
