import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runPineIndicator, withPineWorkerTimeout } from './pine/execution.ts';

test('Tauri production CSP permits the Pine Painter Blob worker', async () => {
  const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.match(config.app.security.csp, /worker-src\s+'self'\s+blob:/);
});

test('Pine execution timeout returns a visible failure and cleans up a late result', async () => {
  let finish;
  let lateCleanup = 0;
  const operation = new Promise(resolve => { finish = resolve; });
  const pending = withPineWorkerTimeout(operation, {
    timeoutMs: 5,
    message: 'Pine worker did not respond.',
    onLateSuccess: value => { assert.equal(value, 'late result'); lateCleanup++; },
  });

  await assert.rejects(pending, /Pine worker did not respond/);
  finish('late result');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lateCleanup, 1);
});

test('Pine execution timeout preserves successful results and worker errors', async () => {
  assert.equal(await withPineWorkerTimeout(Promise.resolve('complete'), { timeoutMs: 50 }), 'complete');
  await assert.rejects(
    withPineWorkerTimeout(Promise.reject(new Error('worker error')), { timeoutMs: 50 }),
    /worker error/,
  );
});

test('saved Pine indicators keep their IDs and use the registered pine language', async () => {
  const calls = [];
  const chart = {
    runIndicator: (source, options) => {
      calls.push({ source, options });
      return Promise.resolve({ ok: true, handle: { remove() {} }, error: null });
    },
    indicators: () => [],
  };

  await runPineIndicator(chart, '//@version=5\nindicator("Saved")\nplot(close)', 'pine:saved-123');
  assert.deepEqual(calls, [{
    source: '//@version=5\nindicator("Saved")\nplot(close)',
    options: { id: 'pine:saved-123', language: 'pine' },
  }]);
});

test('saved Pine add reports failures and removes a partial chart indicator', async () => {
  const removed = [];
  const chart = {
    runIndicator: async () => ({ ok: false, handle: null, error: new Error('worker rejected script') }),
    indicators: () => [{ id: 'pine:saved-123', remove: () => removed.push('pine:saved-123') }],
  };

  await assert.rejects(runPineIndicator(chart, 'invalid', 'pine:saved-123'), /worker rejected script/);
  assert.deepEqual(removed, ['pine:saved-123']);
});

test('saved Pine add times out visibly and removes the chart entry if it settles late', async () => {
  let resolveRun;
  const removed = [];
  let lateHandleRemoved = 0;
  const chart = {
    runIndicator: () => new Promise(resolve => { resolveRun = resolve; }),
    indicators: () => [{ id: 'pine:saved-123', remove: () => removed.push('pine:saved-123') }],
  };

  await assert.rejects(runPineIndicator(chart, 'valid', 'pine:saved-123', 5), /did not respond within 30 seconds/);
  assert.deepEqual(removed, ['pine:saved-123']);
  resolveRun({ ok: true, handle: { remove: () => { lateHandleRemoved++; } }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lateHandleRemoved, 1);
});
