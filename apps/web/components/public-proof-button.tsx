'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon';
import { CheckmarkCircle02Icon, JusticeScale01Icon } from '@hugeicons/core-free-icons';

export function PublicProofButton({ findingId }: { findingId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      const res = await fetch(`/api/findings/${findingId}/proof`);
      const proof = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Button size="sm" variant="ghost" className="w-full" onClick={copy}>
      <Icon icon={copied ? CheckmarkCircle02Icon : JusticeScale01Icon} size={14} />
      {copied ? 'Proof copied' : 'Copy public proof'}
    </Button>
  );
}
