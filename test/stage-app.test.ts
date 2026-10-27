import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import type { WorkItem } from '../contract.js';
import type { StageProfile } from '../github-stages.ts';
import { createElement, act } from 'react';

let dom: JSDOM;
let directory: string;
let components: typeof import('../stage-app.js');
let render: typeof import('@get-bb/plugin-sdk/testing/app').renderSlot;
let fireEvent: typeof import('@testing-library/react').fireEvent;
let within: typeof import('@testing-library/react').within;
const profile: StageProfile = { projectId: 'proj_app', revision: 3,
  columns: [{ label: 'stage:review', name: 'Ревью' }, { label: 'stage:done', name: 'Завершено' }] };
const item: WorkItem = { bbProjectId: 'proj_app', source: 'github', locator: 'acme/app#7', key: '#7', title: 'Closed task',
  description: '', status: 'CLOSED', stateCategory: 'done', labels: ['bug', 'stage:review'], project: 'acme/app',
  url: 'https://github.com/acme/app/issues/7', assignee: 'owner', priority: null, updatedAt: '2026-10-27T00:00:00Z' };

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  dom.window.matchMedia = query => ({ matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver', 'getComputedStyle']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: Reflect.get(dom.window, key) });
  }
  directory = await mkdtemp(fileURLToPath(new URL('./.stage-ui-', import.meta.url)));
  await build({ entryPoints: [fileURLToPath(new URL('../stage-app.tsx', import.meta.url))],
    outfile: `${directory}/app.mjs`, bundle: true, packages: 'external', format: 'esm', platform: 'node', jsx: 'automatic' });
  components = await import(pathToFileURL(`${directory}/app.mjs`).href);
  ({ renderSlot: render } = await import('@get-bb/plugin-sdk/testing/app'));
  ({ fireEvent, within } = await import('@testing-library/react'));
});
after(async () => { dom?.window.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

test('closed issue is visible in its stage and a keyboard-accessible selection changes only the stage', async t => {
  const changed: WorkItem[] = [];
  const slot = render({ component: components.StageKanbanBoard }, { profile, items: [item], onOpen() {},
    onChanged: value => changed.push(value), onRefresh: async () => {}, lastSyncedAt: item.updatedAt, syncError: null }, {
    rpc: { updateItemStage: async () => ({ item: { ...item, labels: ['bug', 'stage:done'] },
      stage: { kind: 'assigned', label: 'stage:done', name: 'Завершено', labels: ['stage:done'], reason: null } }) }
  });
  t.after(() => slot.lifecycle.unmount());
  const lane = slot.getByRole('region', { name: 'Ревью' });
  assert.ok(within(lane).getByRole('article', { name: '#7: Closed task' }));
  assert.ok(slot.getByLabelText('Состояние issue: CLOSED'));
  fireEvent.change(slot.getByRole('combobox', { name: 'Этап #7' }), { target: { value: 'stage:done' } });
  await slot.findByRole('combobox', { name: 'Этап #7' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(changed.length, 1);
  assert.equal(changed[0]!.status, 'CLOSED');
  const call = slot.inspection.rpcCalls.find(c => c.method === 'updateItemStage');
  assert.deepEqual(call?.input, { projectId: 'proj_app', locator: 'acme/app#7', label: 'stage:done',
    expectedStageLabels: ['stage:review'], profileRevision: 3 });
  assert.ok(slot.inspection.rpcCalls.every(c => c.method !== 'updateItemStatus'));
});

test('drop uses a separate stage operation and a failed write keeps the card in its original lane', async t => {
  const changed: WorkItem[] = [];
  const slot = render({ component: components.StageKanbanBoard }, { profile, items: [item], onOpen() {},
    onChanged: value => changed.push(value), onRefresh: async () => {}, lastSyncedAt: null, syncError: null }, {
    rpc: { updateItemStage: async () => { throw new Error('Write denied'); } }
  });
  t.after(() => slot.lifecycle.unmount());
  const target = slot.getByRole('region', { name: 'Завершено' });
  fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify({ projectId: 'proj_app', locator: item.locator,
    labels: ['stage:review'], revision: 3 }) } });
  assert.match((await slot.findByRole('alert')).textContent!, /Write denied/);
  assert.deepEqual(changed, []);
  assert.ok(within(slot.getByRole('region', { name: 'Ревью' })).getByRole('article'));
  assert.equal(slot.inspection.rpcCalls.filter(c => c.method === 'updateItemStage').length, 1);
});

test('a drop from another project is ignored', async t => {
  const slot = render({ component: components.StageKanbanBoard }, { profile, items: [item], onOpen() {},
    onChanged() {}, onRefresh: async () => {}, lastSyncedAt: null, syncError: null });
  t.after(() => slot.lifecycle.unmount());
  fireEvent.drop(slot.getByRole('region', { name: 'Завершено' }), { dataTransfer: {
    getData: () => JSON.stringify({ projectId: 'proj_other', locator: item.locator, labels: [], revision: 3 })
  } });
  assert.equal(slot.inspection.rpcCalls.length, 0);
});

test('saving a profile preserves its revision contract and never creates labels implicitly', async t => {
  const slot = render({ component: components.GithubStageSettings }, { projectId: profile.projectId }, {
    rpc: {
      getStageProfile: async () => ({ profile }),
      saveStageProfile: async (input: any) => ({ profile: { ...input, revision: 4 } })
    }
  });
  t.after(() => slot.lifecycle.unmount());
  const name = await slot.findByRole('textbox', { name: 'Название колонки 1' });
  fireEvent.change(name, { target: { value: 'Проверка' } });
  fireEvent.click(slot.getByRole('button', { name: 'Сохранить этапы' }));
  await slot.findByText('Профиль сохранён. Метки и issues не изменялись.');
  const call = slot.inspection.rpcCalls.find(c => c.method === 'saveStageProfile');
  assert.equal((call?.input as any).columns[0].name, 'Проверка');
  assert.equal((call?.input as any).revision, 3);
  assert.ok(slot.inspection.rpcCalls.every(c => c.method !== 'stageLabelSetup' && c.method !== 'updateItemStage'));
});

test('a delayed profile response cannot replace the selected project after a scope switch', async t => {
  let resolveOld!: (value: { profile: StageProfile }) => void;
  const oldResponse = new Promise<{ profile: StageProfile }>(resolve => { resolveOld = resolve; });
  const other = { ...profile, projectId: 'proj_other' };
  function View({ projectId }: { projectId: string }) {
    const state = components.useStageProfile(projectId);
    return createElement('p', {}, state.profile?.projectId ?? 'loading');
  }
  const slot = render({ component: View }, { projectId: profile.projectId }, {
    rpc: { getStageProfile: async (input: any) => input.projectId === profile.projectId ? oldResponse : { profile: other } }
  });
  t.after(() => slot.lifecycle.unmount());
  slot.lifecycle.rerender(createElement(View, { projectId: other.projectId }));
  await slot.findByText(other.projectId);
  await act(async () => { resolveOld({ profile }); await oldResponse; });
  assert.ok(slot.getByText(other.projectId));
  assert.equal(slot.queryByText(profile.projectId), null);
});
