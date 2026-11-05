import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PublicProofButton } from '../components/public-proof-button';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PublicProofButton', () => {
  it('fetches the proof and copies it to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ finding: { consensus: 'reproduced' }, council: [] }) }));
    render(<PublicProofButton findingId="f1" />);
    fireEvent.click(screen.getByText('Copy public proof'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = JSON.parse(writeText.mock.calls[0]![0] as string);
    expect(copied.finding.consensus).toBe('reproduced');
    await waitFor(() => expect(screen.getByText('Proof copied')).toBeDefined());
  });
});
