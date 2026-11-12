import test from 'node:test';
import assert from 'node:assert/strict';
import * as Vela from '@luxalgo/vela';
import {
  installDrawingEnhancements,
  setPositionToolPreferredDirection,
  getPositionToolPreferredDirection,
  resolveUserDrawings,
  hexToRgba,
} from './drawing-tv-style.ts';

function createMockProjector() {
  return {
    width: 800,
    height: 500,
    xOf: (time) => time / 10,
    yOf: (price) => 500 - price * 2,
    pxToPoint: (x, y) => ({
      time: x * 10,
      price: (500 - y) / 2,
    }),
    paneRect: () => ({ top: 0, height: 500 }),
  };
}

test('PositionTool respects Long vs Short preferred direction on placement and exposes 4 TradingView handles', () => {
  installDrawingEnhancements();
  const proj = createMockProjector();
  const posType = Vela.drawingTypes().find((t) => t.type === 'position');
  assert.ok(posType, 'position tool type exists');

  // 1. Long Position placement
  setPositionToolPreferredDirection('long');
  assert.equal(getPositionToolPreferredDirection(), 'long');
  const longPos = posType.create({
    paneId: 'price',
    anchors: [{ time: 1000, price: 100 }],
  });
  longPos.onPlaced(proj);
  assert.equal(longPos.anchors.length, 3);
  assert.ok(longPos.anchors[2].price > longPos.anchors[0].price, 'Long target price is above entry');
  assert.ok(longPos.anchors[1].price < longPos.anchors[0].price, 'Long stop price is below entry');

  // 2. Short Position placement
  setPositionToolPreferredDirection('short');
  assert.equal(getPositionToolPreferredDirection(), 'short');
  const shortPos = posType.create({
    paneId: 'price',
    anchors: [{ time: 1000, price: 100 }],
  });
  shortPos.onPlaced(proj);
  assert.equal(shortPos.anchors.length, 3);
  assert.ok(shortPos.anchors[2].price < shortPos.anchors[0].price, 'Short target price is below entry');
  assert.ok(shortPos.anchors[1].price > shortPos.anchors[0].price, 'Short stop price is above entry');

  // 3. 4 TradingView handles: 0=[x1, ey], 1=[x1, sy], 2=[x1, ty], 3=[x2, ey]
  const pts = shortPos.handlePoints(proj);
  assert.equal(pts.length, 4);
  const b = shortPos.box(proj);
  assert.deepEqual(pts[0], [b.x1, b.ey]);
  assert.deepEqual(pts[1], [b.x1, b.sy]);
  assert.deepEqual(pts[2], [b.x1, b.ty]);
  assert.deepEqual(pts[3], [b.x2, b.ey]);

  // 4. Independent 1D/2D handle dragging
  const orig = shortPos.anchors.map((a) => ({ ...a }));
  // Drag handle 1 (stop price only, preserves right-edge time)
  shortPos.dragHandle(1, { time: 9999, price: 145 }, orig);
  assert.equal(shortPos.anchors[1].price, 145);
  assert.equal(shortPos.anchors[1].time, orig[1].time);

  // Drag handle 2 (target price only, preserves right-edge time)
  shortPos.dragHandle(2, { time: 8888, price: 40 }, orig);
  assert.equal(shortPos.anchors[2].price, 40);
  assert.equal(shortPos.anchors[2].time, orig[2].time);

  // Drag handle 3 (width right-edge time only, preserves stop/target prices)
  const origAfterLevels = shortPos.anchors.map((a) => ({ ...a }));
  shortPos.dragHandle(3, { time: 4500, price: 999 }, origAfterLevels);
  assert.equal(shortPos.anchors[1].time, 4500);
  assert.equal(shortPos.anchors[2].time, 4500);
  assert.equal(shortPos.anchors[1].price, 145);
  assert.equal(shortPos.anchors[2].price, 40);
});

test('Box (Rectangle) exposes 8 TradingView handles (4 corners + 4 midpoints) and preserves custom properties', () => {
  installDrawingEnhancements();
  const proj = createMockProjector();
  const boxType = Vela.drawingTypes().find((t) => t.type === 'box');
  assert.ok(boxType, 'box tool type exists');

  const rect = boxType.create({
    paneId: 'price',
    anchors: [
      { time: 1000, price: 120 },
      { time: 3000, price: 80 },
    ],
  });

  const pts = rect.handlePoints(proj);
  assert.equal(pts.length, 8, 'Rectangle has 8 selection handles');

  // Drag top edge midpoint (handle 4) -> adjusts anchor 0 price only
  const orig = rect.anchors.map((a) => ({ ...a }));
  rect.dragHandle(4, { time: 5000, price: 150 }, orig);
  assert.equal(rect.anchors[0].price, 150);
  assert.equal(rect.anchors[0].time, 1000);
  assert.equal(rect.anchors[1].price, 80);
  assert.equal(rect.anchors[1].time, 3000);

  // Drag right edge midpoint (handle 5) -> adjusts anchor 1 time only
  const orig2 = rect.anchors.map((a) => ({ ...a }));
  rect.dragHandle(5, { time: 4200, price: 10 }, orig2);
  assert.equal(rect.anchors[1].time, 4200);
  assert.equal(rect.anchors[1].price, 80);

  // Serialization round-trip for extendLeft, extendRight, showMiddleLine, middleLineColor, showBackground
  rect.extendLeft = true;
  rect.extendRight = false;
  rect.showMiddleLine = true;
  rect.middleLineColor = '#ab47bc';
  rect.showBackground = false;

  const serialized = rect.serialize();
  assert.equal(serialized.props.extendLeft, true);
  assert.equal(serialized.props.extendRight, false);
  assert.equal(serialized.props.showMiddleLine, true);
  assert.equal(serialized.props.middleLineColor, '#ab47bc');
  assert.equal(serialized.props.showBackground, false);
});

test('resolveUserDrawings and hexToRgba work across chart structures and color formats', () => {
  const mockController = { painter: {}, interaction: {}, popup: {} };
  assert.equal(
    resolveUserDrawings({ rendererControl: { renderer: { userDrawings: mockController } } }),
    mockController
  );
  assert.equal(
    resolveUserDrawings({ orchestrator: { drawings: { port: mockController } } }),
    mockController
  );
  assert.equal(hexToRgba('#089981', 0.16), 'rgba(8, 153, 129, 0.16)');
  assert.equal(hexToRgba('#f00', 0.5), 'rgba(255, 0, 0, 0.5)');
});
