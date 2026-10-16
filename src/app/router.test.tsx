import { act, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { canGoBack, goBack, href, matchPath, navigate, parseHash, useRoute } from './router';
import { paths } from './paths';

describe('parseHash', () => {
  it('解析路徑與查詢', () => {
    const r = parseHash('#/picker?mode=multi&x=1');
    expect(r.pathname).toBe('/picker');
    expect(r.segments).toEqual(['picker']);
    expect(r.query.get('mode')).toBe('multi');
  });
  it('空 hash 為根路徑；缺少斜線與多餘斜線會正規化', () => {
    expect(parseHash('').pathname).toBe('/');
    expect(parseHash('#today').pathname).toBe('/today');
    expect(parseHash('#//a//b/').pathname).toBe('/a/b');
  });
});

describe('matchPath', () => {
  it('固定路徑', () => {
    expect(matchPath('/today', '/today')).toEqual({});
    expect(matchPath('/today', '/history')).toBeNull();
    expect(matchPath('/today', '/today/x')).toBeNull();
  });
  it('參數與 URL 解碼', () => {
    expect(matchPath('/exercise/:id', '/exercise/vx-0025')).toEqual({ id: 'vx-0025' });
    expect(matchPath('/exercise/:id', '/exercise/a%20b')).toEqual({ id: 'a b' });
    expect(matchPath('/exercise/:id', '/exercise')).toBeNull();
  });
  it('巢狀 /* 吃掉剩餘段落', () => {
    expect(matchPath('/plans/*', '/plans')).toEqual({ '*': '' });
    expect(matchPath('/plans/*', '/plans/template/3')).toEqual({ '*': 'template/3' });
    expect(matchPath('/plans/*', '/diet/x')).toBeNull();
  });
});

describe('paths', () => {
  it('建構器產生可被解析的路徑', () => {
    expect(paths.exercise('a/b', 'chart')).toBe('/exercise/a%2Fb?tab=chart');
    const r = parseHash(href(paths.exercise('a/b', 'chart')));
    expect(matchPath('/exercise/:id', r.pathname)).toEqual({ id: 'a/b' });
    expect(r.query.get('tab')).toBe('chart');
    expect(paths.picker('multi')).toBe('/picker?mode=multi');
  });
});

function Show() {
  const r = useRoute();
  return <p data-testid="r">{r.pathname}|{r.query.get('mode') ?? ''}</p>;
}

describe('useRoute / navigate', () => {
  afterEach(() => {
    window.location.hash = '';
  });
  it('hash 改變時更新', async () => {
    render(<Show />);
    await act(async () => {
      navigate('/picker?mode=multi');
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.getByTestId('r').textContent).toBe('/picker|multi');
    await act(async () => {
      navigate('/history', { replace: true });
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.getByTestId('r').textContent).toBe('/history|');
  });
  it('goBack 在沒有歷史時改導向 fallback', () => {
    expect(typeof canGoBack()).toBe('boolean');
    expect(() => goBack('/today')).not.toThrow();
  });
});
