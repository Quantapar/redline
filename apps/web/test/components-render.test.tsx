import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from '../components/status-badge';
import { Stat } from '../components/overlay/ui';
import { Wordmark, RedlineMark } from '../components/brand';

afterEach(() => cleanup());

describe('presentational components', () => {
  it('StatusBadge renders its label', () => {
    render(<StatusBadge hue="error">critical</StatusBadge>);
    expect(screen.getByText('critical')).toBeDefined();
  });
  it('Stat shows the value, label, and note', () => {
    render(<Stat label="Open alarms" value={2} note="108.5 ETH at risk" href="/findings" />);
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Open alarms')).toBeDefined();
    expect(screen.getByText('108.5 ETH at risk')).toBeDefined();
  });
  it('the brand mark and wordmark render', () => {
    const { container } = render(<RedlineMark />);
    expect(container.querySelector('svg')).toBeDefined();
    render(<Wordmark />);
    expect(screen.getByText('Redline')).toBeDefined();
  });
});
