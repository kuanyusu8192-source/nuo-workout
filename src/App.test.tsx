import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('顯示標題與五個分頁', () => {
    render(<App />);
    expect(screen.getByText('NUO Fit')).toBeTruthy();
    for (const label of ['今日', '歷史', '計畫', '飲食', '設定']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });
});
