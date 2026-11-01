import test from 'node:test';
import assert from 'node:assert/strict';
import { rendererLayers } from '@luxalgo/vela/plugin';
import { setPriceAppearance } from './chart-styles.ts';

const colors = { upColor: '#00aa00', downColor: '#aa0000', bodyVisible: true, borderVisible: true, wickVisible: true, wickUpColor: '#00bb00', wickDownColor: '#bb0000', borderUpColor: '#00cc00', borderDownColor: '#cc0000' };
function render(style, bars, overrides = {}) {
  const operations = [];
  const ctx = { setTransform() {}, clearRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect(...args) { operations.push({ kind: 'fill', color: this.fillStyle, args }); }, strokeRect(...args) { operations.push({ kind: 'border', color: this.strokeStyle, args }); } };
  const layer = rendererLayers().find(layer => layer.id === 'vela-price-styles').create();
  layer.mount({ width: 800, height: 600, getContext: () => ctx });
  setPriceAppearance({ ...colors, ...overrides });
  layer.render({ priceStyle: style, bars, coords: { dpr: 1, width: 800, visibleLogicalRange: () => ({ from: 0, to: bars.length - 1 }), bodySpacing: () => 10, logicalToX: i => 20 + i * 10, priceToY: p => 300 - p }, scale: { log: false }, bounds: { top: 0, height: 600 } });
  return operations;
}
test('hollow candle fill and direction color are independent', () => {
  const bars = [{ open: 98, close: 100, high: 101, low: 97 }, { open: 105, close: 102, high: 106, low: 101 }, { open: 95, close: 99, high: 100, low: 94 }];
  const ops = render('hollow', bars);
  assert.equal(ops.filter(o => o.kind === 'fill').length, 1);
  assert.equal(ops.find(o => o.kind === 'fill').color, colors.upColor); // bearish body, rising close
  assert.deepEqual(ops.filter(o => o.kind === 'border').map(o => o.color), [colors.borderUpColor, colors.borderUpColor, colors.borderDownColor]);
  assert.deepEqual(render('hollow', bars, { bodyVisible: false, borderVisible: false, wickVisible: false }), []);
});
test('columns use actual close prices and keep input bars unchanged', () => {
  const bars = [{ open: 100, close: 105, high: 110, low: 98 }];
  const original = structuredClone(bars);
  const ops = render('columns', bars);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].args[3], 105);
  assert.deepEqual(bars, original);
  assert.deepEqual(render('line', bars), []);
});
