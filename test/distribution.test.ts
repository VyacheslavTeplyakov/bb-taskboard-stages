import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { test } from 'node:test';

test('standalone candidate keeps upstream provenance and an independent plugin identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const upstream = JSON.parse(await readFile(new URL('../UPSTREAM.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'bb-plugin-taskboard-stages');
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, 'MIT');
  assert.equal(upstream.commit, '2dcad8a23bd06121b5c42faaf7ea0716f24b4915');
  assert.equal(upstream.tag, 'taskboard/v0.3.6');
  assert.ok(upstream.files['sources/github.ts']);
  await access(new URL('../LICENSE', import.meta.url));
  await access(new URL('../package-lock.json', import.meta.url));
  await access(new URL('../UPSTREAM-package-lock.json', import.meta.url));
  const server = await readFile(new URL('../server.ts', import.meta.url), 'utf8');
  const preparation = await readFile(new URL('../preparation/server.ts', import.meta.url), 'utf8');
  assert.match(server, /name: 'stageboard'/u);
  assert.match(server, /id: 'stageboard-work-item'/u);
  assert.match(preparation, /name: 'stageboard_prepare_start'/u);
  assert.match(preparation, /id: 'stageboard-preparation'/u);
  assert.doesNotMatch(server, /name: 'taskboard'/u);
});
