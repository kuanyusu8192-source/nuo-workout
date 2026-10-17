import { useEffect, useRef, useState } from 'preact/hooks';
import { useRepos } from '../../app/context';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { Repos } from '../../data/repos/interfaces';
import { buildHistoryExport, type HistoryExportInput, type HistoryRange } from '../../domain/historyExport';

const RANGE_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'last90', label: '最近 90 天' },
  { value: 'last30', label: '最近 30 天' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
export function historyFileName(now: Date): string {
  return `nuo-history-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 用現有 repo 方法組出完整歷史（不改 data 層）：sessions → 逐場取 sets。 */
export async function loadHistoryInput(repos: Repos): Promise<HistoryExportInput> {
  const [sessions, exercises, templates, bodyMetrics, meals, profile, settings, burnOverrides] = await Promise.all([
    repos.sessions.listByRange({}),
    repos.exercises.list(),
    repos.templates.list(),
    repos.bodyMetrics.list(),
    repos.meals.listByRange({}),
    repos.profile.get(),
    repos.settings.get(),
    repos.burnOverrides.listByRange({}),
  ]);
  const sets = (await Promise.all(sessions.map((s) => repos.sets.listBySession(s.id)))).flat();
  return { sessions, sets, exercises, templates, bodyMetrics, meals, profile: profile ?? null, settings, burnOverrides };
}

type Built = { json: string; sessionCount: number; empty: boolean };

export function HistoryExportSection() {
  const repos = useRepos();
  const linkUrl = useRef<string | undefined>(undefined);
  const [range, setRange] = useState<HistoryRange>('all');
  const [includeMeals, setIncludeMeals] = useState(true);
  const [includeBody, setIncludeBody] = useState(true);
  const [includeProfile, setIncludeProfile] = useState(true);
  const [busy, setBusy] = useState<'export' | 'copy' | null>(null);
  const [info, setInfo] = useState<string>();
  const [error, setError] = useState<string>();
  const [fallback, setFallback] = useState<string>();
  const [link, setLink] = useState<{ url: string; name: string }>();

  const revoke = () => {
    if (linkUrl.current) URL.revokeObjectURL?.(linkUrl.current);
    linkUrl.current = undefined;
  };
  useEffect(() => revoke, []);

  const build = async (): Promise<Built> => {
    const input = await loadHistoryInput(repos);
    const out = buildHistoryExport(input, { range, includeMeals, includeBody, includeProfile, now: new Date() });
    const empty = out.summary.sessionCount === 0 && !(out.nutrition?.length) && !(out.bodyMetrics?.length);
    return { json: JSON.stringify(out, null, 2), sessionCount: out.summary.sessionCount, empty };
  };

  const begin = (kind: 'export' | 'copy') => {
    setInfo(undefined);
    setError(undefined);
    setFallback(undefined);
    setLink(undefined);
    revoke();
    setBusy(kind);
  };

  const doExport = async () => {
    if (busy) return;
    begin('export');
    try {
      const built = await build();
      if (built.empty) {
        setInfo('目前沒有訓練紀錄，沒有可匯出的內容。');
        return;
      }
      const name = historyFileName(new Date());
      const file = new File([built.json], name, { type: 'application/json' });
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'NUO Fit 訓練紀錄' });
          setInfo(`已匯出 ${built.sessionCount} 場訓練：${name}`);
          return;
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return; // 使用者取消
          // 其他分享錯誤：改走下載
        }
      }
      const url = URL.createObjectURL(new Blob([built.json], { type: 'application/json' }));
      linkUrl.current = url;
      setLink({ url, name });
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setInfo(`已匯出 ${built.sessionCount} 場訓練：${name}`);
    } catch (e) {
      setError(`匯出失敗：${msgOf(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (busy) return;
    begin('copy');
    try {
      const built = await build();
      if (built.empty) {
        setInfo('目前沒有訓練紀錄，沒有可複製的內容。');
        return;
      }
      try {
        if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
        await navigator.clipboard.writeText(built.json);
        setInfo(`已複製 ${built.sessionCount} 場訓練的 JSON，可直接貼給 AI。`);
      } catch {
        setFallback(built.json);
        setInfo('無法自動複製，請在下方文字框長按全選後手動複製。');
      }
    } catch (e) {
      setError(`複製失敗：${msgOf(e)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="set-hx" aria-labelledby="set-hx-title">
      <h3 class="set-subtitle" id="set-hx-title">匯出訓練紀錄（給 AI 分析）</h3>
      <p class="set-note">整理好的 JSON，可備份，也能貼給 AI 請它分析與建議；不含姓名與 Email。</p>

      <div class="set-field">
        <p class="set-label">匯出範圍</p>
        <SegmentedControl label="匯出範圍" options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      <label class="set-switch">
        <span>含飲食</span>
        <input type="checkbox" checked={includeMeals} onChange={() => setIncludeMeals(!includeMeals)} />
      </label>
      <label class="set-switch">
        <span>含體重與體脂</span>
        <input type="checkbox" checked={includeBody} onChange={() => setIncludeBody(!includeBody)} />
      </label>
      <label class="set-switch">
        <span>含個人資料</span>
        <input type="checkbox" checked={includeProfile} onChange={() => setIncludeProfile(!includeProfile)} />
      </label>
      <p class="set-note">個人資料的「性別、年齡、身高、體重」只會出現在檔案裡，不會上傳到任何地方。</p>

      <div class="set-actions">
        <Button fullWidth loading={busy === 'export'} disabled={busy === 'copy'} onClick={doExport}>
          <Icon name="share-2" size={20} />匯出 JSON
        </Button>
        <Button fullWidth variant="ghost" loading={busy === 'copy'} disabled={busy === 'export'} onClick={doCopy}>
          複製到剪貼簿
        </Button>
      </div>

      {link ? (
        <p class="set-note">
          若沒有自動下載，請<a href={link.url} download={link.name}>下載訓練紀錄 {link.name}</a>。
        </p>
      ) : null}
      {info ? <p class="set-ok" role="status">{info}</p> : null}
      {error ? <p class="set-error" role="alert">{error}</p> : null}
      {fallback !== undefined ? (
        <label class="set-hx__box">
          <span class="set-label">JSON 內容（可手動全選複製）</span>
          <textarea
            class="set-hx__text"
            readOnly
            rows={8}
            value={fallback}
            onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()}
          />
        </label>
      ) : null}
    </section>
  );
}
