import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';

describe('Icon', () => {
  it('有 label 時設 aria-label 且可被角色查到', () => {
    render(<Icon name="play" label="開始" />);
    const el = screen.getByRole('img', { name: '開始' });
    expect(el.getAttribute('aria-hidden')).toBeNull();
    expect(el.getAttribute('width')).toBe('24');
    expect(el.querySelector('use')?.getAttribute('href')).toMatch(/#play$/);
  });

  it('無 label 時 aria-hidden，並套用 size', () => {
    const { container } = render(<Icon name="check" size={16} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-label')).toBeNull();
    expect(svg.getAttribute('height')).toBe('16');
  });
});
