export function timeAgo(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** wei (decimal string) -> compact ETH label */
export function formatEth(wei: string): string {
  try {
    const v = BigInt(wei);
    const whole = v / 10n ** 18n;
    const frac = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
    return frac ? `${whole}.${frac} ETH` : `${whole} ETH`;
  } catch {
    return '0 ETH';
  }
}

export type StatusHue = 'error' | 'warning' | 'success' | 'info' | 'neutral';

export const SEVERITY_HUE: Record<string, StatusHue> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
};

export const CONSENSUS_LABEL: Record<string, { label: string; hue: StatusHue }> = {
  reproduced: { label: 'Reproduced', hue: 'error' },
  fragile: { label: 'Fragile', hue: 'warning' },
  'not-reproduced': { label: 'Not reproduced', hue: 'success' },
  inconclusive: { label: 'Inconclusive', hue: 'neutral' },
};

export const SCAN_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  'static-analysis': 'Static analysis',
  hunting: 'Hunting',
  verifying: 'Verifying',
  judging: 'Judging',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const WEAKNESS_LABEL: Record<string, string> = {
  reentrancy: 'Reentrancy',
  'access-control': 'Access control',
  'unchecked-external-call': 'Unchecked call',
  'integer-overflow': 'Integer overflow',
  'price-oracle-manipulation': 'Oracle manipulation',
  'flash-loan': 'Flash loan',
  'logic-error': 'Logic error',
  'uninitialized-storage': 'Uninitialized storage',
  delegatecall: 'Delegatecall',
  'signature-replay': 'Signature replay',
  dos: 'Denial of service',
  'front-running': 'Front-running',
  other: 'Other',
};
