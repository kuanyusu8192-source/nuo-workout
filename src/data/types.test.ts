import { describe, expect, it } from 'vitest';
import { normalizeSessionMode } from './types';

describe('normalizeSessionMode', () => {
  it('舊資料的 gear／travel 視為 normal；normal／backfill 不變', () => {
    expect(normalizeSessionMode('gear')).toBe('normal');
    expect(normalizeSessionMode('travel')).toBe('normal');
    expect(normalizeSessionMode('normal')).toBe('normal');
    expect(normalizeSessionMode('backfill')).toBe('backfill');
  });
});
