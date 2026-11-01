import test from 'node:test';
import assert from 'node:assert/strict';
import { readPreferences, writePreferences, defaultExtras, preferenceKey } from './chart-preferences.ts';
import { chartStyles } from './chart-style-catalog.ts';

const storage = (value) => ({ getItem: () => value });
test('missing, corrupt, incompatible and inaccessible saved preferences are safe', () => {
  for (const value of [null, '{', 'null', '{}', '{"version":2,"config":{}}']) assert.equal(readPreferences(storage(value)), undefined);
  assert.equal(readPreferences({ getItem() { throw new Error('denied'); } }), undefined);
});
test('every supported style and appearance round-trips across restart', () => {
  for (const { id } of chartStyles) {
    let saved;
    const config = { version: 1, series: { style: id }, candles: { upColor: '#123456' }, grid: { vertLines: { visible: false } }, timeScale: { timezone: 'Africa/Nairobi' } };
    const extras = { ...defaultExtras, theme: 'dark', volume: { visible: false, upColor: '#123456', downColor: '#654321', heightPct: 35 }, crosshair: 'horizontal' };
    assert.equal(writePreferences({ setItem(key, value) { assert.equal(key, preferenceKey); saved = value; } }, config, extras), true);
    assert.deepEqual(readPreferences(storage(saved)), { version: 1, config, extras });
  }
});
test('unknown style and invalid extra values recover without discarding valid cosmetics', () => {
  const restored = readPreferences(storage(JSON.stringify({ version: 1, config: { series: { style: 'renko', spacing: 2 }, layout: { background: '#101114' } }, extras: { crosshair: 'bogus', volume: { visible: 'no', upColor: 'invalid', heightPct: 200 } } })));
  assert.equal(restored.config.series.style, 'candles');
  assert.equal(restored.config.series.spacing, 2);
  assert.equal(restored.config.layout.background, '#101114');
  assert.equal(restored.extras.crosshair, 'both');
  assert.equal(restored.extras.volume.heightPct, 50);
  assert.equal(restored.extras.volume.visible, true);
  assert.equal(restored.extras.volume.upColor, defaultExtras.volume.upColor);
});
test('storage write failure reports failure without interrupting live settings', () => {
  assert.equal(writePreferences({ setItem() { throw new Error('quota'); } }, {}, defaultExtras), false);
});
test('volume opacity survives a preference save and restart', () => {
  let saved;
  const extras = { ...defaultExtras, volume: { ...defaultExtras.volume, upColor: 'rgba(8, 153, 129, 0.35)', downColor: '#c16f6180' } };
  writePreferences({ setItem(key, value) { saved = value; } }, { series: { style: 'candles' } }, extras);
  assert.deepEqual(readPreferences(storage(saved)).extras, extras);
});
test('light and dark themes survive restart with chart customization intact', () => {
  for (const theme of ['light', 'dark']) {
    let saved;
    const config = { series: { style: 'line', spacing: 2 }, layout: { background: '#abcdef' }, timeScale: { timezone: 'Africa/Nairobi' } };
    const extras = { ...defaultExtras, theme };
    writePreferences({ setItem(key, value) { saved = value; } }, config, extras);
    assert.deepEqual(readPreferences(storage(saved)), { version: 1, config, extras });
  }
});
test('existing preferences without a theme retain the dark interface', () => {
  const restored = readPreferences(storage(JSON.stringify({ version: 1, config: { series: { style: 'candles' } }, extras: { theme: 'invalid' } })));
  assert.equal(restored.extras.theme, 'dark');
});
test('previous Light template paper canvas upgrades to white without changing other preferences', () => {
  const config = { series: { style: 'candles' }, layout: { background: '#f6f7f9', textColor: '#454850' }, grid: { vertLines: { visible: false } } };
  const restored = readPreferences(storage(JSON.stringify({ version: 1, config, extras: { ...defaultExtras, theme: 'light' } })));
  assert.deepEqual(restored.config, { ...config, layout: { ...config.layout, background: '#ffffff' } });
  const dark = readPreferences(storage(JSON.stringify({ version: 1, config, extras: defaultExtras })));
  assert.equal(dark.config.layout.background, '#f6f7f9');
});
test('renamed preference namespace restores existing installations and writes the new key', () => {
  const config = { series: { style: 'candles' }, layout: { background: '#123456' } };
  const old = JSON.stringify({ version: 1, config, extras: defaultExtras });
  const restored = readPreferences({ getItem(key) { return key === 'vela.workspace.chart.appearance.v1' ? old : null; } });
  assert.deepEqual(restored.config, config);
  let savedKey;
  writePreferences({ setItem(key) { savedKey = key; } }, restored.config, restored.extras);
  assert.equal(savedKey, 'deplyzeview.workspace.chart.appearance.v1');
});
test('drawing favorites, last-used tool and normalized bar position survive restart', () => {
  let saved;
  const extras = { ...defaultExtras, drawingTools: { favorites: ['ray', 'fibretracement'], visible: true, position: { x: .8, y: .3 }, lastUsed: { 'lines-channels-pitchforks': 'ray' } } };
  writePreferences({ setItem(key, value) { saved = value; } }, { series: { style: 'candles' } }, extras);
  assert.deepEqual(readPreferences(storage(saved)).extras, extras);
});
