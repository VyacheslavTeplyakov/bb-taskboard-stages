import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const { default: plugin } = await import('../server.ts');

test('registered plugin completes stage writes and label setup through its real mutation queue', { timeout: 8000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'stage-plugin-queue-'));
  const fixture = join(directory, 'issue.json');
  writeFileSync(fixture, JSON.stringify({ number: 7, title: 'Queue regression', state: 'closed',
    user: { login: 'fixture' }, labels: ['bug', 'stage:review'], assignees: [],
    html_url: 'https://github.com/fixture/queue/issues/7', body: '', updated_at: '2026-10-27T00:00:00Z' }));
  // A fail-closed subprocess transport: no credentials, network, or real gh.
  writeFileSync(join(directory, 'gh'), `#!${process.execPath}
const fs=require('node:fs');const file=${JSON.stringify(fixture)};
const args=process.argv.slice(2);const issue=JSON.parse(fs.readFileSync(file,'utf8'));
if(args[0]==='--version'||args[0]==='auth'){console.log('fixture');process.exit(0)}
const endpoint=args.find(a=>a.startsWith('repos/'));const method=args.includes('--method')?args[args.indexOf('--method')+1]:'GET';
let result;
if(endpoint==='repos/fixture/queue/issues/7') result=issue;
else if(endpoint==='repos/fixture/queue/issues/7/comments?per_page=100') result=[[]];
else if(endpoint?.startsWith('repos/fixture/queue/labels/')) result={name:decodeURIComponent(endpoint.split('/').pop())};
else if(endpoint==='repos/fixture/queue/issues/7/labels'&&method==='POST') {
 issue.labels.push(args.find(a=>a.startsWith('labels[]=' )).slice(9));result=issue.labels;
} else if(endpoint?.startsWith('repos/fixture/queue/issues/7/labels/')&&method==='DELETE') {
 issue.labels=issue.labels.filter(l=>l!==decodeURIComponent(endpoint.split('/').pop()));result=issue.labels;
} else {console.error('Denied fixture request',endpoint,method);process.exit(2)}
fs.writeFileSync(file,JSON.stringify(issue));console.log(JSON.stringify(result));
`, { mode: 0o700 });
  const oldPath = process.env.PATH;
  process.env.PATH = `${directory}:${oldPath ?? ''}`;
  const fake = createFakePluginHost({ pluginId: 'taskboard-stages', sdk: {
    projects: { list: async () => [{ id: 'proj_queue', name: 'Queue regression' }],
      get: async () => ({ gitRemoteUrl: 'https://github.com/fixture/queue.git', sources: [] }) },
    system: { config: async () => ({ primaryHostId: null }) }
  } });
  t.after(async () => { process.env.PATH = oldPath; await fake.harness.lifecycle.dispose(); rmSync(directory, { recursive: true }); });
  await plugin(fake.bb);
  const rpc = fake.harness.behavior.callRpc.bind(fake.harness.behavior) as (method: string, input: unknown) => Promise<any>;
  await rpc('saveStageProfile', { projectId: 'proj_queue', revision: 0, columns: [
    { label: 'stage:review', name: 'Review' }, { label: 'stage:done', name: 'Done' }
  ] });
  const result = await rpc('updateItemStage', { projectId: 'proj_queue', locator: 'fixture/queue#7',
    label: 'stage:done', expectedStageLabels: ['stage:review'], profileRevision: 1 });
  assert.equal(result.item.status, 'CLOSED');
  assert.deepEqual(result.item.labels, ['bug', 'stage:done']);
  assert.deepEqual(JSON.parse(readFileSync(fixture, 'utf8')).labels, ['bug', 'stage:done']);
  const setup = await rpc('stageLabelSetup', { projectId: 'proj_queue', profileRevision: 1, createMissing: true });
  assert.ok(setup.labels.every((label: { exists: boolean }) => label.exists));
});
