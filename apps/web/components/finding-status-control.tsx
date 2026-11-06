'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { CheckmarkCircle02Icon, Cancel01Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { csrfHeaders } from '@/lib/csrf-client';

const LABEL: Record<string, string> = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved', reopened: 'Reopened' };

export function FindingStatusControl({ findingId, status: initial }: { findingId: string; status: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function set(next: string) {
    if (busy || next === status) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/findings/${findingId}/status`, {
        method: 'POST',
        headers: csrfHeaders({ 'content-type': 'application/json' }),
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) { setStatus(next); router.refresh(); }
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const isClosed = status === 'resolved';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-muted-foreground">Status</span>
        <span className="font-medium">{LABEL[status] ?? status}</span>
      </div>
      <div className="flex gap-1.5">
        {isClosed ? (
          <Button size="sm" variant="outline" className="flex-1" onClick={() => set('reopened')} disabled={busy} aria-busy={busy}>
            <Icon icon={Refresh01Icon} size={14} /> Reopen
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => set('acknowledged')} disabled={busy || status === 'acknowledged'} aria-busy={busy}>
              <Icon icon={Cancel01Icon} size={14} /> Acknowledge
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => set('resolved')} disabled={busy} aria-busy={busy}>
              <Icon icon={CheckmarkCircle02Icon} size={14} /> Resolve
            </Button>
          </>
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-[11px] text-destructive">Couldn&apos;t update the status. Try again.</p>
      ) : null}
    </div>
  );
}
