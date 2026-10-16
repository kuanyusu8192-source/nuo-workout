import type { ComponentChildren } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';

interface FieldFrameProps {
  label: string;
  inputId: string;
  hint?: string;
  error?: string;
  children?: ComponentChildren;
}

/** 可見 label ＋ 錯誤／提示訊息（顯示在欄位旁，說明怎麼修）。 */
export function FieldFrame({ label, inputId, hint, error, children }: FieldFrameProps) {
  return (
    <div class={`nuo-field${error ? ' has-error' : ''}`}>
      <label class="nuo-field__label" for={inputId}>{label}</label>
      {children}
      {error ? (
        <p class="nuo-field__msg nuo-field__msg--error" id={`${inputId}-msg`} role="alert">{error}</p>
      ) : hint ? (
        <p class="nuo-field__msg" id={`${inputId}-msg`}>{hint}</p>
      ) : null}
    </div>
  );
}

export interface FieldProps {
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  hint?: string;
  error?: string;
  id?: string;
  name?: string;
  type?: 'text' | 'search' | 'email' | 'tel';
  inputMode?: 'text' | 'numeric' | 'decimal' | 'search' | 'email' | 'tel';
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  autoComplete?: string;
}

/** 文字欄位。不接受只靠 placeholder 當標籤。 */
export function Field({ label, hint, error, value, onChange, id, type = 'text', ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <FieldFrame label={label} inputId={inputId} hint={hint} error={error}>
      <input
        {...rest}
        {...({ type } as Record<string, string>)}
        id={inputId}
        class="nuo-input"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        onInput={(e) => onChange?.((e.currentTarget as HTMLInputElement).value)}
      />
    </FieldFrame>
  );
}

export interface NumberFieldProps {
  label: string;
  /** 目前數值（null = 空） */
  value: number | null;
  /** 輸入合法時給數字；空白或不合法給 null */
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** true（預設）= inputmode decimal（重量）；false = numeric（次數、年齡） */
  decimal?: boolean;
  unit?: string;
  required?: boolean;
  hint?: string;
  id?: string;
}

/** 驗證訊息，例：「重量需介於 0–500」 */
export function rangeMessage(label: string, min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) return `${label}需介於 ${min}–${max}`;
  if (min !== undefined) return `${label}需大於或等於 ${min}`;
  if (max !== undefined) return `${label}需小於或等於 ${max}`;
  return `${label}請輸入數字`;
}

export function NumberField({ label, value, onChange, min, max, step, decimal = true, unit, required, hint, id }: NumberFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const [text, setText] = useState(value === null ? '' : String(value));
  const [touched, setTouched] = useState(false);

  const parsed = parse(text);
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max);
  const validValue = parsed.value !== null && inRange(parsed.value) ? parsed.value : null;

  // 外部值改變（和目前文字所代表的合法值不同）時，以外部為準
  useEffect(() => {
    if (value !== validValue) setText(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  let error: string | undefined;
  if (text.trim() === '') {
    if (required && touched) error = `請輸入${label}`;
  } else if (parsed.value === null) {
    error = rangeMessage(label, min, max);
  } else if ((min !== undefined && parsed.value < min) || (max !== undefined && parsed.value > max)) {
    error = rangeMessage(label, min, max);
  }

  return (
    <FieldFrame label={unit ? `${label}（${unit}）` : label} inputId={inputId} hint={hint} error={error}>
      <input
        id={inputId}
        class="nuo-input nuo-input--num num"
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        min={min}
        max={max}
        step={step}
        value={text}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-msg` : undefined}
        onInput={(e) => {
          const t = (e.currentTarget as HTMLInputElement).value;
          setText(t);
          const p = parse(t);
          onChange(p.value !== null && inRange(p.value) ? p.value : null);
        }}
        onBlur={() => setTouched(true)}
      />
    </FieldFrame>
  );
}

function parse(t: string): { value: number | null } {
  const s = t.trim();
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return { value: null };
  const n = Number(s);
  return { value: Number.isFinite(n) ? n : null };
}
