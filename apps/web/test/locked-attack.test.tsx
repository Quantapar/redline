import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LockedAttack } from '../components/locked-attack';

afterEach(() => cleanup());

describe('LockedAttack', () => {
  const preview = '// Runnable exploit withheld.\nfunction testExploit() public {\n████\n}';

  it('shows the withheld silhouette and the hidden-line count, never the real steps', () => {
    render(<LockedAttack preview={preview} hiddenLines={5} />);
    expect(screen.getByText(/5 lines of runnable exploit withheld/)).toBeDefined();
    // the real steps are not present (only the silhouette)
    expect(screen.queryByText(/target\.withdraw/)).toBeNull();
  });

  it('opens the prove-ownership explanation', async () => {
    render(<LockedAttack preview={preview} hiddenLines={1} />);
    fireEvent.click(screen.getByText('Prove ownership to reveal'));
    await waitFor(() => expect(screen.getByText(/sign a fresh one-time challenge/i)).toBeDefined());
  });
});
