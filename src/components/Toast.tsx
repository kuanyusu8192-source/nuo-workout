import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

export type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ToastApi {
  show(message: string, opts?: { kind?: ToastKind; durationMs?: number }): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children, defaultDurationMs = 3000 }: { children?: ComponentChildren; defaultDurationMs?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((xs) => xs.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastApi['show']>(
    (message, opts) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, kind: opts?.kind ?? 'info' }]);
      timers.current.set(id, setTimeout(() => dismiss(id), opts?.durationMs ?? defaultDurationMs));
    },
    [dismiss, defaultDurationMs],
  );

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* live region 常駐，讀屏器才會播報新增的訊息；錯誤用 role=alert */}
      <div class="nuo-toasts" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} class={`nuo-toast nuo-toast--${t.kind}`} role={t.kind === 'error' ? 'alert' : undefined}>
            <span>{t.message}</span>
            <button type="button" class="nuo-toast__close" aria-label="關閉提示" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast 必須在 <ToastProvider> 內使用');
  return api;
}
