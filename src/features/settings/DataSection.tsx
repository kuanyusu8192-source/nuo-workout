import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState } from '../../app/context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { HistoryExportSection } from './HistoryExportSection';
import { TABLE_LABELS, backupFileName, previewBackup, useBackupService, type BackupPreview } from './backupService';

interface PendingImport {
  json: string;
  fileName: string;
  preview: BackupPreview;
}

const pad = (n: number) => String(n).padStart(2, '0');
function formatTime(iso: string | null): string {
  if (!iso) return '未知';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('讀檔失敗'));
    r.readAsText(file);
  });
}

export function DataSection() {
  const service = useBackupService();
  const { invalidate } = useAppState();
  const fileRef = useRef<HTMLInputElement>(null);
  const linkUrl = useRef<string | undefined>(undefined);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [info, setInfo] = useState<string>();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<string>();
  const [link, setLink] = useState<{ url: string; name: string }>();
  const [pending, setPending] = useState<PendingImport>();

  const revoke = () => {
    if (linkUrl.current) URL.revokeObjectURL?.(linkUrl.current);
    linkUrl.current = undefined;
  };
  useEffect(() => revoke, []);

  const clearMessages = () => {
    setInfo(undefined);
    setError(undefined);
    setResult(undefined);
  };

  const doExport = async () => {
    if (exporting) return;
    clearMessages();
    setExporting(true);
    try {
      const json = await service.export();
      const name = backupFileName(new Date());
      const file = new File([json], name, { type: 'application/json' });
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
      if (typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: 'NUO Fit 備份' });
          setInfo(`已開啟分享：${name}`);
          return;
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return; // 使用者取消
          // 其他分享錯誤：改走下載
        }
      }
      revoke();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      linkUrl.current = url;
      setLink({ url, name });
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setInfo(`已匯出：${name}`);
    } catch (e) {
      setError(`匯出失敗：${msgOf(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const onPick = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    clearMessages();
    try {
      const json = await readText(file);
      setPending({ json, fileName: file.name, preview: previewBackup(json) });
    } catch (err) {
      setError(`無法讀取備份檔「${file.name}」：${msgOf(err)}。資料未變更。`);
    }
    try {
      input.value = ''; // 允許再次選同一個檔案
    } catch {
      /* 某些環境不允許設定 file input 的 value */
    }
  };

  const confirmImport = async () => {
    if (!pending || importing) return;
    setImporting(true);
    try {
      const counts = await service.import(pending.json);
      const parts = TABLE_LABELS.filter(([k]) => (counts[k] ?? 0) > 0).map(([k, label]) => `${label} ${counts[k]}`);
      setResult(`匯入完成${parts.length ? `：${parts.join('、')}` : ''}`);
      setPending(undefined);
      invalidate();
    } catch (err) {
      setPending(undefined);
      setError(`匯入失敗，資料未變更：${msgOf(err)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card title="資料">
      <p class="set-note">更新 App（adb install）之前，請先匯出一份備份。</p>
      <div class="set-actions">
        <Button fullWidth loading={exporting} onClick={doExport}>
          <Icon name="share-2" size={20} />匯出備份
        </Button>
        <Button fullWidth variant="ghost" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={20} />匯入備份
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" aria-label="選擇備份檔" hidden onChange={onPick} />

      {link ? (
        <p class="set-note">
          若沒有自動下載，請<a href={link.url} download={link.name}>下載備份檔 {link.name}</a>。
        </p>
      ) : null}
      {info ? <p class="set-ok" role="status">{info}</p> : null}
      {result ? <p class="set-ok" role="status" aria-label="匯入結果">{result}</p> : null}
      {error ? <p class="set-error" role="alert">{error}</p> : null}

      <HistoryExportSection />

      <h3 class="set-subtitle">匯入其他 App 的訓練紀錄</h3>
      <Button fullWidth variant="ghost" disabled>Hevy／Strong 匯入（即將推出）</Button>

      <Modal
        open={!!pending}
        title="匯入備份"
        role="alertdialog"
        onClose={() => !importing && setPending(undefined)}
        actions={
          <>
            <Button variant="ghost" disabled={importing} onClick={() => setPending(undefined)}>取消</Button>
            <Button variant="danger" loading={importing} onClick={confirmImport}>確認取代</Button>
          </>
        }
      >
        {pending ? (
          <>
            <p><strong>將取代目前所有資料</strong>，無法復原。匯入失敗時，目前的資料不會被更動。</p>
            <p class="set-note">檔案：{pending.fileName}</p>
            <p>備份時間：{formatTime(pending.preview.exportedAt)}</p>
            <ul class="set-counts">
              {pending.preview.counts.map((c) => (
                <li key={c.key}>
                  {c.label}：<span class="num">{c.count}</span> 筆
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Modal>
    </Card>
  );
}
