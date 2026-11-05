import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FixItButton } from '../components/fix-it-button';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('FixItButton', () => {
  it('opens the dialog and shows the generated fix', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ explanation: 'Zero the balance before the external call.', diff: '--- a\n+++ b', branch: 'redline/fix-x' }),
    }));
    render(<FixItButton findingId="f1" />);
    fireEvent.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText(/Zero the balance before the external call/)).toBeDefined());
    expect(screen.getAllByText(/redline\/fix-x/).length).toBeGreaterThan(0);
  });

  it('surfaces an error when the fix cannot be generated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'only a reproduced finding can be fixed' }) }));
    render(<FixItButton findingId="f2" />);
    fireEvent.click(screen.getByText('Fix it'));
    await waitFor(() => expect(screen.getByText(/only a reproduced finding can be fixed/)).toBeDefined());
  });
});
