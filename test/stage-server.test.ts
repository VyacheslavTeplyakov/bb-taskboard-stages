import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
} });
const { createStageFeature } = await import('../stage-server.ts');
const { createWorkItemStore } = await import('../store.ts');
const { stageRpcContract } = await import('../contract.ts');
type WorkItem = import('../contract.ts').WorkItem;
type Adapter = import('../sources/types.ts').WorkSourceAdapter;
const project = 'proj_alpha';
const columns = [{ label: 'stage:review', name: 'Ревью' }, { label: 'stage:done', name: 'Завершено' }];

function item(number = 7, projectId = project): WorkItem {
  return { bbProjectId: projectId, source: 'github', locator: `acme/app#${number}`, key: `acme/app#${number}`,
    title: 'Task', description: 'Keep me', status: 'CLOSED', stateCategory: 'done', labels: ['bug', 'stage:review'],
    url: `https://github.com/acme/app/issues/${number}`, project: 'acme/app', priority: null, assignee: 'owner',
    updatedAt: '2026-10-27T00:00:00Z' };
}
function setup() {
  const fake = createFakePluginHost({ pluginId: 'taskboard-stages' });
  const store = createWorkItemStore(fake.bb);
  const adapterCalls: string[] = [];
  let revision = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const adapter = {
    source: 'github', configured: () => true, configurationMessage: () => null,
    get: async (locator: string) => {
      adapterCalls.push('get');
      return { ...store.get(project, 'github', locator)!, comments: [] };
    },
    updateStage: async (locator: string, label: string) => {
      adapterCalls.push('updateStage');
      const current = store.get(project, 'github', locator)!;
      return { ...current, labels: [...current.labels.filter(l => !l.startsWith('stage:')), label], comments: [] };
    },
    updateStatus: async () => { throw new Error('Native state must not be written'); },
    stageLabelSetup: async (labels: string[], create: boolean) => {
      adapterCalls.push(create ? 'createLabels' : 'inspectLabels');
      return labels.map(label => ({ repository: 'acme/app', label, exists: create }));
    }
  } as unknown as Adapter;
  const feature = createStageFeature(fake.bb, {
    assertProject: async id => { if (![project, 'proj_beta'].includes(id)) throw new Error('Unknown project'); },
    assertGithub: id => { if (id === 'proj_beta') throw new Error('Selected source is Jira'); },
    adapter: async () => adapter,
    list: (projectId, limit, offset) => store.list({ projectId, source: 'github', limit, offset }),
    syncState: id => store.syncState(id, 'github'), revision: () => revision,
    persist: value => store.upsert(value),
    mutate: (_id, operation) => {
      const next = queue.then(() => { revision += 1; return operation(); });
      queue = next.catch(() => {}); return next;
    }
  });
  fake.bb.rpc.register(stageRpcContract, feature.handlers);
  const rpc = fake.harness.behavior.callRpc.bind(fake.harness.behavior) as <T = any>(method: string, input: unknown) => Promise<T>;
  return { ...fake, feature, store, adapterCalls, rpc };
}

test('profile setup is project-scoped, persisted and never creates labels', async t => {
  const f = setup(); t.after(() => f.harness.lifecycle.dispose());
  assert.deepEqual((await f.rpc('getStageProfile', { projectId: project })).profile.columns, []);
  const saved = await f.rpc('saveStageProfile', { projectId: project, revision: 0, columns });
  assert.equal(saved.profile.revision, 1);
  assert.deepEqual((await f.feature.profile(project)).columns, columns);
  assert.deepEqual((await f.rpc('getStageProfile', { projectId: 'proj_beta' })).profile.columns, []);
  assert.deepEqual(f.adapterCalls, []);
  await assert.rejects(f.rpc('saveStageProfile', { projectId: project, revision: 0, columns }), /changed/);
  await assert.rejects(f.rpc('saveStageProfile', { projectId: 'proj_beta', revision: 0, columns }), /Jira/);
  await assert.rejects(f.rpc('getStageProfile', { projectId: 'proj_unknown' }), /Unknown/);
});
test('board pagination includes closed issues and reports a changing snapshot', async t => {
  const f = setup(); t.after(() => f.harness.lifecycle.dispose());
  await f.rpc('saveStageProfile', { projectId: project, revision: 0, columns });
  for (let n = 1; n <= 520; n++) f.store.upsert(item(n));
  f.store.upsert(item(1, 'proj_beta'));
  const first = await f.rpc('listStageItems', { projectId: project, limit: 500 });
  assert.equal(first.items.length, 500); assert.equal(first.nextOffset, 500);
  assert.ok(first.items.every((r: any) => r.stage.name === 'Ревью' && r.item.status === 'CLOSED'));
  const second = await f.rpc('listStageItems', { projectId: project, offset: 500, limit: 500, expectedRevision: first.revision });
  assert.equal(second.items.length, 20); assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.items, ...second.items].map(r => r.item.locator)).size, 520);
  await f.rpc('saveStageProfile', { projectId: project, revision: 1, columns: columns.slice(0, 1) });
  await assert.rejects(f.rpc('listStageItems', { projectId: project, offset: 500, expectedRevision: first.revision }), /changed/);
});
test('stage write uses the shared handler and refreshes cache without changing native state', async t => {
  const f = setup(); t.after(() => f.harness.lifecycle.dispose());
  f.store.upsert(item());
  await f.rpc('saveStageProfile', { projectId: project, revision: 0, columns });
  const result = await f.rpc('updateItemStage', { projectId: project, locator: 'acme/app#7', label: 'stage:done',
    expectedStageLabels: ['stage:review'], profileRevision: 1 });
  assert.equal(result.item.status, 'CLOSED'); assert.equal(result.stage.name, 'Завершено');
  assert.deepEqual(f.store.get(project, 'github', 'acme/app#7')!.labels, ['bug', 'stage:done']);
  assert.ok(f.adapterCalls.includes('updateStage'));
  assert.ok(f.harness.inspection.realtimeSignals?.length || f.harness.realtimeSignals.length);
  await assert.rejects(f.rpc('updateItemStage', { projectId: project, locator: 'acme/app#7', label: 'stage:other',
    expectedStageLabels: [], profileRevision: 1 }), /not configured/);
  await assert.rejects(f.rpc('updateItemStage', { projectId: project, locator: 'acme/app#7', label: 'stage:done',
    expectedStageLabels: [], profileRevision: 0 }), /profile changed/);
});
test('label creation is a separate explicit operation', async t => {
  const f = setup(); t.after(() => f.harness.lifecycle.dispose());
  await f.rpc('saveStageProfile', { projectId: project, revision: 0, columns });
  await f.rpc('stageLabelSetup', { projectId: project, profileRevision: 1 });
  assert.deepEqual(f.adapterCalls, ['inspectLabels']);
  await f.rpc('stageLabelSetup', { projectId: project, profileRevision: 1, createMissing: true });
  assert.deepEqual(f.adapterCalls, ['inspectLabels', 'createLabels']);
});
