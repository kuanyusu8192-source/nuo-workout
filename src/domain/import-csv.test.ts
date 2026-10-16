import { describe, it, expect } from 'vitest';
import { parseCsv, detectFormat, parseHevy, parseStrong, parseImport } from './import-csv';

// 以下樣本皆為自行編寫的假資料。
const HEVY_HEADER =
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe';
const HEVY_CSV = [
  HEVY_HEADER,
  '"Push Day","16 Oct 2026, 17:36","16 Oct 2026, 18:30","",Bench Press (Barbell),,"felt ok",0,warmup,40,10,,,',
  '"Push Day","16 Oct 2026, 17:36","16 Oct 2026, 18:30","","Bench Press (Barbell)",,,1,normal,60,8,,,8',
  '"Push Day","16 Oct 2026, 17:36","16 Oct 2026, 18:30","","Curl, ""EZ"" Bar",,,0,normal,0,12,,,',
  '"Run","17 Oct 2026, 07:00","17 Oct 2026, 07:30","",Running,,,0,normal,,,5.5,1800,',
].join('\n');

const STRONG_HEADER =
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';
const STRONG_CSV =
  [
    STRONG_HEADER,
    '2026-10-16 17:36:00,Leg Day,54m,Squat (Barbell),1,100,5,0,0,,,',
    '2026-10-16 17:36:00,Leg Day,54m,Squat (Barbell),2,100,5,0,0,"heavy, slow",,',
    '2026-10-16 17:36:00,Leg Day,54m,"Lunge, Walking",1,20,12,0,0,,,',
    '2026-10-17 08:00:00,Plank,5m,Plank,1,0,0,0,60,,,',
  ].join('\r\n') + '\r\n';

describe('parseCsv', () => {
  it('基本欄位與 LF', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('CRLF 與結尾換行', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('引號內逗號、跳脫引號與換行', () => {
    expect(parseCsv('"a,b","c""d","e\nf"\n')).toEqual([['a,b', 'c"d', 'e\nf']]);
  });
  it('BOM 與空行被忽略', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('保留空欄位，最後一列無換行', () => {
    expect(parseCsv('a,,c\n,,')).toEqual([['a', '', 'c'], ['', '', '']]);
  });
  it('空字串回傳空陣列', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('detectFormat', () => {
  it('辨識 Hevy / Strong / unknown', () => {
    expect(detectFormat(HEVY_HEADER.split(','))).toBe('hevy');
    expect(detectFormat(STRONG_HEADER.split(','))).toBe('strong');
    expect(detectFormat(['foo', 'bar'])).toBe('unknown');
    expect(detectFormat([])).toBe('unknown');
  });
});

describe('parseHevy', () => {
  const r = parseHevy(parseCsv(HEVY_CSV));
  it('匯入所有列', () => {
    expect(r.sets).toHaveLength(4);
    expect(r.skipped).toEqual([]);
  });
  it('warmup 設 isWarmup 並保留動作備註，組序為 1 起算', () => {
    expect(r.sets[0]).toEqual({
      date: '2026-10-16', exerciseName: 'Bench Press (Barbell)', setIndex: 1,
      weight: 40, weightUnit: 'kg', reps: 10, durationSec: null, distanceM: null,
      isWarmup: true, note: 'felt ok',
    });
    expect(r.sets[1].setIndex).toBe(2);
    expect(r.sets[1].isWarmup).toBe(false);
    expect(r.sets[1].note).toBeUndefined();
  });
  it('重量 0 視為 null，動作名稱含逗號與引號', () => {
    expect(r.sets[2].exerciseName).toBe('Curl, "EZ" Bar');
    expect(r.sets[2].weight).toBeNull();
    expect(r.sets[2].setIndex).toBe(1);
  });
  it('有氧：公里轉公尺、秒數', () => {
    expect(r.sets[3]).toMatchObject({
      date: '2026-10-17', weight: null, reps: null, distanceM: 5500, durationSec: 1800,
    });
  });
  it('壞列被略過並回報行號', () => {
    const csv = [
      HEVY_HEADER,
      '"A","16 Oct 2026, 17:36","","",Squat,,,0,normal,50,5,,,',
      '"A","not a date","","",Squat,,,1,normal,50,5,,,',
      '"A","16 Oct 2026, 17:36","","",,,,2,normal,50,5,,,',
    ].join('\n');
    const x = parseHevy(parseCsv(csv));
    expect(x.sets).toHaveLength(1);
    expect(x.skipped.map((s) => s.line)).toEqual([3, 4]);
    expect(x.skipped[0].reason).toMatch(/日期/);
    expect(x.skipped[1].reason).toMatch(/動作/);
  });
  it('缺欄位寬鬆處理', () => {
    const x = parseHevy(parseCsv('start_time,exercise_title,reps\n"01 Jan 2026, 10:00",Squat,5\n'));
    expect(x.sets).toEqual([
      { date: '2026-01-01', exerciseName: 'Squat', setIndex: 1, weight: null, weightUnit: 'kg', reps: 5, durationSec: null, distanceM: null, isWarmup: false },
    ]);
  });
});

describe('parseStrong', () => {
  const r = parseStrong(parseCsv(STRONG_CSV));
  it('CRLF 樣本匯入全部', () => {
    expect(r.sets).toHaveLength(4);
    expect(r.skipped).toEqual([]);
  });
  it('日期、單位、備註、組序', () => {
    expect(r.sets[0]).toEqual({
      date: '2026-10-16', exerciseName: 'Squat (Barbell)', setIndex: 1,
      weight: 100, weightUnit: 'kg', reps: 5, durationSec: null, distanceM: null, isWarmup: false,
    });
    expect(r.sets[1]).toMatchObject({ setIndex: 2, note: 'heavy, slow' });
  });
  it('動作名稱含逗號；徒手與秒數', () => {
    expect(r.sets[2].exerciseName).toBe('Lunge, Walking');
    expect(r.sets[3]).toMatchObject({ weight: null, reps: null, durationSec: 60, distanceM: null });
  });
  it('strongUnit 參數', () => {
    const x = parseStrong(parseCsv(STRONG_CSV), { strongUnit: 'lb' });
    expect(x.sets[0].weightUnit).toBe('lb');
  });
  it('壞列', () => {
    const csv = [STRONG_HEADER, 'bad,W,1m,Squat,1,50,5,0,0,,,', '2026-10-16 10:00:00,W,1m,,1,50,5,0,0,,,'].join('\n');
    const x = parseStrong(parseCsv(csv));
    expect(x.sets).toHaveLength(0);
    expect(x.skipped.map((s) => s.line)).toEqual([2, 3]);
  });
  it('Set Order 為 W 視為 warmup', () => {
    const x = parseStrong(parseCsv(`${STRONG_HEADER}\n2026-10-16 10:00:00,W,1m,Squat,W,20,5,0,0,,,\n`));
    expect(x.sets[0].isWarmup).toBe(true);
    expect(x.sets[0].note).toBeUndefined();
  });
});

describe('全空數值列', () => {
  it('Hevy：weight/reps/duration/distance 皆空 → skipped', () => {
    const x = parseHevy(parseCsv(`${HEVY_HEADER}
"A","16 Oct 2026, 17:36","","",Squat,,,0,normal,,,,,
"A","16 Oct 2026, 17:36","","",Squat,,,1,normal,50,5,,,
`));
    expect(x.sets).toHaveLength(1);
    expect(x.skipped).toHaveLength(1);
    expect(x.skipped[0].line).toBe(2);
    expect(x.skipped[0].reason).toMatch(/數值/);
  });
  it('Strong：0 值也視為空', () => {
    const x = parseStrong(parseCsv(`${STRONG_HEADER}
2026-10-16 10:00:00,W,1m,Squat,1,0,0,0,0,,,
`));
    expect(x.sets).toHaveLength(0);
    expect(x.skipped).toHaveLength(1);
  });
});

describe('日期驗證', () => {
  it('Hevy 不存在的日期 → skipped', () => {
    const csv = [HEVY_HEADER, ...['31 Feb 2026, 10:00', '45 Oct 2026, 10:00', '2026-13-45 10:00'].map((d) => `"A","${d}","","",Squat,,,0,normal,50,5,,,`)].join('\n');
    const x = parseHevy(parseCsv(csv));
    expect(x.sets).toHaveLength(0);
    expect(x.skipped.map((s) => s.line)).toEqual([2, 3, 4]);
    expect(x.skipped[0].reason).toMatch(/日期/);
  });
  it('Strong 不存在的日期 → skipped；閏日合法', () => {
    const csv = [STRONG_HEADER, '2026-13-45 10:00:00,W,1m,Squat,1,50,5,0,0,,,', '2026-02-29 10:00:00,W,1m,Squat,1,50,5,0,0,,,', '2028-02-29 10:00:00,W,1m,Squat,1,50,5,0,0,,,'].join('\n');
    const x = parseStrong(parseCsv(csv));
    expect(x.sets.map((s) => s.date)).toEqual(['2028-02-29']);
    expect(x.skipped.map((s) => s.line)).toEqual([2, 3]);
  });
});

describe('數值欄位格式', () => {
  it('小數逗號 62,5 → 62.5', () => {
    const x = parseStrong(parseCsv(`${STRONG_HEADER}
2026-10-16 10:00:00,W,1m,Squat,1,"62,5",5,0,0,,,
`));
    expect(x.sets[0].weight).toBe(62.5);
    expect(x.skipped).toEqual([]);
  });
  it('無法解析的非空欄位 → 整列 skipped 並說明欄位', () => {
    const x = parseStrong(parseCsv(`${STRONG_HEADER}
2026-10-16 10:00:00,W,1m,Squat,1,abc,5,0,0,,,
2026-10-16 10:00:00,W,1m,Squat,1,"1,234,5",5,0,0,,,
`));
    expect(x.sets).toHaveLength(0);
    expect(x.skipped).toHaveLength(2);
    expect(x.skipped[0].reason).toMatch(/weight/);
  });
  it('Hevy 小數逗號', () => {
    const x = parseHevy(parseCsv(`${HEVY_HEADER}
"A","16 Oct 2026, 17:36","","",Squat,,,0,normal,"62,5",5,,,
`));
    expect(x.sets[0].weight).toBe(62.5);
  });
});

describe('未閉合引號', () => {
  it('parseImport 回傳 unterminated_quote 警告，且前面的列照常解析', () => {
    const r = parseImport(`${STRONG_HEADER}
2026-10-16 10:00:00,W,1m,Squat,1,50,5,0,0,,,
2026-10-17 10:00:00,W,1m,"Bad,1,50,5,0,0,,,
2026-10-18 10:00:00,W,1m,Squat,1,50,5,0,0,,,
`);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0].code).toBe('unterminated_quote');
      expect(r.warnings[0].line).toBe(3);
      expect(r.sets.length).toBeGreaterThanOrEqual(1);
    }
  });
  it('正常檔案 warnings 為空', () => {
    const r = parseImport(HEVY_CSV);
    if (r.ok) expect(r.warnings).toEqual([]);
  });
});

describe('parseImport', () => {
  it('自動偵測 Hevy', () => {
    const r = parseImport(HEVY_CSV);
    expect(r).toMatchObject({ ok: true, format: 'hevy' });
    if (r.ok) expect(r.sets).toHaveLength(4);
  });
  it('BOM + Strong + opts', () => {
    const r = parseImport('﻿' + STRONG_CSV, { strongUnit: 'lb' });
    expect(r).toMatchObject({ ok: true, format: 'strong' });
    if (r.ok) expect(r.sets[0].weightUnit).toBe('lb');
  });
  it('未知格式不丟例外', () => {
    expect(parseImport('x,y\n1,2\n')).toEqual({ ok: false, error: 'unknown_format' });
    expect(parseImport('')).toEqual({ ok: false, error: 'unknown_format' });
  });
});
