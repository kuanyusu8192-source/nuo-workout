/**
 * 進行中的今日訓練：動作卡＋組列、每組填完即存、全域休息計時、整場計時、PR 慶祝、今日紀錄、收操。
 *
 * 資料流：畫面上的 cards（本機狀態）是唯一的真相來源；每次輸入後把「存檔工作」排進一條序列（chain），
 * 工作執行時才讀最新的列，所以連續快速輸入不會重複新增，刪除與新增也不會互相搶。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAppState, useRepos } from '../../app/context';
import { Button, EmptyState, Icon, Modal, Sheet, useToast } from '../../components';
import type { Exercise, Session } from '../../data/types';
import { detectPr } from '../../domain/pr';
import { totalVolume } from '../../domain/strength';
import { ExerciseDetail } from '../exercises/ExerciseDetail';
import { ExercisePicker } from '../exercises/ExercisePicker';
import type { ExerciseDetailTab } from '../shared';
import { AddExerciseFlow } from './AddExerciseFlow';
import { CelebrationDialog, type CelebrationProps } from './CelebrationDialog';
import { ExerciseCard } from './ExerciseCard';
import { buildPrLabel, isBodyweight, isComplete, kindOf, toSetFields, type Values } from './model';
import { SummarySheet } from './SummarySheet';
import { formatClock, useElapsed, useRestTimer } from './timers';
import { UndoBar, type UndoItem } from './UndoBar';
import { blankRow, defaultRowCount, loadHints, makeCard, type CardState, type LoadedWorkout, type RowState } from './workout';
import './today.css';

export interface WorkoutBodyProps {
  session: Session;
  loaded: LoadedWorkout;
  /** 空訓練完成後 session 已刪除：只顯示已完成狀態，不能再記錄 */
  ghost: boolean;
  /** 完成訓練。empty＝沒有任何已存的組（不留紀錄）。 */
  onFinish(empty: boolean): Promise<void>;
  /** 完成之後想再練一場 */
  onAnother(): void;
}

type Picker = { mode: 'add' } | { mode: 'replace'; exerciseId: string } | null;
type Celebration = Omit<CelebrationProps, 'onContinue'>;

const GENERIC_COOLDOWN =
  '慢走 3 分鐘讓心率回穩，接著伸展這次練到的主要肌群，每個部位停留約 30 秒、不要彈震；結束後補充水分與蛋白質。';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function WorkoutBody({ session, loaded, ghost, onFinish, onAnother }: WorkoutBodyProps) {
  const repos = useRepos();
  const app = useAppState();
  const toast = useToast();
  const { settings, template } = loaded;
  const unit = settings.loadUnit;
  const done = session.endedAt !== undefined;
  const doneRef = useRef(done);
  doneRef.current = done;

  // ---------- 本機狀態（cardsRef 讓非同步工作讀到最新值） ----------
  const [cards, setCards] = useState<CardState[]>(loaded.cards);
  const cardsRef = useRef(cards);
  const commit = (next: CardState[]) => {
    cardsRef.current = next;
    setCards(next);
  };
  const [exMap, setExMap] = useState<Record<string, Exercise>>(loaded.exMap);
  const exMapRef = useRef(exMap);
  const nextSetIndex = useRef(loaded.nextSetIndex);
  const celebrated = useRef(new Set<string>());

  const [picker, setPicker] = useState<Picker>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; tab: ExerciseDetailTab } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cooldownOpen, setCooldownOpen] = useState(false);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [undo, setUndo] = useState<UndoItem | null>(null);
  const undoSeq = useRef(0);
  const [finishing, setFinishing] = useState(false);

  // ---------- 計時 ----------
  const notifyRestDone = () => {
    if (doneRef.current) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([200, 100, 200]);
    } catch {
      /* 裝置不支援震動就算了 */
    }
    toast.show('休息結束，準備下一組', { kind: 'success' });
  };
  const rest = useRestTimer({ defaultSec: settings.restDefaultSec, onDone: notifyRestDone });
  const restRef = useRef(rest);
  restRef.current = rest;
  const elapsed = useElapsed({ startedAt: session.startedAt, endedAt: session.endedAt });

  // ---------- 存檔序列 ----------
  const chain = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (job: () => Promise<void>): Promise<void> => {
    chain.current = chain.current.then(job).catch((e) => {
      toast.show(`儲存失敗：${errMsg(e)}`, { kind: 'error' });
    });
    return chain.current;
  };

  const findRow = (exerciseId: string, rowKey: string): RowState | undefined =>
    cardsRef.current.find((c) => c.exerciseId === exerciseId)?.rows.find((r) => r.key === rowKey);
  const patchRow = (exerciseId: string, rowKey: string, patch: Partial<RowState>) =>
    commit(
      cardsRef.current.map((c) =>
        c.exerciseId !== exerciseId ? c : { ...c, rows: c.rows.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)) },
      ),
    );

  /** 依目前這一列的內容：填完＝新增或更新；原本已存但現在不完整＝刪除 */
  async function persist(exerciseId: string, rowKey: string, silent = false): Promise<void> {
    const row = findRow(exerciseId, rowKey);
    const ex = exMapRef.current[exerciseId];
    if (!row || !ex || ghost) return;
    const complete = isComplete(ex.trackingType, row.v, isBodyweight(ex));
    if (!complete) {
      if (row.setId) {
        const id = row.setId;
        patchRow(exerciseId, rowKey, { setId: undefined });
        await repos.sets.remove(id);
        app.invalidate();
      }
      return;
    }
    const fields = toSetFields(kindOf(ex.trackingType), row.v, unit);
    if (row.setId) {
      await repos.sets.update(row.setId, fields);
      app.invalidate();
      return;
    }
    const saved = await repos.sets.add({
      sessionId: session.id,
      exerciseId,
      setIndex: nextSetIndex.current++,
      kind: kindOf(ex.trackingType),
      ...fields,
    });
    if (!findRow(exerciseId, rowKey)) {
      // 存檔期間這一列已被刪掉：把剛寫入的清掉，避免留下孤兒
      await repos.sets.remove(saved.id);
      return;
    }
    patchRow(exerciseId, rowKey, { setId: saved.id });
    app.invalidate();
    if (silent) return;
    if (ex.trackingType === 'strength' && !doneRef.current) restRef.current.start();
    await maybeCelebrate(exerciseId);
  }

  /** 該動作所有組都存好後，判定是否創下 PR */
  async function maybeCelebrate(exerciseId: string): Promise<void> {
    const card = cardsRef.current.find((c) => c.exerciseId === exerciseId);
    const ex = exMapRef.current[exerciseId];
    if (!card || !ex || ex.trackingType !== 'strength' || celebrated.current.has(exerciseId)) return;
    if (card.rows.length === 0 || !card.rows.every((r) => r.setId)) return;
    const ids = new Set(card.rows.map((r) => r.setId));
    const all = await repos.sets.listAllAsSetRecords();
    const current = all.filter((s) => ids.has(s.id));
    if (current.length === 0) return;
    const history = all.filter((s) => s.exerciseId === exerciseId && !ids.has(s.id) && s.date <= session.date);
    const res = detectPr(history, current, exerciseId);
    if (!res.isPr) return;
    celebrated.current.add(exerciseId);
    const after = totalVolume(all.filter((s) => s.kind === 'strength'));
    const before = Math.max(0, after - totalVolume(current));
    setCelebrations((q) => [
      ...q,
      {
        exerciseName: ex.name,
        kinds: res.kinds,
        newBestLabel: buildPrLabel(res.kinds, current, unit),
        totalVolumeBefore: before,
        totalVolumeAfter: after,
      },
    ]);
  }

  // ---------- 組列操作 ----------
  function setValue(exerciseId: string, rowKey: string, patch: Partial<Values>) {
    const row = findRow(exerciseId, rowKey);
    if (!row) return;
    patchRow(exerciseId, rowKey, { v: { ...row.v, ...patch } });
    void enqueue(() => persist(exerciseId, rowKey));
  }

  function addRow(exerciseId: string) {
    commit(cardsRef.current.map((c) => (c.exerciseId === exerciseId ? { ...c, rows: [...c.rows, blankRow()] } : c)));
  }

  function showUndo(label: string, restore: () => void) {
    setUndo({ id: ++undoSeq.current, label, restore });
  }

  function restoreRow(exerciseId: string, index: number, row: RowState) {
    commit(
      cardsRef.current.map((c) => {
        if (c.exerciseId !== exerciseId) return c;
        const rows = [...c.rows];
        rows.splice(Math.min(index, rows.length), 0, { key: row.key, v: row.v });
        return { ...c, rows };
      }),
    );
    void enqueue(() => persist(exerciseId, row.key, true));
  }

  function removeRow(exerciseId: string, rowKey: string) {
    const card = cardsRef.current.find((c) => c.exerciseId === exerciseId);
    const ex = exMapRef.current[exerciseId];
    const index = card?.rows.findIndex((r) => r.key === rowKey) ?? -1;
    if (!card || !ex || index < 0) return;
    const row = card.rows[index];
    commit(cardsRef.current.map((c) => (c.exerciseId === exerciseId ? { ...c, rows: c.rows.filter((r) => r.key !== rowKey) } : c)));
    if (row.setId) {
      const id = row.setId;
      void enqueue(async () => {
        await repos.sets.remove(id);
        app.invalidate();
      });
    }
    const hadData = !!row.setId || Object.values(row.v).some((x) => x !== null);
    if (hadData) showUndo(`已刪除 ${ex.name} 第${index + 1}組`, () => restoreRow(exerciseId, index, row));
  }

  function removeLastRow(exerciseId: string) {
    const card = cardsRef.current.find((c) => c.exerciseId === exerciseId);
    const last = card?.rows[card.rows.length - 1];
    if (last) removeRow(exerciseId, last.key);
  }

  // ---------- 動作操作 ----------
  async function getExercise(id: string): Promise<Exercise | undefined> {
    const known = exMapRef.current[id];
    if (known) return known;
    const ex = await repos.exercises.get(id);
    if (ex) {
      exMapRef.current = { ...exMapRef.current, [id]: ex };
      setExMap(exMapRef.current);
    }
    return ex;
  }

  async function addExercise(id: string) {
    setPicker(null);
    setChosenId(null);
    if (cardsRef.current.some((c) => c.exerciseId === id)) {
      toast.show('這個動作已在今日訓練中');
      return;
    }
    const ex = await getExercise(id);
    if (!ex) {
      toast.show('找不到這個動作', { kind: 'error' });
      return;
    }
    const card = await makeCard(repos, ex, session, unit);
    if (cardsRef.current.some((c) => c.exerciseId === id)) return;
    commit([...cardsRef.current, card]);
  }

  async function replaceExercise(oldId: string, newId: string) {
    setPicker(null);
    if (oldId === newId) return;
    if (cardsRef.current.some((c) => c.exerciseId === newId)) {
      toast.show('這個動作已在今日訓練中');
      return;
    }
    const nx = await getExercise(newId);
    const ox = exMapRef.current[oldId];
    const old = cardsRef.current.find((c) => c.exerciseId === oldId);
    if (!nx || !ox || !old) return;
    const hints = await loadHints(repos, newId, session.id, unit);
    const savedIds = old.rows.flatMap((r) => (r.setId ? [r.setId] : []));
    let rows: RowState[];
    if (ox.trackingType === nx.trackingType) {
      rows = old.rows; // 同類型：數據沿用，已存的組改掛到新動作
      if (savedIds.length)
        void enqueue(async () => {
          for (const id of savedIds) await repos.sets.update(id, { exerciseId: newId });
          app.invalidate();
        });
    } else {
      rows = Array.from({ length: defaultRowCount(nx, undefined, hints) }, blankRow); // 類型不同：舊數據不適用，清掉
      if (savedIds.length)
        void enqueue(async () => {
          for (const id of savedIds) await repos.sets.remove(id);
          app.invalidate();
        });
    }
    celebrated.current.delete(oldId);
    commit(cardsRef.current.map((c) => (c.exerciseId === oldId ? { exerciseId: newId, rows, hints } : c)));
  }

  function removeExercise(exerciseId: string) {
    setMenuFor(null);
    const index = cardsRef.current.findIndex((c) => c.exerciseId === exerciseId);
    const card = cardsRef.current[index];
    const ex = exMapRef.current[exerciseId];
    if (!card || !ex) return;
    commit(cardsRef.current.filter((c) => c.exerciseId !== exerciseId));
    celebrated.current.delete(exerciseId);
    const savedIds = card.rows.flatMap((r) => (r.setId ? [r.setId] : []));
    if (savedIds.length)
      void enqueue(async () => {
        for (const id of savedIds) await repos.sets.remove(id);
        app.invalidate();
      });
    showUndo(`已刪除動作 ${ex.name}`, () => {
      if (cardsRef.current.some((c) => c.exerciseId === exerciseId)) return;
      const rows = card.rows.map((r) => ({ key: r.key, v: r.v }));
      const next = [...cardsRef.current];
      next.splice(Math.min(index, next.length), 0, { ...card, rows });
      commit(next);
      for (const r of rows) void enqueue(() => persist(exerciseId, r.key, true));
    });
  }

  // ---------- 完成訓練 ----------
  async function finish(): Promise<boolean> {
    if (done) return true;
    setFinishing(true);
    try {
      await chain.current; // 等所有存檔做完再判斷是不是空訓練
      const empty = !cardsRef.current.some((c) => c.rows.some((r) => r.setId));
      await onFinish(empty);
      return true;
    } catch (e) {
      toast.show(`無法完成訓練：${errMsg(e)}`, { kind: 'error' });
      return false;
    } finally {
      setFinishing(false);
    }
  }

  async function finishAndCooldown() {
    if (await finish()) setCooldownOpen(true);
  }

  // 已完成後休息計時沒有意義
  useEffect(() => {
    if (done && restRef.current.running) restRef.current.toggle();
  }, [done]);

  const closePicker = () => setPicker(null);
  const menuEx = menuFor ? exMap[menuFor] : undefined;
  const detailEx = detail ? exMap[detail.id] : undefined;
  const restLabel = rest.state.phase === 'running' ? '暫停休息計時' : rest.state.phase === 'paused' ? '繼續休息計時' : '開始休息計時';

  return (
    <div class="today-body">
      <div class="today-toolbar">
        <div class="today-elapsed">
          <Icon name="timer" size={22} />
          <span class="num today-elapsed__time" role="timer" aria-label="訓練經過時間">{formatClock(elapsed)}</span>
        </div>
        {!ghost ? <Button variant="ghost" onClick={() => setSummaryOpen(true)}>今日紀錄</Button> : null}
        <Button variant="ghost" onClick={done ? () => setCooldownOpen(true) : finishAndCooldown} loading={finishing}>
          {done ? '收操建議' : '結束 & 收操'}
        </Button>
      </div>

      {ghost ? (
        <EmptyState title="這場沒有記錄任何一組" description="空訓練不會留下紀錄。" />
      ) : cards.length === 0 ? (
        <EmptyState title="還沒有動作" description="按下方「新增動作」開始，每組填好重量與次數就會自動存檔。" />
      ) : (
        cards.map((card) => {
          const ex = exMap[card.exerciseId];
          if (!ex) return null;
          return (
            <ExerciseCard
              key={card.exerciseId}
              ex={ex}
              card={card}
              unit={unit}
              onChange={(rowKey, patch) => setValue(card.exerciseId, rowKey, patch)}
              onAddRow={() => addRow(card.exerciseId)}
              onRemoveLastRow={() => removeLastRow(card.exerciseId)}
              onTutorial={() => setDetail({ id: card.exerciseId, tab: 'tutorial' })}
              onHistory={() => setDetail({ id: card.exerciseId, tab: 'history' })}
              onMore={() => setMenuFor(card.exerciseId)}
            />
          );
        })
      )}

      <div class="today-dock">
        {!done ? (
          <div class="today-rest" role="group" aria-label="組間休息">
            <Button variant="ghost" aria-label="休息減 30 秒" onClick={() => rest.adjust(-30)}>−30</Button>
            <span class="today-rest__time num" role="timer" aria-label="組間休息剩餘時間" data-phase={rest.state.phase}>
              {formatClock(rest.remainingSec)}
            </span>
            <button type="button" class="nuo-iconbtn nuo-iconbtn--primary" aria-label={restLabel} title={restLabel} onClick={rest.toggle}>
              <Icon name={rest.running ? 'pause' : 'play'} />
            </button>
            <Button variant="ghost" aria-label="休息加 30 秒" onClick={() => rest.adjust(30)}>+30</Button>
          </div>
        ) : null}
        <div class="today-dock__actions">
          {done ? (
            <>
              <Button variant="success" class="today-done" disabled>
                <Icon name="check" size={20} />
                訓練完成
              </Button>
              <Button variant="ghost" onClick={onAnother}>再練一場</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPicker({ mode: 'add' })}>
                <Icon name="plus" size={20} />
                新增動作
              </Button>
              <Button variant="success" onClick={finish} loading={finishing}>完成訓練</Button>
            </>
          )}
        </div>
      </div>

      <UndoBar item={undo} onDismiss={() => setUndo(null)} />

      <Sheet open={picker !== null} title={picker?.mode === 'replace' ? '替換動作' : '新增動作'} onClose={closePicker}>
        <ExercisePicker
          mode="single"
          onSelect={(id) => (picker?.mode === 'replace' ? void replaceExercise(picker.exerciseId, id) : setChosenId(id))}
          onClose={closePicker}
        />
      </Sheet>
      {/* 新增動作：選好後先問「加入今日訓練／看教學」（替換動作維持直接替換） */}
      <AddExerciseFlow exerciseId={chosenId} onAdd={(id) => void addExercise(id)} onCancel={() => setChosenId(null)} />

      <Sheet open={menuEx !== undefined} title={menuEx?.name ?? ''} onClose={() => setMenuFor(null)}>
        <div class="today-menu">
          <Button
            variant="ghost"
            fullWidth
            onClick={() => {
              const id = menuFor!;
              setMenuFor(null);
              setPicker({ mode: 'replace', exerciseId: id });
            }}
          >
            替換動作
          </Button>
          <Button variant="danger" fullWidth onClick={() => removeExercise(menuFor!)}>
            <Icon name="trash-2" size={20} />
            刪除動作
          </Button>
        </div>
      </Sheet>

      <Sheet open={detail !== null && detailEx !== undefined} title={detailEx?.name ?? ''} onClose={() => setDetail(null)}>
        {detail ? <ExerciseDetail exerciseId={detail.id} initialTab={detail.tab} onClose={() => setDetail(null)} /> : null}
      </Sheet>

      <SummarySheet
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        date={session.date}
        session={session}
        settings={settings}
        cards={cards}
        exMap={exMap}
        unit={unit}
        onChangeRow={setValue}
        onRemoveRow={removeRow}
      />

      <Modal open={cooldownOpen} title="收操建議" onClose={() => setCooldownOpen(false)} actions={<Button variant="success" onClick={() => setCooldownOpen(false)}>完成</Button>}>
        <p class="today-cooldown">{template?.cooldownText?.trim() || GENERIC_COOLDOWN}</p>
      </Modal>

      {celebrations.length > 0 ? <CelebrationDialog {...celebrations[0]} onContinue={() => setCelebrations((q) => q.slice(1))} /> : null}
    </div>
  );
}
