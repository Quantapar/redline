import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { FindingStatusControl } from '../components/finding-status-control';

beforeEach(() => { refresh.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FindingStatusControl', () => {
  it('shows Acknowledge/Resolve when open and resolves via the endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<FindingStatusControl findingId="f1" status="open" />);
    expect(screen.getByText('Acknowledge')).toBeDefined();
    fireEvent.click(screen.getByText('Resolve'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/findings/f1/status', expect.objectContaining({ method: 'POST' })),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.status).toBe('resolved');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows Reopen when already resolved', () => {
    render(<FindingStatusControl findingId="f1" status="resolved" />);
    expect(screen.getByText('Reopen')).toBeDefined();
    expect(screen.queryByText('Resolve')).toBeNull();
  });
});
