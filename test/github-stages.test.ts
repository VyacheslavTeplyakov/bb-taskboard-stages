import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyStage, stageColumnsSchema, stageLabels } from '../github-stages.ts';

const columns = [{ label: 'stage:review', name: 'Ревью' }, { label: 'stage:done', name: 'Завершено' }];
test('projects stage independently of native issue state', () => {
  for (const status of ['OPEN', 'CLOSED']) {
    const item = { status, labels: ['bug', 'stage:review'] };
    assert.equal(classifyStage(item.labels, columns).name, 'Ревью');
    assert.equal(item.status, status);
  }
});
test('keeps unassigned, unknown and conflicting stages visible without changing labels', () => {
  assert.equal(classifyStage(['bug'], columns).kind, 'unassigned');
  assert.equal(classifyStage(['stage:other'], columns).kind, 'invalid');
  const labels = ['stage:done', 'stage:review', 'customer'];
  assert.equal(classifyStage(labels, columns).kind, 'invalid');
  assert.deepEqual(labels, ['stage:done', 'stage:review', 'customer']);
  assert.deepEqual(stageLabels(['Bug', 'Stage:Review']), ['Stage:Review']);
  assert.equal(classifyStage(['Stage:Review'], columns).label, 'stage:review');
});
test('validates per-project column identity and keeps ordered custom titles', () => {
  assert.deepEqual(stageColumnsSchema.parse(columns), columns);
  assert.throws(() => stageColumnsSchema.parse([...columns, columns[0]]));
  assert.throws(() => stageColumnsSchema.parse([{ label: 'status:review', name: 'Review' }]));
  assert.deepEqual(stageColumnsSchema.parse([]), []);
});
