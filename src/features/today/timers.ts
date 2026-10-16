/**
 * 今日訓練的兩種計時：
 * - 全域組間休息（倒數，±30 秒，播放／暫停；結束時通知）
 * - 整場訓練經過時間（自 session.startedAt 往上數；endedAt 之後凍結）
 *
 * 狀態轉換是純函式（傳入「現在」毫秒），hook 只是把時鐘與 setInterval 接上去，
 * 所以單元測試可以用假時鐘，不依賴真實時間。
 */
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export const REST_STEP_SEC = 30;
export const REST_MAX_SEC = 60 * 60;

/** adjustSec：使用者在待機時用 ±30 調整的偏移（相對設定的預設秒數） */
export type RestState =
  | { phase: 'idle'; adjustSec: number }
  | { phase: 'running'; endAt: number; adjustSec: number }
  | { phase: 'paused'; remainingMs: number; adjustSec: number }
  | { phase: 'done'; adjustSec: number };

export const REST_IDLE: RestState = { phase: 'idle', adjustSec: 0 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const baseSec = (defaultSec: number, adjustSec: number) => clamp(defaultSec + adjustSec, 0, REST_MAX_SEC);

export function restRemainingMs(s: RestState, now: number, defaultSec: number): number {
  switch (s.phase) {
    case 'idle':
      return baseSec(defaultSec, s.adjustSec) * 1000;
    case 'running':
      return Math.max(0, s.endAt - now);
    case 'paused':
      return s.remainingMs;
    case 'done':
      return 0;
  }
}

export function restStart(s: RestState, now: number, defaultSec: number): RestState {
  const sec = baseSec(defaultSec, s.adjustSec);
  if (sec <= 0) return { phase: 'idle', adjustSec: s.adjustSec };
  return { phase: 'running', endAt: now + sec * 1000, adjustSec: s.adjustSec };
}

export function restPause(s: RestState, now: number): RestState {
  if (s.phase !== 'running') return s;
  return { phase: 'paused', remainingMs: Math.max(0, s.endAt - now), adjustSec: s.adjustSec };
}

export function restResume(s: RestState, now: number): RestState {
  if (s.phase !== 'paused') return s;
  if (s.remainingMs <= 0) return { phase: 'done', adjustSec: s.adjustSec };
  return { phase: 'running', endAt: now + s.remainingMs, adjustSec: s.adjustSec };
}

/** 到點就變 done（呼叫端據此觸發通知；其他狀態原樣回傳） */
export function restTick(s: RestState, now: number): RestState {
  if (s.phase === 'running' && now >= s.endAt) return { phase: 'done', adjustSec: s.adjustSec };
  return s;
}

export function restToggle(s: RestState, now: number, defaultSec: number): RestState {
  switch (s.phase) {
    case 'running':
      return restPause(s, now);
    case 'paused':
      return restResume(s, now);
    default:
      return restStart(s, now, defaultSec);
  }
}

/** ±秒：待機調整偏移；執行中／暫停中調整剩餘時間（減到 0 就結束，不觸發通知） */
export function restAdjust(s: RestState, now: number, deltaSec: number, defaultSec: number): RestState {
  switch (s.phase) {
    case 'idle':
    case 'done': {
      const next = clamp(baseSec(defaultSec, s.adjustSec) + deltaSec, 0, REST_MAX_SEC);
      return { phase: 'idle', adjustSec: next - defaultSec };
    }
    case 'running': {
      const endAt = Math.min(s.endAt + deltaSec * 1000, now + REST_MAX_SEC * 1000);
      return endAt <= now ? { phase: 'done', adjustSec: s.adjustSec } : { ...s, endAt };
    }
    case 'paused': {
      const remainingMs = clamp(s.remainingMs + deltaSec * 1000, 0, REST_MAX_SEC * 1000);
      return { ...s, remainingMs };
    }
  }
}

/** 秒數 → m:ss（超過一小時 h:mm:ss） */
export function formatClock(totalSec: number): string {
  const t = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface UseRestTimerOptions {
  /** 設定的預設休息秒數（settings.restDefaultSec） */
  defaultSec: number;
  /** 時鐘（毫秒）；預設 Date.now，測試傳假時鐘 */
  now?: () => number;
  /** 倒數自然結束時呼叫一次 */
  onDone?: () => void;
  tickMs?: number;
}

export interface RestTimerApi {
  state: RestState;
  remainingSec: number;
  running: boolean;
  start(): void;
  toggle(): void;
  adjust(deltaSec: number): void;
}

export function useRestTimer({ defaultSec, now = Date.now, onDone, tickMs = 250 }: UseRestTimerOptions): RestTimerApi {
  const [state, setStateRaw] = useState<RestState>(REST_IDLE);
  const [clock, setClock] = useState(() => now());
  const stateRef = useRef(state);
  const nowRef = useRef(now);
  const doneRef = useRef(onDone);
  const defRef = useRef(defaultSec);
  nowRef.current = now;
  doneRef.current = onDone;
  defRef.current = defaultSec;

  const setState = useCallback((s: RestState) => {
    stateRef.current = s;
    setStateRaw(s);
    setClock(nowRef.current());
  }, []);

  const running = state.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const n = nowRef.current();
      setClock(n);
      const next = restTick(stateRef.current, n);
      if (next !== stateRef.current) {
        stateRef.current = next;
        setStateRaw(next);
        doneRef.current?.();
      }
    }, tickMs);
    return () => clearInterval(id);
  }, [running, tickMs]);

  const start = useCallback(() => setState(restStart(stateRef.current, nowRef.current(), defRef.current)), [setState]);
  const toggle = useCallback(() => setState(restToggle(stateRef.current, nowRef.current(), defRef.current)), [setState]);
  const adjust = useCallback(
    (d: number) => setState(restAdjust(stateRef.current, nowRef.current(), d, defRef.current)),
    [setState],
  );

  const remainingSec = Math.ceil(restRemainingMs(state, running ? clock : nowRef.current(), defaultSec) / 1000);
  return { state, remainingSec, running, start, toggle, adjust };
}

export interface UseElapsedOptions {
  startedAt: number;
  /** 有值就凍結在這個時間 */
  endedAt?: number;
  now?: () => number;
  tickMs?: number;
}

/** 整場訓練經過秒數 */
export function useElapsed({ startedAt, endedAt, now = Date.now, tickMs = 1000 }: UseElapsedOptions): number {
  const [clock, setClock] = useState(() => now());
  const nowRef = useRef(now);
  nowRef.current = now;
  const frozen = endedAt !== undefined;
  useEffect(() => {
    setClock(nowRef.current());
    if (frozen) return;
    const id = setInterval(() => setClock(nowRef.current()), tickMs);
    return () => clearInterval(id);
  }, [frozen, tickMs]);
  const end = frozen ? endedAt : clock;
  return Math.max(0, Math.floor((end - startedAt) / 1000));
}
