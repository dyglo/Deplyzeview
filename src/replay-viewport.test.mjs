import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReplayViewport, sanitizeBarSpacing, timeframeDurationMs } from './replay-viewport.mjs';

test('timeframe duration maps supported chart intervals', () => {
  assert.equal(timeframeDurationMs('5'), 5 * 60 * 1000);
  assert.equal(timeframeDurationMs('15'), 15 * 60 * 1000);
  assert.equal(timeframeDurationMs('60'), 60 * 60 * 1000);
  assert.equal(timeframeDurationMs('240'), 240 * 60 * 1000);
  assert.equal(timeframeDurationMs('1H'), 60 * 60 * 1000);
  assert.equal(timeframeDurationMs('1D'), 24 * 60 * 60 * 1000);
});

test('replay viewport preserves zoom span and caps future whitespace', () => {
  const hour = 60 * 60 * 1000;
  const cursor = Date.UTC(2026, 0, 2, 12);
  const previous = { from: cursor - 20 * hour, to: cursor + 12 * hour };
  const next = normalizeReplayViewport(previous, cursor, '60', '15');
  assert.deepEqual(next, { from: cursor - 7.5 * hour, to: cursor + 0.5 * hour });
});

test('replay viewport shifts a future-only window back to the cursor', () => {
  const cursor = Date.UTC(2026, 0, 2);
  const previous = { from: cursor + 4 * 60 * 60 * 1000, to: cursor + 8 * 60 * 60 * 1000 };
  const next = normalizeReplayViewport(previous, cursor, '60', '60');
  assert.equal(next.to, cursor + 2 * 60 * 60 * 1000);
  assert.equal(next.to - next.from, previous.to - previous.from);
});

test('non-replay viewport anchors at the right edge without projecting into the future', () => {
  const hour = 60 * 60 * 1000;
  const previous = { from: 0, to: 20 * hour };
  const toHourly = normalizeReplayViewport(previous, null, '15', '60');
  assert.deepEqual(toHourly, { from: -60 * hour, to: 20 * hour });
  const backTo15m = normalizeReplayViewport(toHourly, null, '60', '15');
  assert.deepEqual(backTo15m, previous);
  assert.equal(normalizeReplayViewport(null, 100, '15', '60'), null);
});

test('replay keeps the cursor visible and caps future whitespace at two bars', () => {
  const hour = 60 * 60 * 1000;
  const cursor = Date.UTC(2026, 0, 2, 12);
  const next = normalizeReplayViewport({ from: cursor - 2 * hour, to: cursor + hour }, cursor, '60', '15');
  assert.equal(next.to, cursor + 20 * 60 * 1000);
  assert.ok(next.from < cursor);
});

test('sanitizeBarSpacing preserves user zoom and recovers from extreme values', () => {
  assert.equal(sanitizeBarSpacing(8.5, 1200), 8.5);
  assert.equal(sanitizeBarSpacing(14, 1200), 14);
  assert.equal(sanitizeBarSpacing(1000, 1200), 10);
  assert.equal(sanitizeBarSpacing(0.5, 1200), 10);
  assert.equal(sanitizeBarSpacing(Number.NaN, 960), 8);
});
