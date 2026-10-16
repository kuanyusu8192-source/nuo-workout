import { act, fireEvent, render, screen } from '@testing-library/preact';
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
    window.history.back();
    await tick();
    expect(close).toHaveBeenCalledTimes(1);
    await unmount(r);
    await tick();
    off();
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
