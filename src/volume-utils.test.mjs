import test from 'node:test';
import assert from 'node:assert/strict';
import { formatVolume, mergeObservedTradeVolume, shouldApplyTradeAfterSnapshot } from './volume-utils.mjs';

test('formats sub-unit crypto quantities without rounding them to zero', () => {
  assert.equal(formatVolume(0.02), '0.02');
  assert.equal(formatVolume(0.0004), '0.0004');
});

test('shows the sign of negative delta instead of hiding its direction', () => {
  assert.equal(formatVolume(-2.5), '−2.5');
  assert.equal(formatVolume(2.5), '2.5');
});

test('retains compact formatting for large quantities', () => {
  assert.equal(formatVolume(12_000), '12K');
  assert.equal(formatVolume(1_250_000), '1.3M');
});

test('adds exchange-traded live size to a known candle volume, including real zero', () => {
  assert.equal(mergeObservedTradeVolume(0, 0.25, 60_000, 120_000), 0.25);
  assert.equal(mergeObservedTradeVolume(1.5, 0.25, 60_000, 120_000), 1.75);
});

test('does not turn unknown historical volume into a fabricated zero or partial candle total', () => {
  assert.equal(mergeObservedTradeVolume(undefined, 0.25, 60_000, 120_000), undefined);
});

test('starts live volume only from the first full bar after subscription', () => {
  assert.equal(mergeObservedTradeVolume(undefined, 0.25, 120_000, 120_000), 0.25);
  assert.equal(mergeObservedTradeVolume(0.25, 0.5, 120_000, 120_000), 0.75);
});

test('does not re-add trades already covered by the last candle snapshot', () => {
  assert.equal(shouldApplyTradeAfterSnapshot(99_999, 100_000), false);
  assert.equal(shouldApplyTradeAfterSnapshot(100_000, 100_000), false);
  assert.equal(shouldApplyTradeAfterSnapshot(100_001, 100_000), true);
  assert.equal(shouldApplyTradeAfterSnapshot(99_999, 0), true);
});
