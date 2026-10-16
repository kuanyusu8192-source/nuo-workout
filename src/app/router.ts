/** 極簡 hash 路由（自寫）。`#/exercise/abc?tab=chart` → pathname '/exercise/abc'、query tab=chart。 */
import { useEffect, useState } from 'preact/hooks';

export interface Route {
  pathname: string;
  segments: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  let h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!h.startsWith('/')) h = `/${h}`;
  const q = h.indexOf('?');
  const rawPath = q >= 0 ? h.slice(0, q) : h;
  const query = new URLSearchParams(q >= 0 ? h.slice(q + 1) : '');
  const segments = rawPath.split('/').filter(Boolean);
  return { pathname: `/${segments.join('/')}`, segments, query };
}

/**
 * 路徑比對。`:name` 取一段並 decodeURIComponent；結尾 `/*` 吃掉剩餘所有段（參數名 '*'），支援巢狀。
 * 不符合回 null。
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const ps = pattern.split('/').filter(Boolean);
  const xs = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p === '*') {
      params['*'] = xs.slice(i).join('/');
      return params;
    }
    if (i >= xs.length) return null;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(xs[i]);
    else if (p !== xs[i]) return null;
  }
  return xs.length === ps.length ? params : null;
}

export const href = (to: string): string => `#${to}`;

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    const url = new URL(window.location.href);
    url.hash = href(to);
    window.location.replace(url.toString());
  } else {
    window.location.hash = href(to);
  }
}

/** 是否有上一頁可回（WebView 起始只有 1 筆歷史） */
export const canGoBack = (): boolean => window.history.length > 1;

/** 有上一頁就 history.back()，否則（深層連結直接開啟）取代為 fallback */
export function goBack(fallback = '/today'): void {
  if (canGoBack()) window.history.back();
  else navigate(fallback, { replace: true });
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    on();
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(hash);
}
