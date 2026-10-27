import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRpc, useRealtime } from '@get-bb/plugin-sdk/app';
import type { TaskboardRpcContract, WorkItem } from './contract.js';
import { classifyStage, DEFAULT_STAGE_COLUMNS, stageColumnsSchema, stageLabels, stageLaneKey,
  type StageColumn, type StageProfile } from './github-stages.ts';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';

export const StageProfileContext = createContext<StageProfile | null>(null);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const DRAG_TYPE = 'application/x-bb-github-stage';

export function useStageProfile(projectId: string | null, enabled = true) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [profile, setProfile] = useState<StageProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const reload = useCallback(async () => {
    const request = ++revision.current;
    if (!projectId || !enabled) { setProfile(null); setError(null); return; }
    try {
      const result = await rpc.call('getStageProfile', { projectId });
      if (request === revision.current) { setProfile(result.profile); setError(null); }
    } catch (e) { if (request === revision.current) setError(errorText(e)); }
  }, [rpc, projectId, enabled]);
  useEffect(() => {
    setProfile(null); void reload();
    return () => { revision.current += 1; };
  }, [reload]);
  useRealtime('taskboard:changed', (payload: unknown) => {
    if (payload && typeof payload === 'object' && 'projectId' in payload && payload.projectId === projectId) void reload();
  });
  return { profile: profile?.projectId === projectId ? profile : null, error, reload };
}

export function IssueStageControl({ item, profile: supplied, onChanged }: {
  item: WorkItem; profile?: StageProfile | null; onChanged?: (item: WorkItem) => void;
}) {
  const inherited = useContext(StageProfileContext);
  const profile = supplied === undefined ? inherited : supplied;
  const rpc = useRpc<TaskboardRpcContract>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (item.source !== 'github' || !profile?.columns.length || profile.projectId !== item.bbProjectId) return null;
  const stage = classifyStage(item.labels, profile.columns);
  return <span className="inline-flex max-w-full flex-col gap-1" onClick={e => e.stopPropagation()}>
    <select aria-label={`Этап ${item.key}`} value={stage.label ?? ''} disabled={pending}
      title={stage.reason ?? 'Этап независим от Open/Closed'}
      className="tb-field max-w-full rounded border bg-background px-1.5 py-1 text-xs"
      onChange={async event => {
        const label = event.target.value;
        if (!label || pending) return;
        setPending(true); setError(null);
        try {
          const result = await rpc.call('updateItemStage', { projectId: item.bbProjectId, locator: item.locator,
            label, expectedStageLabels: stageLabels(item.labels), profileRevision: profile.revision });
          onChanged?.(result.item);
        } catch (e) { setError(errorText(e)); }
        finally { setPending(false); }
      }}>
      <option value="" disabled>{stage.name}</option>
      {profile.columns.map(column => <option key={column.label} value={column.label}>{column.name}</option>)}
    </select>
    {pending && <span role="status" className="text-xs text-muted-foreground">Сохраняем этап…</span>}
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
  </span>;
}

export function StageKanbanBoard({ profile, items, onOpen, onChanged, onRefresh, lastSyncedAt, syncError }: {
  profile: StageProfile; items: readonly WorkItem[]; onOpen: (item: WorkItem) => void;
  onChanged: (item: WorkItem) => void; onRefresh: () => Promise<void>;
  lastSyncedAt: string | null; syncError: string | null;
}) {
  const rpc = useRpc<TaskboardRpcContract>();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const groups = [
    ...profile.columns.map(c => ({ key: c.label, name: c.name, target: c.label as string | null })),
    { key: '__unassigned__', name: 'Без этапа', target: null },
    { key: '__invalid__', name: 'Требует настройки', target: null }
  ];
  const move = async (locator: string, label: string, expected: string[], profileRevision: number) => {
    if (pending) return;
    setPending(locator); setError(null);
    try {
      const result = await rpc.call('updateItemStage', { projectId: profile.projectId, locator, label,
        expectedStageLabels: expected, profileRevision });
      if (alive.current) { onChanged(result.item); setAnnouncement(`Этап ${result.item.key}: ${result.stage.name}`); }
    } catch (e) { if (alive.current) setError(errorText(e)); }
    finally { if (alive.current) setPending(null); }
  };
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
      <span>Последняя синхронизация: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'ещё не выполнена'}</span>
      <Button size="sm" variant="ghost" disabled={refreshing} onClick={async () => {
        setRefreshing(true); setError(null);
        try { await onRefresh(); } catch (e) { if (alive.current) setError(errorText(e)); }
        finally { if (alive.current) setRefreshing(false); }
      }}>{refreshing ? 'Обновляем…' : 'Обновить'}</Button>
    </div>
    {(error || syncError) && <p role="alert" className="border-b px-3 py-2 text-sm text-destructive">{error ?? syncError} Данные могут быть устаревшими.</p>}
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    <div className="grid min-h-0 flex-1 auto-cols-[minmax(240px,280px)] grid-flow-col gap-3 overflow-auto p-3">
      {groups.map(group => {
        const rows = items.filter(item => stageLaneKey(classifyStage(item.labels, profile.columns)) === group.key);
        if (group.target === null && rows.length === 0) return null;
        return <section key={group.key} aria-label={group.name}
          className="flex min-h-48 flex-col rounded-lg border bg-muted/20"
          onDragOver={e => { if (group.target && !pending && Array.from(e.dataTransfer.types).includes(DRAG_TYPE)) e.preventDefault(); }}
          onDrop={e => {
            if (!group.target || pending) return;
            const raw = e.dataTransfer.getData(DRAG_TYPE);
            if (!raw || raw.length > 4096) return;
            e.preventDefault();
            try {
              const data: unknown = JSON.parse(raw);
              if (!data || typeof data !== 'object' || !('projectId' in data) || data.projectId !== profile.projectId ||
                !('locator' in data) || typeof data.locator !== 'string' || !items.some(i => i.locator === data.locator && i.bbProjectId === profile.projectId) ||
                !('labels' in data) || !Array.isArray(data.labels) || !data.labels.every(l => typeof l === 'string') ||
                !('revision' in data) || typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision)) return;
              void move(data.locator, group.target, data.labels, data.revision);
            } catch { setError('Не удалось прочитать перенос карточки'); }
          }}>
          <header className="flex items-center justify-between border-b px-3 py-2 text-sm font-medium">
            <span>{group.name}</span><span className="text-xs tabular-nums text-muted-foreground">{rows.length}</span>
          </header>
          <div className="flex flex-1 flex-col gap-2 p-2">
            {rows.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Нет задач</p>}
            {rows.map(item => {
              const stage = classifyStage(item.labels, profile.columns);
              return <article key={item.locator} aria-label={`${item.key}: ${item.title}`}
                aria-busy={pending === item.locator} draggable={!pending}
                onDragStart={e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ projectId: profile.projectId, locator: item.locator,
                    labels: stage.labels, revision: profile.revision }));
                }} className="tb-kanban-card space-y-2 rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{item.key}</span>
                  <span aria-label={`Состояние issue: ${item.status}`} className="rounded border px-1.5 py-0.5">{item.status}</span>
                </div>
                <button type="button" className="w-full text-left text-sm font-medium hover:underline" onClick={() => onOpen(item)}>{item.title}</button>
                {stage.reason && <p className="text-xs text-destructive">{stage.reason}: {stage.labels.join(', ')}</p>}
                <IssueStageControl item={item} profile={profile} onChanged={onChanged} />
                {pending === item.locator && <p role="status" className="text-xs">Сохраняем этап…</p>}
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  {item.assignee && <span className="mr-auto">{item.assignee}</span>}
                  {item.labels.filter(l => !l.toLowerCase().startsWith('stage:')).slice(0, 2).map(l => <span key={l} className="rounded bg-muted px-1.5 py-0.5">{l}</span>)}
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}
    </div>
  </div>;
}

export function GithubStageSettings({ projectId }: { projectId: string }) {
  const rpc = useRpc<TaskboardRpcContract>();
  const { profile, error: loadError, reload } = useStageProfile(projectId);
  const [columns, setColumns] = useState<StageColumn[]>([]);
  const [baseline, setBaseline] = useState<StageProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [transfer, setTransfer] = useState('');
  const [availability, setAvailability] = useState<Array<{ repository: string; label: string; exists: boolean }> | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (dirty && baseline && profile.revision !== baseline.revision) {
      setError('Профиль изменён в другом окне. Сохранение проверит версию; сначала обновите настройки.'); return;
    }
    if (!dirty) { setBaseline(profile); setColumns(profile.columns); }
  }, [profile?.revision, projectId, dirty]);
  const edit = (next: StageColumn[]) => { setColumns(next); setDirty(true); setMessage(''); setAvailability(null); };
  const inspect = async (createMissing: boolean) => {
    if (!baseline || dirty || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await rpc.call('stageLabelSetup', { projectId, profileRevision: baseline.revision, createMissing });
      setAvailability(result.labels);
      setMessage(result.labels.every(l => l.exists) ? 'Метки готовы. Issues не изменялись.' : 'Часть меток ещё не создана.');
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-lg border bg-card p-4">
    <h3 className="font-semibold">Этапы GitHub-канбана</h3>
    <p className="text-sm text-muted-foreground">Колонки задаются метками stage:*. Состояние issue Open/Closed изменяется отдельно. Пустой профиль сохраняет стандартный канбан.</p>
    {(error || loadError) && <p role="alert" className="text-sm text-destructive">{error ?? loadError}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {!profile ? <p>Загружаем настройки…</p> : <>
      <div className="space-y-2">
        {columns.map((column, index) => <div key={index} className="flex flex-wrap gap-2">
          <Input aria-label={`Название колонки ${index + 1}`} value={column.name} disabled={busy}
            onChange={e => edit(columns.map((c, i) => i === index ? { ...c, name: e.target.value } : c))} className="min-w-32 flex-1" />
          <Input aria-label={`Метка колонки ${index + 1}`} value={column.label} disabled={busy}
            onChange={e => edit(columns.map((c, i) => i === index ? { ...c, label: e.target.value } : c))} className="min-w-40 flex-1" />
          <Button variant="outline" size="sm" aria-label={`Поднять колонку ${index + 1}`} disabled={busy || index === 0} onClick={() => {
            const next = [...columns]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; edit(next);
          }}>↑</Button>
          <Button variant="outline" size="sm" disabled={busy} aria-label={`Удалить колонку ${index + 1}`} onClick={() => edit(columns.filter((_, i) => i !== index))}>×</Button>
        </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || columns.length >= 50} onClick={() => edit([...columns, { label: '', name: '' }])}>Добавить колонку</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => edit(DEFAULT_STAGE_COLUMNS.map(c => ({ ...c })))}>Пример этапов</Button>
        <Button size="sm" disabled={busy || !dirty || !baseline} onClick={async () => {
          if (!baseline) return;
          setBusy(true); setError(null);
          try {
            const next = stageColumnsSchema.parse(columns);
            const result = await rpc.call('saveStageProfile', { projectId, revision: baseline.revision, columns: next });
            setBaseline(result.profile); setColumns(result.profile.columns); setDirty(false); setAvailability(null);
            setMessage('Профиль сохранён. Метки и issues не изменялись.'); await reload();
          } catch (e) { setError(errorText(e)); }
          finally { setBusy(false); }
        }}>Сохранить этапы</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { setDirty(false); setError(null); void reload(); }}>Обновить настройки</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy || dirty || !columns.length} onClick={() => void inspect(false)}>Проверить метки</Button>
        {availability?.some(l => !l.exists) && <Button variant="outline" size="sm" disabled={busy || dirty} onClick={() => void inspect(true)}>Создать отсутствующие метки</Button>}
      </div>
      {availability && <ul className="text-xs text-muted-foreground">{availability.filter(l => !l.exists).map(l => <li key={`${l.repository}:${l.label}`}>{l.repository}: нет {l.label}</li>)}</ul>}
      <details className="space-y-2 text-sm"><summary>Импорт и экспорт профиля</summary>
        <textarea aria-label="Переносимый профиль этапов" className="tb-field min-h-24 w-full rounded border p-2 font-mono text-xs"
          value={transfer} onChange={e => setTransfer(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransfer(JSON.stringify(columns, null, 2))}>Экспортировать в поле</Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => {
            try { edit(stageColumnsSchema.parse(JSON.parse(transfer))); setError(null); }
            catch (e) { setError(errorText(e)); }
          }}>Импортировать черновик</Button>
        </div>
      </details>
    </>}
  </section>;
}
