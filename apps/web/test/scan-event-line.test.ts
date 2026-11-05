import { describe, it, expect } from 'vitest';
import { describeScanEvent } from '../lib/scan-event-line';

describe('describeScanEvent', () => {
  it('labels a status stage', () => {
    expect(describeScanEvent({ type: 'status', status: 'hunting' })).toEqual({ text: 'Stage: Hunting', hue: undefined });
  });
  it('marks a moved referee as error, a held one as plain', () => {
    expect(describeScanEvent({ type: 'referee', referee: 'referee-a', outcome: 'moved' })?.hue).toBe('error');
    expect(describeScanEvent({ type: 'referee', referee: 'referee-b', outcome: 'did-not-move' })?.hue).toBeUndefined();
  });
  it('colors a red finding error and a non-red success', () => {
    expect(describeScanEvent({ type: 'finding', title: 'x', consensus: 'reproduced', isRed: true })?.hue).toBe('error');
    expect(describeScanEvent({ type: 'finding', title: 'x', consensus: 'not-reproduced', isRed: false })?.hue).toBe('success');
  });
  it('summarizes done by red count', () => {
    expect(describeScanEvent({ type: 'done', redCount: 2 })).toEqual({ text: 'Scan complete — 2 red', hue: 'error' });
    expect(describeScanEvent({ type: 'done', redCount: 0 })?.hue).toBe('success');
  });
  it('returns null for unknown events', () => {
    expect(describeScanEvent({ type: 'open' })).toBeNull();
  });
});
