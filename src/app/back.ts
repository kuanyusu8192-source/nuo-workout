/**
 * Android 返回鍵契約。
 * - 面板／彈窗用 `useBackHandler(close, open)` 註冊；返回時先呼叫「最上層」的 handler。
 * - 沒有 handler 時：非根畫面 → goBack；根畫面（五個分頁）→ exit()。
 * - 目前用兩種來源模擬：(1) 瀏覽器返回（popstate；註冊時 pushState 一個標記條目，返回只消耗它）
 *   (2) 自訂事件 `nuo:back`（Capacitor 之後在 App.addListener('backButton') 裡呼叫 `dispatchBackEvent()` 即可）。
 */
import { useEffect, useRef } from 'preact/hooks';

export const BACK_EVENT = 'nuo:back';

interface Entry {
  fn: () => void;
  /** 由 popstate 觸發關閉：標記條目已被瀏覽器消耗，註銷時不必再 history.back() */
  closedByPop: boolean;
}

const stack: Entry[] = [];
let ignorePops = 0;
/** UI 自行關閉而待回收的標記條目數；同一個 tick 內合併成一次 history.go(-n)（只會觸發一次 popstate） */
let pendingUiBack = 0;

function flushUiBack() {
  const n = pendingUiBack;
  pendingUiBack = 0;
  if (n > 0) {
    ignorePops++;
    window.history.go(-n);
  }
}

let popAttached = false;
function ensurePopListener() {
  if (popAttached) return;
  popAttached = true;
  window.addEventListener('popstate', onPop);
}

export function registerBackHandler(fn: () => void): () => void {
  ensurePopListener();
  const entry: Entry = { fn, closedByPop: false };
  stack.push(entry);
  window.history.pushState({ nuoLayer: true }, '');
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    if (!entry.closedByPop) {
      if (pendingUiBack++ === 0) queueMicrotask(flushUiBack);
    }
  };
}

/** 處理一次返回；回傳是否有 handler 吃掉。 */
export function runBackHandler(viaPop = false): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.closedByPop = viaPop;
  top.fn();
  return true;
}

export const backStackSize = (): number => stack.length;

function onPop() {
  if (ignorePops > 0) {
    ignorePops--;
    return;
  }
  runBackHandler(true);
}

export function dispatchBackEvent(): void {
  window.dispatchEvent(new Event(BACK_EVENT));
}

export interface BackOptions {
  isRoot: () => boolean;
  goBack: () => void;
  exit: () => void;
}

/** 安裝全域返回處理；回傳解除函式。App 掛載時呼叫一次。 */
export function installBackHandling(opts: BackOptions): () => void {
  const onEvent = () => {
    if (runBackHandler(false)) return;
    if (opts.isRoot()) opts.exit();
    else opts.goBack();
  };
  ensurePopListener();
  window.addEventListener(BACK_EVENT, onEvent);
  return () => {
    window.removeEventListener(BACK_EVENT, onEvent);
  };
}

/** 面板／彈窗開啟時註冊返回行為（active=false 時不註冊）。 */
export function useBackHandler(handler: () => void, active = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => ref.current());
  }, [active]);
}
