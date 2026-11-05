import { SCAN_STATUS_LABEL } from './format';

export type ScanEventHue = 'error' | 'success' | undefined;

/** Map a live scan event to its display text and hue (pure; the icon is added in the component). */
export function describeScanEvent(ev: Record<string, unknown> & { type: string }): { text: string; hue: ScanEventHue } | null {
  switch (ev.type) {
    case 'status':
      return { text: `Stage: ${SCAN_STATUS_LABEL[String(ev.status)] ?? ev.status}`, hue: undefined };
    case 'log':
      return { text: String(ev.message), hue: undefined };
    case 'candidate':
      return { text: `${String(ev.model)} proposed a ${String(ev.weaknessClass)} attack on ${String(ev.contract)}`, hue: undefined };
    case 'referee':
      return { text: `${String(ev.referee)} ran the attack: ${String(ev.outcome)}`, hue: ev.outcome === 'moved' ? 'error' : undefined };
    case 'finding':
      return { text: `${String(ev.title)} — ${String(ev.consensus)}`, hue: ev.isRed ? 'error' : 'success' };
    case 'done':
      return { text: `Scan complete — ${Number(ev.redCount)} red`, hue: Number(ev.redCount) > 0 ? 'error' : 'success' };
    default:
      return null;
  }
}
