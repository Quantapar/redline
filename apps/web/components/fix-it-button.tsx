'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CodeBlock } from '@/components/ui/code-block';
import { Spinner } from '@/components/ui/spinner';
import { Icon } from '@/components/icon';
import { FlashIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';

type FixData = { explanation: string; diff: string; branch: string; model?: string };

export function FixItButton({ findingId }: { findingId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fix, setFix] = useState<FixData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setOpen(true);
    if (fix || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/findings/${findingId}/fix`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Could not generate a fix.');
      else setFix(data);
    } catch {
      setError('Request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="default" size="default" className="w-full" onClick={generate}>
        <Icon icon={FlashIcon} size={16} />
        Fix it
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Proposed fix</DialogTitle>
            <DialogDescription>
              The smallest change that closes the hole. A human always reviews before it merges, and the
              attack is saved as a permanent test that re-runs on every future change.
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2.5 py-8 text-[13px] text-muted-foreground">
              <Spinner /> Generating the fix and the regression test…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-[13px] text-muted-foreground">{error}</div>
          ) : fix ? (
            <div className="log-line-in space-y-3">
              <p className="text-[13px] leading-relaxed text-foreground">{fix.explanation}</p>
              {fix.diff && fix.diff !== '(no diff returned)' ? (
                <CodeBlock code={fix.diff} language="ts" filename={`${fix.branch}.diff`} />
              ) : null}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
                <Icon icon={CheckmarkCircle02Icon} size={14} className="text-[var(--success)]" />
                Opens on branch <span className="font-mono">{fix.branch}</span> with the attack saved as a permanent test.
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
