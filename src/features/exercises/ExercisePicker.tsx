/**
 * 契約（簽名不可改）：動作選擇。
 * - mode 'single'：點一個動作即呼叫 onSelect(id)。
 * - mode 'multi'：可複選，按「完成」呼叫 onDone(ids)。
 * - onClose：使用者取消／返回。
 * 呼叫端通常把它放在 <Sheet> 或全螢幕容器內；路由 `#/picker?mode=multi` 也會直接渲染它。
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useAppState, useRepoQuery, useRepos } from '../../app/context';
import { Button, EmptyState, Field, Icon, IconButton, Modal, Skeleton, Tabs } from '../../components';
import type { Exercise, ExerciseFilter, TrackingType } from '../../data/types';
import { equipmentLabel, type ExerciseCategory, type PickerMode } from '../shared';
import { Gif } from './Gif';
import { ALL_EQUIPMENT, EQUIPMENT_GROUPS, matchesEquipment, musclesFor, PICKER_CATEGORIES } from './pickerModel';
import { VirtualList } from './VirtualList';
import './exercises.css';

export interface ExercisePickerProps {
  mode: PickerMode;
  initialSelectedIds?: string[];
  onSelect?(id: string): void;
  onDone?(ids: string[]): void;
  onClose(): void;
}

const ROW_HEIGHT = 72;
const FAV = '__fav__';
const ALL = '__all__';

const trackingFor = (c: ExerciseCategory): TrackingType => (c === '有氧' ? 'cardio' : c === '伸展' ? 'stretch' : 'strength');

export function ExercisePicker({ mode, initialSelectedIds, onSelect, onDone, onClose }: ExercisePickerProps) {
  const repos = useRepos();
  const { invalidate } = useAppState();

  const [category, setCategory] = useState<ExerciseCategory>('胸');
  const [sub, setSub] = useState<string>(ALL);
  const [equip, setEquip] = useState<string | null>(null);
  const [rawQuery, setRawQuery] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(() => [...(initialSelectedIds ?? [])]);
  const [customOpen, setCustomOpen] = useState(false);

  // 搜尋去彈跳 200ms
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const searching = query !== '';
  const favView = !searching && sub === FAV;
  const filter: ExerciseFilter = searching
    ? { query } // 搜尋時跨所有分類
    : { category, favoriteOnly: favView || undefined };

  const list = useRepoQuery((r) => r.exercises.list(filter), [searching, query, category, favView]);
  const inCategory = useRepoQuery((r) => r.exercises.list({ category }), [category]);
  const favs = useRepoQuery((r) => r.exercises.list({ favoriteOnly: true }), []);

  const favIds = useMemo(() => new Set((favs.data ?? []).map((e) => e.id)), [favs.data]);
  const muscles = useMemo(() => musclesFor(category, inCategory.data ?? []), [category, inCategory.data]);
  const muscleActive = !searching && sub !== ALL && sub !== FAV ? sub : null;

  const items = useMemo(
    () => (list.data ?? []).filter((e) => matchesEquipment(e, equip) && (!muscleActive || e.primaryMuscle === muscleActive)),
    [list.data, equip, muscleActive],
  );

  const toggleFav = async (id: string) => {
    await repos.exercises.toggleFavorite(id);
    invalidate();
  };

  const choose = (id: string) => {
    if (mode === 'single') onSelect?.(id);
    else setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const pickCategory = (c: ExerciseCategory) => {
    setCategory(c);
    setSub(ALL);
  };

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const favEmpty = favView && !list.loading && items.length === 0;

  return (
    <div class="exp-picker">
      <header class="exp-head">
        <IconButton icon="chevron-left" label="返回" onClick={onClose} />
        <h1 class="exp-head__title">選擇動作</h1>
        {/* 手機實測：只有一個「+」圖示看不懂用途，所以改成帶文字的按鈕 */}
        <Button variant="ghost" onClick={() => setCustomOpen(true)}>
          <Icon name="plus" size={20} /> 新增自訂動作
        </Button>
      </header>

      <Field
        label="搜尋動作"
        type="search"
        value={rawQuery}
        onChange={setRawQuery}
        placeholder="例如：槓鈴臥推、bench press"
        autoComplete="off"
        // Field 會把多餘屬性展開到 <input>；告訴對話框別自動聚焦搜尋框（避免彈出鍵盤）
        {...({ 'data-autofocus': 'false' } as Record<string, string>)}
      />

      <div class="exp-chips" role="group" aria-label="器材篩選">
        <Chip label={ALL_EQUIPMENT} active={equip === null} onClick={() => setEquip(null)} />
        {EQUIPMENT_GROUPS.map((g) => (
          <Chip key={g.label} label={g.label} active={equip === g.label} onClick={() => setEquip(equip === g.label ? null : g.label)} />
        ))}
      </div>

      <Tabs label="肌群分類" tabs={PICKER_CATEGORIES.map((c) => ({ id: c, label: c }))} value={category} onChange={pickCategory}>
        {searching ? null : (
          <div class="exp-chips" role="group" aria-label="肌群細分">
            <Chip label={`全部${category}`} active={sub === ALL} onClick={() => setSub(ALL)} />
            <Chip label="最愛" active={sub === FAV} onClick={() => setSub(FAV)} />
            {muscles.map((m) => (
              <Chip key={m} label={m} active={sub === m} onClick={() => setSub(m)} />
            ))}
          </div>
        )}
        <p class="exp-count" data-testid="result-count" aria-live="polite">
          {searching ? `搜尋「${query}」：共 ${items.length} 個動作（所有分類）` : `共 ${items.length} 個動作`}
        </p>

        {list.loading && !list.data ? (
          <Skeleton height={56} lines={5} />
        ) : favEmpty ? (
          <EmptyState title="這個分類還沒有最愛" description="點動作右邊的星號收藏，或新增自己的動作。" icon="star" />
        ) : items.length === 0 ? (
          <EmptyState title="找不到符合的動作" description="換個關鍵字，或清除器材篩選。" />
        ) : (
          <VirtualList
            items={items}
            rowHeight={ROW_HEIGHT}
            testId="exercise-list"
            label="動作清單"
            resetKey={`${searching ? `q:${query}` : `${category}|${sub}`}|${equip}`}
            keyOf={(e) => e.id}
            renderRow={(e) => (
              <ExerciseRow e={e} multi={mode === 'multi'} picked={selectedSet.has(e.id)} isFav={favIds.has(e.id)} onChoose={choose} onToggleFav={toggleFav} />
            )}
          />
        )}
      </Tabs>

      {mode === 'multi' ? (
        // 固定在容器底部（Sheet 內以 sticky 貼著可捲動區底緣；路由內貼著視窗底緣），捲動時不會消失
        <div class="exp-donebar">
          <Button variant="success" aria-label={`完成 (${selected.length})`} onClick={() => onDone?.(selected)}>{`完成 (${selected.length})`}</Button>
        </div>
      ) : null}

      <CustomDialog
        open={customOpen}
        category={category}
        onClose={() => setCustomOpen(false)}
        onAdded={() => {
          setCustomOpen(false);
          setSub(ALL);
          invalidate();
        }}
      />
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick(): void }) {
  return (
    <button type="button" class={`exp-chip${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}

interface RowProps {
  e: Exercise;
  multi: boolean;
  picked: boolean;
  isFav: boolean;
  onChoose(id: string): void;
  onToggleFav(id: string): void;
}

function ExerciseRow({ e, multi, picked, isFav, onChoose, onToggleFav }: RowProps) {
  const sub = [equipmentLabel(e.equipment), e.primaryMuscle].filter(Boolean).join('・');
  return (
    <>
      <button
        type="button"
        class={`exp-card${picked ? ' is-picked' : ''}`}
        data-exercise-id={e.id}
        aria-pressed={multi ? picked : undefined}
        onClick={() => onChoose(e.id)}
      >
        <Gif file={e.gifFile} size="thumb" />
        <span class="exp-card__text">
          <span class="exp-card__name">{e.name}</span>
          <span class="exp-card__sub">{sub}</span>
        </span>
        {picked ? <Icon name="check" size={24} /> : null}
      </button>
      <IconButton
        icon="star"
        class={`exp-fav${isFav ? ' is-fav' : ''}`}
        label={isFav ? `取消收藏 ${e.name}` : `收藏 ${e.name}`}
        aria-pressed={isFav}
        onClick={() => onToggleFav(e.id)}
      />
    </>
  );
}

function CustomDialog({ open, category, onClose, onAdded }: { open: boolean; category: ExerciseCategory; onClose(): void; onAdded(): void }) {
  const repos = useRepos();
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName('');
      setTried(false);
    }
  }, [open]);

  const submit = async () => {
    setTried(true);
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await repos.exercises.addCustom({
        name: n,
        nameEn: '',
        category,
        equipment: '',
        primaryMuscle: '',
        secondaryMuscles: [],
        trackingType: trackingFor(category),
        steps: [],
        tips: '',
        gifFile: '',
      });
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新增自訂動作"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button loading={busy} onClick={submit}>確認</Button>
        </>
      }
    >
      <Field
        label="動作名稱"
        value={name}
        onChange={setName}
        maxLength={40}
        hint={`會加入「${category}」分類`}
        error={tried && !name.trim() ? '請輸入動作名稱' : undefined}
      />
    </Modal>
  );
}
