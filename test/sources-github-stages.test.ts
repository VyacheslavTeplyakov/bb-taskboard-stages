import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && specifier.endsWith('.js')) {
    const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
} });
const { createGithubAdapter } = await import('../sources/github.ts');
type Runner = import('../sources/github.ts').GithubCliRunner;

function fixture(options: { state?: 'open' | 'closed'; labels?: string[]; failDelete?: boolean;
  loseAddResponse?: boolean; concurrentOrdinary?: boolean; concurrentStage?: boolean; missingTarget?: boolean } = {}) {
  let issue = { number: 7, title: 'Task', state: options.state ?? 'open', user: { login: 'owner' },
    labels: options.labels ?? ['bug', 'stage:development'], assignees: [{ login: 'owner' }],
    html_url: 'https://github.com/acme/app/issues/7', body: 'Keep this description', updated_at: '2026-10-27T00:00:00Z' };
  const calls: string[][] = [];
  const runner: Runner = async args => {
    calls.push(args);
    if (args[0] === 'auth') return '';
    const endpoint = args.find(a => a.startsWith('repos/'))!;
    const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET';
    if (endpoint.includes('/comments?')) return '[[]]';
    if (endpoint.includes('/issues?')) {
      assert.ok(args.includes('--paginate') && args.includes('--slurp'));
      return endpoint.includes('state=open') ? JSON.stringify([[issue], [{ ...issue, number: 8 },
        { ...issue, number: 9, pull_request: {} }]]) : '[]';
    }
    if (endpoint === 'repos/acme/app/issues/7' && method === 'GET') return JSON.stringify(issue);
    if (endpoint.startsWith('repos/acme/app/labels/') && method === 'GET') {
      if (options.missingTarget) throw new Error('HTTP 404: label not found');
      return JSON.stringify({ name: decodeURIComponent(endpoint.split('/').at(-1)!) });
    }
    if (endpoint === 'repos/acme/app/labels' && method === 'POST') {
      const field = args.find(a => a.startsWith('name='))!;
      return JSON.stringify({ name: field.slice(5) });
    }
    if (endpoint.endsWith('/issues/7/labels') && method === 'POST') {
      if (options.concurrentOrdinary) issue.labels = [...issue.labels.filter(l => l !== 'bug'), 'urgent'];
      issue.labels = [...new Set([...issue.labels, args.find(a => a.startsWith('labels[]='))!.slice(9)])];
      if (options.concurrentStage) issue.labels.push('stage:release');
      if (options.loseAddResponse) throw new Error('Response lost');
      return JSON.stringify(issue.labels);
    }
    if (endpoint.includes('/issues/7/labels/') && method === 'DELETE') {
      if (options.failDelete) throw new Error('HTTP 403');
      issue.labels = issue.labels.filter(l => l !== decodeURIComponent(endpoint.split('/').at(-1)!));
      return JSON.stringify(issue.labels);
    }
    if (method === 'PATCH' && endpoint.endsWith('/issues/7')) {
      issue.state = args.find(a => a.startsWith('state='))!.slice(6) as 'open' | 'closed';
      return JSON.stringify(issue);
    }
    throw new Error(`Unexpected ${method} ${endpoint}`);
  };
  const adapter = createGithubAdapter({ enabled: true, repositories: ['acme/app'], runGithubCli: runner });
  return { adapter, calls, current: () => issue,
    writes: () => calls.filter(a => a.includes('--method')) };
}

for (const state of ['open', 'closed'] as const) {
  test(`stage move preserves ${state} and unrelated issue fields`, async () => {
    const f = fixture({ state });
    const result = await f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:development']);
    assert.equal(result.status, state.toUpperCase());
    assert.deepEqual(result.labels, ['bug', 'stage:review']);
    assert.equal(result.description, 'Keep this description');
    assert.equal(result.assignee, 'owner');
    assert.ok(f.writes().every(a => !a.some(v => v.startsWith('state='))));
  });
}
test('terminal stage does not close an open issue', async () => {
  const f = fixture();
  await f.adapter.updateStage!('acme/app#7', 'stage:done', ['stage:development']);
  assert.equal(f.current().state, 'open');
});
test('ordinary concurrent label additions and removals are preserved', async () => {
  const f = fixture({ concurrentOrdinary: true });
  const result = await f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:development']);
  assert.deepEqual(result.labels, ['urgent', 'stage:review']);
});
test('explicit move repairs multiple stage labels but never removes ordinary ones', async () => {
  const f = fixture({ labels: ['bug', 'stage:development', 'stage:other'] });
  const result = await f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:development', 'stage:other']);
  assert.deepEqual(result.labels, ['bug', 'stage:review']);
});
test('already current stage is an idempotent read', async () => {
  const f = fixture({ labels: ['bug', 'stage:review'] });
  await f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:review']);
  assert.deepEqual(f.writes(), []);
});
test('stale stage and foreign repository are rejected before writing', async () => {
  const f = fixture();
  await assert.rejects(f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:other']), /conflict/i);
  assert.deepEqual(f.writes(), []);
  const fresh = fixture();
  await assert.rejects(fresh.adapter.updateStage!('elsewhere/app#7', 'stage:review', []), /scope/);
  assert.deepEqual(fresh.calls, []);
});
test('missing target does not implicitly create labels or change an issue', async () => {
  const f = fixture({ missingTarget: true });
  await assert.rejects(f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:development']), /404/);
  assert.deepEqual(f.writes(), []);
});
for (const failure of [{ failDelete: true }, { loseAddResponse: true }, { concurrentStage: true }]) {
  test(`partial or uncertain update is never a successful receipt: ${JSON.stringify(failure)}`, async () => {
    const f = fixture(failure);
    await assert.rejects(f.adapter.updateStage!('acme/app#7', 'stage:review', ['stage:development']), /partial or uncertain/);
    assert.equal(f.current().state, 'open');
    assert.ok(f.current().labels.includes('bug'));
  });
}
test('native open/close operation preserves the stage', async () => {
  const f = fixture();
  const result = await f.adapter.updateStatus('acme/app#7', 'closed');
  assert.equal(result.status, 'CLOSED');
  assert.ok(result.labels.includes('stage:development'));
});
test('GitHub list includes later pages and excludes pull requests', async () => {
  const f = fixture();
  assert.deepEqual((await f.adapter.list()).map(i => i.locator), ['acme/app#7', 'acme/app#8']);
});
test('repository stage label setup writes only when explicitly requested', async () => {
  const f = fixture({ missingTarget: true });
  assert.equal((await f.adapter.stageLabelSetup!(['stage:review'], false))[0]!.exists, false);
  assert.deepEqual(f.writes(), []);
  assert.equal((await f.adapter.stageLabelSetup!(['stage:review'], true))[0]!.exists, true);
  assert.equal(f.writes().length, 1);
  assert.deepEqual(f.current().labels, ['bug', 'stage:development']);
});
