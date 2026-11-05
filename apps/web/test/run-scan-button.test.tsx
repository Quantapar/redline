import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { RunScanButton } from '../components/run-scan-button';

beforeEach(() => { push.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RunScanButton', () => {
  it('posts to the run endpoint and navigates to the new scan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ scanId: 'scan-123' }) });
    vi.stubGlobal('fetch', fetchMock);

    render(<RunScanButton />);
    fireEvent.click(screen.getByText('Run a scan'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/scans/run', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/scans/scan-123'));
  });

  it('stops loading and does not navigate when no scan id comes back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}) }));
    render(<RunScanButton label="Scan now" />);
    fireEvent.click(screen.getByText('Scan now'));
    await waitFor(() => expect(push).not.toHaveBeenCalled());
  });
});
