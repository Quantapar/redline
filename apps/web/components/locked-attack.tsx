'use client';

import { useState } from 'react';
import { CodeBlock } from '@/components/ui/code-block';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon';
import { LockedIcon, Key01Icon } from '@hugeicons/core-free-icons';
import type { Run } from '@/lib/highlight-code';

export function LockedAttack({ preview, previewLines, hiddenLines }: { preview: string; previewLines?: Run[][]; hiddenLines: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none select-none opacity-60 blur-[1.5px]">
          <CodeBlock code={preview} highlighted={previewLines} language="ts" filename="Exploit.t.sol" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full border border-border bg-background/90">
            <Icon icon={LockedIcon} size={18} />
          </div>
          <div className="text-center text-[12px] text-muted-foreground">
            {hiddenLines} line{hiddenLines === 1 ? '' : 's'} of runnable exploit withheld
          </div>
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <Icon icon={Key01Icon} size={14} /> Prove ownership to reveal
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prove you control this contract</DialogTitle>
            <DialogDescription>
              The finding and the council&apos;s proof are open to everyone. The runnable attack is not.
              To reveal it, sign a fresh one-time challenge with the contract&apos;s owner or admin key.
              Redline checks the signature against the on-chain owner before unlocking.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground">
            This keeps a working exploit out of the hands of anyone who cannot already change the contract.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
