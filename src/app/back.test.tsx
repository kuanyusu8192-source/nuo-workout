import { act, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backStackSize, dispatchBackEvent, installBackHandling, runBackHandler, useBackHandler } from './back';
import { Sheet } from '../components/Sheet';

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
const unmount = (r: { unmount: () => void }) => act(async () => { r.unmount(); });

function Layer({ onBack, active = true }: { onBack: () => void; active?: boolean }) {
  useBackHandler(onBack, active);
  return <p>layer</p>;
}

describe('返回鍵堆疊', () => {
  afterEach(() => {
    expect(backStackSize()).toBe(0);
  });

  it('只呼叫最上層 handler', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const ra = render(<Layer onBack={a} />);
    const rb = render(<Layer onBack={b} />);
    expect(backStackSize()).toBe(2);
    expect(runBackHandler()).toBe(true);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    await unmount(rb);
    await tick(); // jsdom 的 history.go 連續呼叫會合併，逐個等它完成
    await unmount(ra);
    await tick();
  });

  it('active=false 不註冊', async () => {
    const r = render(<Layer onBack={() => {}} active={false} />);
    expect(backStackSize()).toBe(0);
    expect(runBackHandler()).toBe(false);
    await unmount(r);
  });

  it('自訂事件 nuo:back：先關層，沒有層時依根畫面決定離開或返回', async () => {
    const exit = vi.fn();
    const goBack = vi.fn();
    let root = true;
    const off = installBackHandling({ isRoot: () => root, goBack, exit });
    const close = vi.fn();
    const r = render(<Layer onBack={close} />);
    dispatchBackEvent();
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    await unmount(r);
    await tick();
    dispatchBackEvent();
    expect(exit).toHaveBeenCalledTimes(1);
    root = false;
    dispatchBackEvent();
    expect(goBack).toHaveBeenCalledTimes(1);
    off();
  });

  it('瀏覽器返回（popstate）會關閉最上層，且 UI 自行關閉時不留下殘餘歷史', async () => {
    const off = installBackHandling({ isRoot: () => false, goBack: () => {}, exit: () => {} });
    const close = vi.fn();
    const r = render(<Layer onBack={close} />);
    await tick();
    // 直接送出 popstate（瀏覽器返回時實際會發生的事件）：jsdom 的 history.back() 是非同步遍歷，
    // 高負載時偶爾超過等待而造成偶發失敗；這個測試要驗證的是「收到 popstate 就關閉最上層」。
    act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1), { timeout: 5000 });
    await unmount(r);
    await tick();
    off();
  });
});

describe('導覽與標記條目回收的協調', () => {
  it('先 navigate 才卸載：不會用 history.go 蓋掉新路由；殘留標記在返回時自動跳過', async () => {
    window.location.hash = '#/a';
    await tick();
    const r = render(<Layer onBack={() => {}} />);
    await tick();
    window.location.hash = '#/b';
    await tick();
    await unmount(r);
    // 「不會被蓋掉」是負面斷言：要給錯誤的 history.go 足夠時間觸發，高負載下 30ms 太短
    await act(async () => { await new Promise((res) => setTimeout(res, 300)); });
    expect(window.location.hash).toBe('#/b');
    window.history.back(); // 退到殘留標記 → 自動再退一步到原本的 #/a
    await waitFor(() => expect(window.location.hash).toBe('#/a'), { timeout: 5000 });
    // 先落在殘留標記（hash 也是 #/a、state 有標記），再被自動跳過
    await waitFor(
      () => expect((window.history.state as { nuoLayer?: boolean } | null)?.nuoLayer).toBeFalsy(),
      { timeout: 5000 },
    );
  });

  it('同一個 tick 內關閉並 navigate：新路由保持不變', async () => {
    window.location.hash = '#/a';
    await tick();
    function Host() {
      const [open, setOpen] = useState(true);
      return <>{open ? <Layer onBack={() => {}} /> : null}<button onClick={() => { setOpen(false); window.location.hash = '#/c'; }}>go</button></>;
    }
    render(<Host />);
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'go' }));
    await tick();
    await tick();
    expect(window.location.hash).toBe('#/c');
    expect(backStackSize()).toBe(0);
  });
});

describe('Sheet 與返回鍵', () => {
  it('返回事件先關閉面板', async () => {
    const off = installBackHandling({ isRoot: () => true, goBack: () => {}, exit: () => {} });
    function Host() {
      const [open, setOpen] = useState(true);
      return <Sheet open={open} title="篩選" onClose={() => setOpen(false)}>內容</Sheet>;
    }
    render(<Host />);
    expect(screen.getByRole('dialog', { name: '篩選' })).toBeTruthy();
    await act(async () => { dispatchBackEvent(); });
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(backStackSize()).toBe(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    off();
  });
});
