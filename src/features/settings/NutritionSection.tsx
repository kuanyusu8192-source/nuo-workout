import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepos } from '../../app/context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { NumberField } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import type { ProfileRow } from '../../data/types';
import { kcalFromMacros } from '../../domain/nutrition';
import type { Macros } from '../../domain/types';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { calcProfile } from '../onboarding/profile';

export function NutritionSection({ profile }: { profile: ProfileRow | undefined }) {
  const repos = useRepos();
  const { invalidate } = useAppState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const save = async (build: (p: Omit<ProfileRow, 'id'>) => Omit<ProfileRow, 'id'>, done: string): Promise<Omit<ProfileRow, 'id'> | undefined> => {
    if (!profile || busy) return undefined;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const { id: _id, ...rest } = profile;
      const built = build(rest);
      await repos.profile.save(built);
      invalidate();
      setMessage(done);
      return built;
    } catch (e) {
      setError(`儲存失敗：${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const saveMacros = (m: Macros) =>
    save((p) => ({ ...p, macros: m, kcalTarget: kcalFromMacros(m) }), '已儲存營養目標');

  const restore = async (): Promise<Macros | undefined> =>
    (
      await save((p) => {
        const c = calcProfile(p);
        return { ...p, tdee: c.tdee, kcalTarget: c.kcalTarget, macros: c.macros };
      }, '已恢復依 TDEE 計算')
    )?.macros;

  return (
    <Card title="營養">
      {profile ? (
        <>
          <p class="set-note" data-testid="nutrition-current">
            目前每日目標 {profile.kcalTarget} kcal（TDEE 約 {Math.round(profile.tdee)} kcal）
          </p>
          <MacroForm macros={profile.macros} busy={busy} onSave={saveMacros} onRestore={restore} />
        </>
      ) : (
        <p class="set-note">尚未建立個人資料。完成問卷後才能計算 TDEE 與每日營養目標。</p>
      )}

      {message ? <p class="set-ok" role="status">{message}</p> : null}
      {error ? <p class="set-error" role="alert">{error}</p> : null}

      <Button variant="ghost" fullWidth onClick={() => setSheetOpen(true)}>重新計算 TDEE</Button>

      <Sheet open={sheetOpen} title="重新計算 TDEE" onClose={() => setSheetOpen(false)}>
        <OnboardingFlow onDone={() => setSheetOpen(false)} />
      </Sheet>
    </Card>
  );
}

function MacroForm({ macros, busy, onSave, onRestore }: { macros: Macros; busy: boolean; onSave(m: Macros): void; onRestore(): Promise<Macros | undefined> }) {
  const [p, setP] = useState<number | null>(macros.proteinG);
  const [c, setC] = useState<number | null>(macros.carbG);
  const [f, setF] = useState<number | null>(macros.fatG);
  // 資料從外部變動（重算 TDEE、恢復依 TDEE 計算）時，以新值為準重填表單
  // （掛載時不重填，否則會蓋掉使用者已經開始輸入的值）
  const seen = useRef(macros);
  useEffect(() => {
    const prev = seen.current;
    seen.current = macros;
    if (prev.proteinG === macros.proteinG && prev.carbG === macros.carbG && prev.fatG === macros.fatG) return;
    setP(macros.proteinG);
    setC(macros.carbG);
    setF(macros.fatG);
  }, [macros]);
  const valid = p !== null && c !== null && f !== null;
  // 恢復後直接以結果填表（不等重新載入，避免快速操作時表單與資料不同步）
  const restoreAndFill = async () => {
    const m = await onRestore();
    if (m) {
      setP(m.proteinG);
      setC(m.carbG);
      setF(m.fatG);
    }
  };
  const kcal = valid ? kcalFromMacros({ proteinG: p, carbG: c, fatG: f }) : null;

  return (
    <div class="set-macros">
      <h3 class="set-subtitle">自訂每日營養目標</h3>
      <NumberField label="蛋白質" unit="g" value={p} onChange={setP} min={0} max={1000} decimal={false} required />
      <NumberField label="碳水" unit="g" value={c} onChange={setC} min={0} max={1000} decimal={false} required />
      <NumberField label="脂肪" unit="g" value={f} onChange={setF} min={0} max={1000} decimal={false} required />
      <output class="set-kcal" data-testid="macro-kcal" aria-label="換算熱量">
        熱量 <span class="num">{kcal ?? '—'}</span> kcal
        <span class="set-note">（蛋白質×4 ＋ 碳水×4 ＋ 脂肪×9，自動計算）</span>
      </output>
      <div class="set-actions">
        <Button variant="ghost" disabled={busy} onClick={restoreAndFill}>恢復依 TDEE 計算</Button>
        <Button disabled={!valid || busy} onClick={() => valid && onSave({ proteinG: p, carbG: c, fatG: f })}>儲存營養目標</Button>
      </div>
    </div>
  );
}
