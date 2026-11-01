import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingTypes } from '@luxalgo/vela/plugin';
import { drawingGroups, drawingCatalog, defaultDrawingTools, readDrawingTools, groupTool, clampToolbarPosition } from './drawing-catalog.ts';

test('grouped catalog exposes every registered drawing exactly once, with engine icons', () => {
  const tools = drawingGroups.flatMap(group => group.tools);
  assert.deepEqual(new Set(tools.map(tool => tool.type)), new Set(drawingTypes().map(tool => tool.type)));
  assert.equal(tools.length, drawingCatalog.size);
  for (const tool of tools) { assert.ok(tool.label); assert.match(tool.icon, /<svg/); }
  for (const group of drawingGroups) assert.deepEqual(new Set(group.sections.flatMap(section => section.tools.map(tool => tool.type))), new Set(group.tools.map(tool => tool.type)));
});
test('favorites preserve insertion order, drop unknown entries and cannot duplicate', () => {
  const restored = readDrawingTools({ favorites: ['ray', 'hline', 'ray', 'not-a-tool', 1], visible: false });
  assert.deepEqual(restored.favorites, ['ray', 'hline']);
  assert.equal(restored.visible, false);
});
test('a group recalls only a tool belonging to that group', () => {
  const group = drawingGroups[0];
  const restored = readDrawingTools({ lastUsed: { [group.id]: 'ray', text: 'ray', missing: 'text' } });
  assert.equal(groupTool(group, restored).type, 'ray');
  assert.deepEqual(restored.lastUsed, { [group.id]: 'ray' });
  assert.equal(groupTool(group, defaultDrawingTools()).type, group.tools[0].type);
});
test('malformed settings and out-of-bounds positions restore safely', () => {
  for (const value of [null, undefined, 'bad']) assert.deepEqual(readDrawingTools(value), defaultDrawingTools());
  assert.deepEqual(readDrawingTools({ position: { x: -10, y: 99 } }).position, { x: 0, y: 1 });
  assert.deepEqual(readDrawingTools({ position: { x: NaN, y: Infinity } }).position, defaultDrawingTools().position);
});
test('favorites bar remains inside the chart after resize and with many tools', () => {
  for (const [width, height, barWidth] of [[1000, 700, 200], [350, 250, 334], [600, 350, 584]]) {
    for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
      const position = clampToolbarPosition(x, y, width, height, barWidth, 34);
      assert.ok(position.left >= 8 && position.left + barWidth <= width - 8);
      assert.ok(position.top >= 8 && position.top + 34 <= height - 8);
    }
  }
});
