import test from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, colorWithOpacity, hsvToHex, hexToHsv } from './color-utils.ts';

test('parses palette colors and retains existing alpha without resetting opacity', () => {
  assert.deepEqual(parseColor('#089981'), { hex: '#089981', opacity: 100 });
  assert.deepEqual(parseColor('rgba(8, 153, 129, 0.35)'), { hex: '#089981', opacity: 35 });
  assert.deepEqual(parseColor('transparent'), { hex: '#000000', opacity: 0 });
  assert.equal(Math.round(parseColor('#08998180').opacity), 50);
});
test('opacity works at zero, intermediate values, and full opacity', () => {
  for (const percent of [0, 1, 35, 99, 100]) {
    const result = parseColor(colorWithOpacity('#089981', percent));
    assert.equal(result.hex, '#089981');
    assert.ok(Math.abs(result.opacity - percent) < .001);
  }
  assert.equal(colorWithOpacity('#089981', -1), 'rgba(8, 153, 129, 0)');
  assert.equal(colorWithOpacity('#089981', 101), '#089981');
});
test('malformed colors cannot enter persisted volume preferences', () => {
  for (const value of ['#badhex', 'rgba(300, 2, 3, 1)', 'rgba(2, 3, 4, 2)', 'url(example)', undefined]) assert.equal(parseColor(value), undefined);
});
test('custom spectrum reproduces exact RGB colors including grayscale and hue boundaries', () => {
  for (const hex of ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#089981', '#808080', '#ffffff', '#000000']) {
    const { hue, saturation, brightness } = hexToHsv(hex);
    assert.equal(hsvToHex(hue, saturation, brightness), hex);
  }
});
