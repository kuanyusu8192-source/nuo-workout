/**
 * Hevy / Strong CSV 匯入解析（純函式）。只產生中介格式，不做動作名稱對應（P6 resolver 負責）。
 *
 * 注意：欄位名稱與格式皆「依公開文件推定，待用真實樣本驗證」，包括：
 * - Hevy 時間格式 "16 Oct 2026, 17:36"、set_index 起算值（本檔不採用，改依列序重編 1 起算）、
 *   set_type 值（只判斷 warmup）。
 * - Strong 的 Date 格式、Weight 單位（以 strongUnit 參數指定）、Distance 單位（假設公尺）、
 *   Set Order 為 "W" 代表暖身（推定）。
 * 解析對缺欄位寬鬆：缺的欄位當 null。
 */
import type { DateStr } from './types';
import { parseDateStr, toDateStr } from './dates';

export interface ImportedSet {
  date: DateStr;
  exerciseName: string;
  setIndex: number;
  weight: number | null;
  weightUnit: 'kg' | 'lb';
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  /** 暖身組（Hevy set_type=warmup、Strong Set Order=W） */
  isWarmup: boolean;
  note?: string;
}

export type CsvFormat = 'hevy' | 'strong' | 'unknown';

export interface SkippedRow {
  /** 1 起算的列號（空行已被 parseCsv 略過，故為非空列序） */
  line: number;
  reason: string;
}

export interface ParseResult {
  sets: ImportedSet[];
  skipped: SkippedRow[];
}

export interface ImportOptions {
  strongUnit?: 'kg' | 'lb';
}

/** 解析過程的非致命警告。 */
export interface ImportWarning {
  code: 'unterminated_quote';
  /** 未閉合引號開始的列號（1 起算的非空列序，與 SkippedRow.line 同義） */
  line: number;
  message: string;
}

export type ImportOutcome =
  | ({ ok: true; format: 'hevy' | 'strong'; warnings: ImportWarning[] } & ParseResult)
  | { ok: false; error: 'unknown_format' };

/** RFC4180 解析：引號、"" 跳脫、CRLF/LF、BOM、空行會被略過。 */
export function parseCsv(text: string): string[][] {
  return parseCsvDetailed(text).rows;
}

/** 同 parseCsv，另回報檔案結尾仍未閉合的引號（unterminatedQuoteLine 為該引號開始的列號）。 */
export function parseCsvDetailed(text: string): { rows: string[][]; unterminatedQuoteLine: number | null } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let touched = false; // 此列是否有任何內容（含逗號、引號）
  let quoteLine = 0;

  const endRow = () => {
    row.push(field);
    const blank = row.length === 1 && row[0] === '' && !touched;
    if (!blank) rows.push(row);
    row = [];
    field = '';
    touched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
      touched = true;
      quoteLine = rows.length + 1;
    } else if (c === ',') {
      row.push(field);
      field = '';
      touched = true;
    } else if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else if (c === '\n') {
      endRow();
    } else {
      field += c;
      touched = true;
    }
  }
  if (field !== '' || row.length > 0 || touched) endRow();
  return { rows, unterminatedQuoteLine: inQuotes ? quoteLine : null };
}

const norm = (s: string) => s.trim().toLowerCase();

export function detectFormat(header: string[]): CsvFormat {
  const h = new Set(header.map(norm));
  if (h.has('exercise_title') && h.has('start_time')) return 'hevy';
  if (h.has('exercise name') && h.has('date') && h.has('set order')) return 'strong';
  return 'unknown';
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 往返比對（parse → format）擋掉 2026-13-45、31 Feb 等不存在的日期。 */
function validDate(s: DateStr): DateStr | null {
  const [y, m, d] = s.split('-').map(Number);
  if (!(y >= 1) || !(m >= 1) || !(d >= 1)) return null;
  return toDateStr(parseDateStr(s)) === s ? s : null;
}

function isoDate(s: string): DateStr | null {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? validDate(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

function hevyDate(s: string): DateStr | null {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/.exec(s);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return validDate(`${m[3]}-${pad(mon)}-${pad(Number(m[1]))}`);
  }
  return isoDate(s);
}

/**
 * 數值欄位解析。空白、0、負數 → null（合法的「無值」）；
 * 純數字含單一逗號（62,5）視為小數逗號；其他無法解析的非空字串 → bad（呼叫端整列跳過並說明）。
 */
function parseNum(s: string | undefined): { value: number | null; bad: boolean } {
  if (s === undefined || s.trim() === '') return { value: null, bad: false };
  let t = s.trim();
  if (/^\d+,\d+$/.test(t)) t = t.replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, bad: true };
  return { value: n > 0 ? n : null, bad: false };
}

/** 解析一組命名欄位；回傳數值表或第一個壞欄位的說明。 */
function readNums<K extends string>(
  get: (name: string) => string | undefined,
  fields: Record<K, string>,
): { ok: true; v: Record<K, number | null> } | { ok: false; reason: string } {
  const v = {} as Record<K, number | null>;
  for (const k of Object.keys(fields) as K[]) {
    const raw = get(fields[k]);
    const r = parseNum(raw);
    if (r.bad) return { ok: false, reason: `無法解析數值欄位 ${fields[k]}: ${raw}` };
    v[k] = r.value;
  }
  return { ok: true, v };
}

const NO_VALUES = '無任何數值（重量、次數、時間、距離皆空）';

function columns(header: string[]) {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    if (!idx.has(norm(h))) idx.set(norm(h), i);
  });
  return (row: string[], name: string): string | undefined => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
}

function joinNote(parts: Array<string | undefined>): string | undefined {
  const p = parts.map((x) => (x ?? '').trim()).filter(Boolean);
  return p.length ? p.join('; ') : undefined;
}

export function parseHevy(rows: string[][]): ParseResult {
  const result: ParseResult = { sets: [], skipped: [] };
  if (rows.length === 0) return result;
  const get = columns(rows[0]);
  const counters = new Map<string, number>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    const start = get(row, 'start_time') ?? '';
    const date = hevyDate(start);
    if (!date) {
      result.skipped.push({ line, reason: `無法解析日期: ${start}` });
      continue;
    }
    const name = (get(row, 'exercise_title') ?? '').trim();
    if (!name) {
      result.skipped.push({ line, reason: '缺少動作名稱' });
      continue;
    }
    const key = `${get(row, 'title') ?? ''}|${start}|${name}`;
    const setIndex = (counters.get(key) ?? 0) + 1;
    counters.set(key, setIndex);
    const nums = readNums((n) => get(row, n), {
      weight: 'weight_kg', reps: 'reps', durationSec: 'duration_seconds', km: 'distance_km',
    });
    if (!nums.ok) {
      result.skipped.push({ line, reason: nums.reason });
      continue;
    }
    const { weight, reps, durationSec, km } = nums.v;
    if (weight === null && reps === null && durationSec === null && km === null) {
      result.skipped.push({ line, reason: NO_VALUES });
      continue;
    }
    const note = joinNote([get(row, 'exercise_notes')]);
    const s: ImportedSet = {
      date,
      exerciseName: name,
      setIndex,
      weight,
      weightUnit: 'kg',
      reps,
      durationSec,
      distanceM: km === null ? null : Math.round(km * 1000),
      isWarmup: norm(get(row, 'set_type') ?? '') === 'warmup',
    };
    if (note) s.note = note;
    result.sets.push(s);
  }
  return result;
}

export function parseStrong(rows: string[][], opts: ImportOptions = {}): ParseResult {
  const result: ParseResult = { sets: [], skipped: [] };
  if (rows.length === 0) return result;
  const unit = opts.strongUnit ?? 'kg';
  const get = columns(rows[0]);
  const counters = new Map<string, number>();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 1;
    const rawDate = get(row, 'date') ?? '';
    const date = isoDate(rawDate);
    if (!date) {
      result.skipped.push({ line, reason: `無法解析日期: ${rawDate}` });
      continue;
    }
    const name = (get(row, 'exercise name') ?? '').trim();
    if (!name) {
      result.skipped.push({ line, reason: '缺少動作名稱' });
      continue;
    }
    const key = `${rawDate}|${get(row, 'workout name') ?? ''}|${name}`;
    const setIndex = (counters.get(key) ?? 0) + 1;
    counters.set(key, setIndex);
    const nums = readNums((n) => get(row, n), {
      weight: 'weight', reps: 'reps', durationSec: 'seconds', distanceM: 'distance',
    });
    if (!nums.ok) {
      result.skipped.push({ line, reason: nums.reason });
      continue;
    }
    const { weight, reps, durationSec, distanceM } = nums.v;
    if (weight === null && reps === null && durationSec === null && distanceM === null) {
      result.skipped.push({ line, reason: NO_VALUES });
      continue;
    }
    const note = joinNote([get(row, 'notes')]);
    const s: ImportedSet = {
      date,
      exerciseName: name,
      setIndex,
      weight,
      weightUnit: unit,
      reps,
      durationSec,
      distanceM,
      isWarmup: norm(get(row, 'set order') ?? '') === 'w',
    };
    if (note) s.note = note;
    result.sets.push(s);
  }
  return result;
}

export function parseImport(text: string, opts: ImportOptions = {}): ImportOutcome {
  const { rows, unterminatedQuoteLine } = parseCsvDetailed(text);
  const warnings: ImportWarning[] =
    unterminatedQuoteLine === null
      ? []
      : [{
          code: 'unterminated_quote',
          line: unterminatedQuoteLine,
          message: `第 ${unterminatedQuoteLine} 列的引號未閉合，其後內容可能被併入該欄位而無法匯入`,
        }];
  const format = rows.length ? detectFormat(rows[0]) : 'unknown';
  if (format === 'hevy') return { ok: true, format, warnings, ...parseHevy(rows) };
  if (format === 'strong') return { ok: true, format, warnings, ...parseStrong(rows, opts) };
  return { ok: false, error: 'unknown_format' };
}
