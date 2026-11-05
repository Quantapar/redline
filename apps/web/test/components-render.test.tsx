import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusBadge } from '../components/status-badge';
import { StatTile } from '../components/stat-tile';
import { Wordmark, RedlineMark } from '../components/brand';
import { Bug01Icon } from '@hugeicons/core-free-icons';

afterEach(() => cleanup());

describe('presentational components', () => {
  it('StatusBadge renders its label', () => {
    render(<StatusBadge hue="error">critical</StatusBadge>);
    expect(screen.getByText('critical')).toBeDefined();
  });
  it('StatTile shows the value, label, and hint', () => {
    render(<StatTile label="Red findings" value={2} icon={Bug01Icon} accent="error" hint="108.5 ETH at risk" />);
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('Red findings')).toBeDefined();
    expect(screen.getByText('108.5 ETH at risk')).toBeDefined();
  });
  it('the brand mark and wordmark render', () => {
    const { container } = render(<RedlineMark />);
    expect(container.querySelector('svg')).toBeDefined();
    render(<Wordmark />);
    expect(screen.getByText('Redline')).toBeDefined();
  });
});
