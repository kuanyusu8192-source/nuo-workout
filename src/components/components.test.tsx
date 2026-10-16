import { act, fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backStackSize } from '../app/back';
import { accessibleName } from '../test/helpers';
import {
  Button, Card, EmptyState, Field, IconButton, Modal, NumberField, ProgressBar, SegmentedControl,
  Sheet, Skeleton, Tabs, ToastProvider, useToast,
} from '.';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe('Button', () => {
  it('依 variant 套用深階色 class，預設 type=button', () => {
    for (const v of ['primary', 'success', 'danger', 'ghost'] as const) {
      const { unmount } = render(<Button variant={v}>送出</Button>);
      const b = screen.getByRole('button', { name: '送出' });
      expect(b.className).toContain(`nuo-btn--${v}`);
      expect(b.getAttribute('type')).toBe('button');
      unmount();
    }
  });
  it('loading 時停用、顯示處理中、不觸發點擊', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>儲存</Button>);
    const b = screen.getByRole('button', { name: '處理中…' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('一般點擊會觸發', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>儲存</Button>);
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('IconButton', () => {
  it('必有 aria-label，圖示隱藏於讀屏器', () => {
    render(<IconButton icon="trash-2" label="刪除這組" />);
    const b = screen.getByRole('button', { name: '刪除這組' });
    expect(b.getAttribute('aria-label')).toBe('刪除這組');
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(accessibleName(b)).not.toBe('');
  });
});

describe('Card', () => {
  it('一般卡片是帶標題的區塊', () => {
    render(<Card title="本週容量">內容</Card>);
    expect(screen.getByRole('heading', { name: '本週容量' })).toBeTruthy();
  });
  it('有 onClick 時整張卡是按鈕', () => {
    const onClick = vi.fn();
    render(<Card title="槓鈴臥推" onClick={onClick}>3 組</Card>);
    fireEvent.click(screen.getByRole('button', { name: '槓鈴臥推' }));
    expect(onClick).toHaveBeenCalled();
  });
});

describe('Sheet / Modal', () => {
  afterEach(async () => {
    await settle();
  });

  it('Sheet：dialog 角色、標題、關閉鈕、註冊返回鍵、關閉後還原焦點', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button onClick={() => setOpen(true)}>開啟</button>
          <Sheet open={open} title="篩選器材" onClose={() => setOpen(false)}>
            <button>槓鈴</button>
          </Sheet>
        </div>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: '開啟' });
    opener.focus();
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => { fireEvent.click(opener); });
    const dialog = screen.getByRole('dialog', { name: '篩選器材' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(backStackSize()).toBe(1);
    // 焦點移入對話框
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByRole('button', { name: '關閉' })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '關閉' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await settle();
    expect(backStackSize()).toBe(0);
  });

  it('Sheet：Escape 關閉；Tab 在內部循環', async () => {
    const onClose = vi.fn();
    render(<Sheet open title="面板" onClose={onClose}><button>甲</button></Sheet>);
    const close = screen.getByRole('button', { name: '關閉' });
    const inner = screen.getByRole('button', { name: '甲' });
    // 最後一個元素按 Tab → 回到第一個（關閉鈕）
    inner.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    // 第一個元素按 Shift+Tab → 跳到最後一個
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(inner);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Modal：alertdialog 角色與可選的 actions；closable=false 不顯示關閉鈕', () => {
    render(
      <Modal open title="刪除課表？" role="alertdialog" closable={false} onClose={() => {}} actions={<Button variant="danger">刪除</Button>}>
        刪除後無法復原
      </Modal>,
    );
    expect(screen.getByRole('alertdialog', { name: '刪除課表？' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '關閉' })).toBeNull();
    expect(screen.getByRole('button', { name: '刪除' })).toBeTruthy();
  });
});

describe('Tabs', () => {
  function Host({ onChange }: { onChange?: (id: string) => void }) {
    const [v, setV] = useState('a');
    return (
      <Tabs
        label="動作詳情"
        value={v}
        onChange={(id) => { setV(id); onChange?.(id); }}
        tabs={[{ id: 'a', label: '教學' }, { id: 'b', label: '紀錄' }, { id: 'c', label: '圖表' }]}
      >
        <p>面板 {v}</p>
      </Tabs>
    );
  }
  it('tablist／tab／tabpanel 語意，點擊切換', () => {
    render(<Host />);
    expect(screen.getByRole('tablist', { name: '動作詳情' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '教學' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '紀錄' }));
    expect(screen.getByRole('tab', { name: '紀錄' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').textContent).toContain('面板 b');
  });
  it('鍵盤：方向鍵、Home、End；roving tabindex', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    const list = screen.getByRole('tablist');
    expect(screen.getByRole('tab', { name: '紀錄' }).getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(list, { key: 'ArrowRight' }); // 循環
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
  });
});

describe('SegmentedControl', () => {
  it('radiogroup 語意、點擊與方向鍵切換', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl label="統計範圍" value="week" onChange={onChange} options={[{ value: 'week', label: '週' }, { value: 'month', label: '月' }, { value: 'year', label: '年' }]} />,
    );
    expect(screen.getByRole('radiogroup', { name: '統計範圍' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '週' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '月' }));
    expect(onChange).toHaveBeenLastCalledWith('month');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('month');
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('year');
  });
});

describe('Field / NumberField', () => {
  it('Field：可見 label 與輸入框關聯；錯誤訊息以 aria-describedby 連結', () => {
    const { rerender } = render(<Field label="動作名稱" value="" onChange={() => {}} />);
    const input = screen.getByLabelText('動作名稱') as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBeNull();
    rerender(<Field label="動作名稱" value="" error="請輸入名稱" onChange={() => {}} />);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('請輸入名稱');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('NumberField：inputmode decimal／numeric', () => {
    const { rerender } = render(<NumberField label="重量" unit="kg" value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('重量（kg）').getAttribute('inputmode')).toBe('decimal');
    rerender(<NumberField label="次數" decimal={false} value={null} onChange={() => {}} />);
    expect(screen.getByLabelText('次數').getAttribute('inputmode')).toBe('numeric');
  });

  it('NumberField：範圍驗證訊息，合法才回傳數字', () => {
    const onChange = vi.fn();
    render(<NumberField label="重量" min={0} max={500} value={null} onChange={onChange} />);
    const input = screen.getByLabelText('重量') as HTMLInputElement;
    fireEvent.input(input, { target: { value: '82.5' } });
    expect(onChange).toHaveBeenLastCalledWith(82.5);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.input(input, { target: { value: '600' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert').textContent).toBe('重量需介於 0–500');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.input(input, { target: { value: 'abc' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.input(input, { target: { value: '-3' } });
    expect(screen.getByRole('alert').textContent).toBe('重量需介於 0–500');
  });

  it('NumberField：必填空白在離開欄位後才提示', () => {
    render(<NumberField label="年齡" required decimal={false} value={null} onChange={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.blur(screen.getByLabelText('年齡'));
    expect(screen.getByRole('alert').textContent).toBe('請輸入年齡');
  });

  it('NumberField：外部更新數值會同步到輸入框', () => {
    const { rerender } = render(<NumberField label="重量" value={50} onChange={() => {}} />);
    expect((screen.getByLabelText('重量') as HTMLInputElement).value).toBe('50');
    rerender(<NumberField label="重量" value={60} onChange={() => {}} />);
    expect((screen.getByLabelText('重量') as HTMLInputElement).value).toBe('60');
  });
});

describe('EmptyState', () => {
  it('一句說明加一個明確按鈕', () => {
    const onAction = vi.fn();
    render(<EmptyState title="今天還沒有訓練" actionLabel="開始訓練" onAction={onAction} />);
    expect(screen.getByText('今天還沒有訓練')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '開始訓練' }));
    expect(onAction).toHaveBeenCalled();
  });
  it('沒有 action 時不顯示按鈕', () => {
    render(<EmptyState title="沒有資料" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function Trigger({ kind }: { kind?: 'error' | 'success' }) {
    const t = useToast();
    return <button onClick={() => t.show('已儲存', { kind })}>顯示</button>;
  }
  it('顯示於 live region，逾時自動消失，可手動關閉', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: '顯示' }));
    expect(screen.getByText('已儲存')).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('已儲存');
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText('已儲存')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '顯示' }));
    fireEvent.click(screen.getByRole('button', { name: '關閉提示' }));
    expect(screen.queryByText('已儲存')).toBeNull();
  });
  it('錯誤提示使用 role=alert', () => {
    render(<ToastProvider><Trigger kind="error" /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: '顯示' }));
    expect(screen.getByRole('alert').textContent).toContain('已儲存');
  });
  it('在 Provider 外使用會擲錯', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});

describe('Skeleton', () => {
  it('role=status、可指定高度與列數以預留版面', () => {
    const { container } = render(<Skeleton height={48} lines={3} label="載入歷史" />);
    expect(screen.getByRole('status', { name: '載入歷史' })).toBeTruthy();
    const bars = container.querySelectorAll('.nuo-skeleton');
    expect(bars.length).toBe(3);
    expect((bars[0] as HTMLElement).style.height).toBe('48px');
  });
});

describe('ProgressBar', () => {
  it('progressbar 語意與文字標籤', () => {
    render(<ProgressBar label="蛋白質" value={82} max={164} />);
    const bar = screen.getByRole('progressbar', { name: '蛋白質' });
    expect(bar.getAttribute('aria-valuenow')).toBe('82');
    expect(bar.getAttribute('aria-valuemax')).toBe('164');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('50%');
  });
  it('超標附文字且寬度不超過 100%；異常值不產生 NaN', () => {
    const { container, rerender } = render(<ProgressBar label="熱量" value={2600} max={2200} over />);
    expect(container.textContent).toContain('超標');
    expect((screen.getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('100%');
    rerender(<ProgressBar label="熱量" value={NaN} max={0} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
