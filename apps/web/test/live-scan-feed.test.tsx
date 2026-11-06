import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// Capture the mock EventSource instance so the test can push messages.
let es: MockEventSource | null = null;
class MockEventSource {
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { es = this; }
  close() { this.closed = true; }
  emit(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

import { LiveScanFeed } from '../components/live-scan-feed';

beforeEach(() => { refresh.mockReset(); es = null; vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LiveScanFeed', () => {
  it('renders streamed events and finishes on done', async () => {
    render(<LiveScanFeed scanId="s1" initialStatus="queued" />);
    expect(screen.getByText(/Live — attacking on a throwaway fork/)).toBeDefined();

    await act(async () => {
      es!.emit({ type: 'candidate', contract: 'Vault', weaknessClass: 'reentrancy', model: 'glm-5.3' });
      es!.emit({ type: 'referee', referee: 'referee-a', outcome: 'moved' });
      es!.emit({ type: 'finding', title: 'Reentrancy in Vault', consensus: 'reproduced', isRed: true });
    });
    await waitFor(() => expect(screen.getByText(/glm-5.3 proposed a reentrancy attack on Vault/)).toBeDefined());
    expect(screen.getByText(/referee-a ran the attack: moved/)).toBeDefined();

    await act(async () => { es!.emit({ type: 'done', redCount: 1 }); });
    await waitFor(() => expect(screen.getByText(/Scan finished/)).toBeDefined());
    expect(es!.closed).toBe(true);
  });

  it('starts already finished when the scan is complete', () => {
    render(<LiveScanFeed scanId="s2" initialStatus="complete" />);
    expect(screen.getByText(/Scan finished/)).toBeDefined();
    expect(es).toBeNull(); // no stream opened for a finished scan
  });

  it('ends the live view when the scan is cancelled elsewhere (poll fallback)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ status: 'cancelled' }) });
      vi.stubGlobal('fetch', fetchMock);
      render(<LiveScanFeed scanId="s3" initialStatus="hunting" />);
      expect(screen.getByText(/Live — attacking on a throwaway fork/)).toBeDefined();
      // Advance past the 2s status poll; the stream never sent 'done'.
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(fetchMock).toHaveBeenCalledWith('/api/scans/s3/status', expect.anything());
      expect(screen.getByText(/Scan finished/)).toBeDefined(); // no longer stuck on "Live"
      expect(es!.closed).toBe(true); // the stream was closed
    } finally {
      vi.useRealTimers();
    }
  });
});
