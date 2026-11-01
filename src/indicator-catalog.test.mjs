import test from 'node:test';
import assert from 'node:assert/strict';
import { findIndicators, addCatalogIndicator } from './indicator-catalog.ts';
const catalog = [
  { type: 'sma', title: 'Simple Moving Average', supported: true, present: false, multiInstance: true },
  { type: 'ema', title: 'Exponential Moving Average', supported: true, present: false, multiInstance: true },
  { type: 'rsi', title: 'Relative Strength Index', supported: true, present: false, multiInstance: true },
  { type: 'volume', title: 'Volume', supported: true, present: true },
  { type: 'vpvr', title: 'Visible Range Volume Profile', supported: false, present: false },
];
test('search finds names, abbreviations, and all query words regardless of case', () => {
  assert.deepEqual(findIndicators(catalog, ' EMA ').map(item => item.type), ['ema']);
  assert.deepEqual(findIndicators(catalog, 'strength relative').map(item => item.type), ['rsi']);
  assert.deepEqual(findIndicators(catalog, 'moving avg').map(item => item.type), ['ema', 'sma']);
  assert.deepEqual(findIndicators(catalog, 'unknown'), []);
  assert.equal(findIndicators(catalog, '').length, catalog.length);
  assert.equal(catalog[0].type, 'sma'); // sorting never mutates the engine catalog
});
function fixture() {
  const handles = [];
  let id = 0;
  const chart = {
    indicators: () => handles,
    addNativeIndicator(type) {
      const handle = { id: `${++id}`, nativeType: type, visible: true, setVisible(value) { this.visible = value; } };
      handles.push(handle);
      return handle;
    },
  };
  return { chart, handles };
}
test('adding multiple moving averages preserves existing indicators', () => {
  const { chart, handles } = fixture();
  const volume = chart.addNativeIndicator('volume');
  const first = addCatalogIndicator(chart, catalog[0]);
  const second = addCatalogIndicator(chart, catalog[0]);
  assert.equal(first.added, true);
  assert.notEqual(first.handle.id, second.handle.id);
  assert.deepEqual(handles.map(handle => handle.nativeType), ['volume', 'sma', 'sma']);
  assert.equal(handles[0], volume);
});
test('single-instance indicators are reused and hidden indicators are shown', () => {
  const { chart, handles } = fixture();
  const first = addCatalogIndicator(chart, catalog[3]);
  first.handle.setVisible(false);
  const second = addCatalogIndicator(chart, catalog[3]);
  assert.equal(second.added, false);
  assert.equal(second.handle.visible, true);
  assert.equal(handles.length, 1);
  assert.equal(second.handle, first.handle);
});
test('unsupported indicators never reach the add API', () => {
  const { chart, handles } = fixture();
  assert.throws(() => addCatalogIndicator(chart, catalog[4]), /unavailable for this market/);
  assert.equal(handles.length, 0);
});
test('engine errors are propagated so the picker can display a failure', () => {
  const failure = new Error('Indicator initialization failed');
  assert.throws(() => addCatalogIndicator({ indicators: () => [], addNativeIndicator() { throw failure; } }, catalog[0]), failure);
});
