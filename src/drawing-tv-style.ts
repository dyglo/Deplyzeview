import * as Vela from '@luxalgo/vela';

/** Preferred initial direction when placing a Long/Short Position tool. */
let positionPreferredDirection: 'long' | 'short' = 'long';

export function setPositionToolPreferredDirection(dir: 'long' | 'short') {
  positionPreferredDirection = dir;
}

export function getPositionToolPreferredDirection(): 'long' | 'short' {
  return positionPreferredDirection;
}

// TradingView SVG Icons for Floating Toolbar & Settings Modal
const TV_ICONS = {
  grip: `<svg class="tv-grip-svg" width="8" height="14" viewBox="0 0 8 14" fill="currentColor"><circle cx="2" cy="2.5" r="1.2"/><circle cx="6" cy="2.5" r="1.2"/><circle cx="2" cy="7" r="1.2"/><circle cx="6" cy="7" r="1.2"/><circle cx="2" cy="11.5" r="1.2"/><circle cx="6" cy="11.5" r="1.2"/></svg>`,
  templates: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="6" width="6.5" height="6.5" rx="1"/><rect x="15.5" y="6" width="6.5" height="6.5" rx="1"/><rect x="6" y="15.5" width="6.5" height="6.5" rx="1"/><path d="M18.75 15v7.5M15 18.75h7.5" stroke-linecap="round"/></svg>`,
  pencil: `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12.9 2.6a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L6.2 14.3 2.5 15.5l1.2-3.7L12.9 2.6z"/><path d="M11.2 4.3l2.5 2.5"/></svg>`,
  bucket: `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"><path d="M7.5 3.2 14 9.7l-5.2 5.2a1.6 1.6 0 0 1-2.3 0L2.8 11.2a1.6 1.6 0 0 1 0-2.3L7.5 3.2z"/><path d="M5.5 1.8 8.5 4.8"/><path d="M15.2 12.2c.9 1.1 1.3 1.9 1.3 2.5a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.4 1.3-2.5z" fill="currentColor"/></svg>`,
  text: `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h10M4 4v2M14 4v2M9 4v10.5M6.8 14.5h4.4"/></svg>`,
  nut: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M14 5.2 21.6 9.6v8.8L14 22.8 6.4 18.4V9.6L14 5.2Z"/><circle cx="14" cy="14" r="3"/></svg>`,
  lock: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="7.5" y="12.5" width="13" height="9.5" rx="1.8"/><path d="M10.2 12.5V9.8a3.8 3.8 0 0 1 7.6 0v2.7"/><circle cx="14" cy="17.2" r="1.1" fill="currentColor"/></svg>`,
  unlock: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="7.5" y="12.5" width="13" height="9.5" rx="1.8"/><path d="M10.2 12.5V9.8a3.8 3.8 0 0 1 7.2-1.6" stroke-linecap="round"/><circle cx="14" cy="17.2" r="1.1" fill="currentColor"/></svg>`,
  trash: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8.5h15M11 8.5V6.8c0-.7.6-1.3 1.3-1.3h3.4c.7 0 1.3.6 1.3 1.3v1.7M8.5 8.5l1 13.2c.1.9.8 1.6 1.7 1.6h5.6c.9 0 1.6-.7 1.7-1.6l1-13.2"/></svg>`,
  more: `<svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="14" r="1.6"/><circle cx="14" cy="14" r="1.6"/><circle cx="20" cy="14" r="1.6"/></svg>`,
  reset: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`,
  editPencil: `<svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M12.9 2.6a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L6.2 14.3 2.5 15.5l1.2-3.7L12.9 2.6z"/><path d="M11.2 4.3l2.5 2.5"/></svg>`,
};

/**
 * Installs TradingView-grade enhancements for drawing handles, Position tool,
 * Rectangle tool, floating quick toolbar, and the drawing settings modal.
 */
export function installDrawingEnhancements(chart?: any) {
  enhancePositionTool();
  enhanceBoxTool();
  hookNativeRendererMount();

  const userDrawings = resolveUserDrawings(chart);
  if (userDrawings) {
    enhanceUserDrawingsController(userDrawings);
  }

  injectDrawingTvStyles();
}

/**
 * Resolves the internal UserDrawingController from a Vela chart instance or NativeRenderer.
 */
export function resolveUserDrawings(chartOrRenderer?: any): any {
  if (!chartOrRenderer) return null;
  return (
    chartOrRenderer.userDrawings ??
    chartOrRenderer.userDrawingsPort ??
    chartOrRenderer.rendererControl?.renderer?.userDrawings ??
    chartOrRenderer.rendererControl?.renderer?.userDrawingsPort ??
    chartOrRenderer.renderer?.renderer?.userDrawings ??
    chartOrRenderer.orchestrator?.drawings?.port ??
    chartOrRenderer.drawingsControl?.port ??
    chartOrRenderer.rendererPort?.userDrawingsPort ??
    null
  );
}

/**
 * Hooks Vela.NativeRenderer.prototype.mount so any newly created chart or multi-chart cell
 * automatically receives the enhanced drawing painter, interaction, popup, and modal.
 */
function hookNativeRendererMount() {
  const NR = (Vela as any).NativeRenderer;
  if (!NR?.prototype || NR.prototype._tvMountHooked) return;
  NR.prototype._tvMountHooked = true;

  const origMount = NR.prototype.mount;
  if (typeof origMount === 'function') {
    NR.prototype.mount = function (...args: any[]) {
      const res = origMount.apply(this, args);
      if (this.userDrawings) {
        enhanceUserDrawingsController(this.userDrawings);
      }
      return res;
    };
  }
}

export function enhanceUserDrawingsController(userDrawings: any) {
  if (!userDrawings) return;
  enhancePainter(userDrawings.painter);
  enhanceInteraction(userDrawings.interaction);
  if (userDrawings.popup) {
    enhancePopup(userDrawings.popup);
    if (userDrawings.popup.panel) {
      enhanceSettingsPanel(userDrawings.popup.panel);
    }
  }
}

/**
 * 1. ENHANCE POSITION TOOL (Long / Short Position)
 * - TradingView 4-handle geometry:
 *   0: [x1, ey] Entry (2D circle handle)
 *   1: [x1, sy] Stop (1D vertical square handle)
 *   2: [x1, ty] Target (1D vertical square handle)
 *   3: [x2, ey] Width (1D horizontal square handle)
 * - Direction-aware placement (Long vs Short from tool rail)
 * - Smooth, independent level and width dragging
 */
export function enhancePositionTool() {
  const type = Vela.drawingTypes().find((t: any) => t.type === 'position');
  if (!type?.create) return;

  const dummy = type.create({
    paneId: 'price',
    anchors: [
      { time: 1000, price: 100 },
      { time: 2000, price: 90 },
      { time: 2000, price: 120 },
    ],
  });
  const proto = Object.getPrototypeOf(dummy);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  // Enhance onPlaced to respect chosen Long vs Short tool intent
  proto.onPlaced = function (proj: any) {
    const e = this.anchors[0];
    if (!e) return;
    const ex = proj.xOf(e.time);
    const ey = proj.yOf(e.price, this.paneId);
    if (ey == null) return;

    const t = this.anchors[1];
    const ty = t ? proj.yOf(t.price, this.paneId) : null;
    const minDragPx = 6;
    const defaultRR = 2;
    const defaultRiskPx = 64;
    const defaultWidthPx = 160;
    const minWidthPx = 48;
    const isShortIntent = positionPreferredDirection === 'short';

    let targetPx: number;
    let endPx: number;

    if (t && ty != null && Math.abs(ty - ey) >= minDragPx) {
      targetPx = ty;
      endPx = ex + Math.max(Math.abs(proj.xOf(t.time) - ex), minWidthPx);
    } else {
      // Single-click placement defaults based on Long vs Short tool selection
      if (isShortIntent) {
        targetPx = ey + defaultRiskPx * defaultRR; // downward profit (lower price)
      } else {
        targetPx = ey - defaultRiskPx * defaultRR; // upward profit (higher price)
      }
      endPx = ex + defaultWidthPx;
    }

    const stopPx =
      isShortIntent && (!t || ty == null || Math.abs(ty - ey) < minDragPx)
        ? ey - defaultRiskPx // upward stop loss (higher price)
        : ey - (targetPx - ey) / defaultRR;

    const endTime = proj.pxToPoint(endPx, ey, this.paneId).time;
    const stopPrice = proj.pxToPoint(ex, stopPx, this.paneId).price;
    const targetPrice = proj.pxToPoint(ex, targetPx, this.paneId).price;

    this.anchors = [
      { time: e.time, price: e.price },
      { time: endTime, price: stopPrice },
      { time: endTime, price: targetPrice },
    ];
  };

  // Compute box directly from resolved() anchors so x1, x2, ey, sy, ty are always exact
  proto.box = function (proj: any) {
    const r = this.resolved();
    if (!r || r.length < 3) return null;
    const [e, s, t] = r;
    const ey = proj.yOf(e.price, this.paneId);
    const sy = proj.yOf(s.price, this.paneId);
    const ty = proj.yOf(t.price, this.paneId);
    if (ey == null || sy == null || ty == null) return null;
    const ex = proj.xOf(e.time);
    const sx = proj.xOf(s.time);
    const tx = proj.xOf(t.time);
    return {
      x1: Math.min(ex, sx, tx),
      x2: Math.max(ex, sx, tx),
      ey,
      sy,
      ty,
    };
  };

  proto.layout = function (proj: any) {
    return this.box(proj);
  };

  // Return TradingView's 4 handles:
  // 0: [x1, ey] Entry (circle)
  // 1: [x1, sy] Stop level (square)
  // 2: [x1, ty] Target level (square)
  // 3: [x2, ey] Width extent (square)
  proto.handlePoints = function (proj: any) {
    const b = this.box(proj);
    if (!b) return [];
    return [
      [b.x1, b.ey], // 0: Entry (left)
      [b.x1, b.sy], // 1: Stop level (left)
      [b.x1, b.ty], // 2: Target level (left)
      [b.x2, b.ey], // 3: Width extent (right)
    ];
  };

  proto.hitHandle = function (px: number, py: number, proj: any, tol: number) {
    const pts = this.handlePoints(proj);
    let best = -1;
    let distance = (tol ?? 6) + 5;
    pts.forEach(([x, y]: [number, number], i: number) => {
      const d = Math.hypot(px - x, py - y);
      if (d <= distance) {
        best = i;
        distance = d;
      }
    });
    return best;
  };

  // Custom precision handle dragging for all 4 handles
  proto.dragHandle = function (
    handleIndex: number,
    point: { time: number; price: number },
    orig: Array<{ time: number; price: number }>
  ) {
    const entry = this.anchors[0];
    const stop = this.anchors[1];
    const target = this.anchors[2];
    if (!entry || !stop || !target) return;

    if (handleIndex === 0) {
      // Entry handle: adjusts entry price and start time
      entry.time = point.time;
      entry.price = point.price;
      this.constrainHandleDrag(0);
    } else if (handleIndex === 1) {
      // Stop handle: 1D vertical adjustment of stop-loss price
      stop.price = point.price;
      if (orig?.[1]) stop.time = orig[1].time;
      if (orig?.[2]) target.time = orig[2].time;
      this.constrainHandleDrag(1);
    } else if (handleIndex === 2) {
      // Target handle: 1D vertical adjustment of take-profit price
      target.price = point.price;
      if (orig?.[1]) stop.time = orig[1].time;
      if (orig?.[2]) target.time = orig[2].time;
      this.constrainHandleDrag(2);
    } else if (handleIndex === 3) {
      // Width handle: 1D horizontal adjustment of right-edge time
      stop.time = point.time;
      target.time = point.time;
      if (orig?.[1]) stop.price = orig[1].price;
      if (orig?.[2]) target.price = orig[2].price;
    }
  };

  proto.constrainHandleDrag = function (index: number) {
    const entry = this.anchors[0];
    const stop = this.anchors[1];
    const target = this.anchors[2];
    if (!entry || !stop || !target) return;

    // Keep stop and target right-edge times synchronized
    if (index === 1) target.time = stop.time;
    else if (index === 2) stop.time = target.time;

    const stopSide = Math.sign(stop.price - entry.price);
    const targetSide = Math.sign(target.price - entry.price);
    if (stopSide === 0 || targetSide === 0 || stopSide !== targetSide) return;
    if (index === 2) stop.price = 2 * entry.price - stop.price;
    else target.price = 2 * entry.price - target.price;
  };
}

/**
 * 2. ENHANCE BOX (RECTANGLE) TOOL
 * - TradingView 8-handle geometry:
 *   0..3: 4 corner handles (Circles)
 *   4..7: 4 edge midpoint handles (Rounded Squares)
 * - Supports Extend (left/right/both), Middle Line, and Background visibility toggle
 */
export function enhanceBoxTool() {
  const type = Vela.drawingTypes().find((t: any) => t.type === 'box');
  if (!type?.create) return;

  const dummy = type.create({
    paneId: 'price',
    anchors: [
      { time: 1000, price: 100 },
      { time: 2000, price: 90 },
    ],
  });
  const proto = Object.getPrototypeOf(dummy);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  // 8 handles: 0=[x1,y1], 1=[x2,y2] (kept first for DrawingPainter compatibility),
  // 2=[x2,y1], 3=[x1,y2], 4=[midX,y1], 5=[x2,midY], 6=[midX,y2], 7=[x1,midY]
  proto.handlePoints = function (proj: any) {
    const r = this.rect(proj);
    if (!r) return [];
    const { x1, y1, x2, y2 } = r;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return [
      [x1, y1], // 0: corner 1 (circle)
      [x2, y2], // 1: corner 2 (circle)
      [x2, y1], // 2: corner 3 (circle)
      [x1, y2], // 3: corner 4 (circle)
      [midX, y1], // 4: top edge midpoint (square)
      [x2, midY], // 5: right edge midpoint (square)
      [midX, y2], // 6: bottom edge midpoint (square)
      [x1, midY], // 7: left edge midpoint (square)
    ];
  };

  proto.hitHandle = function (px: number, py: number, proj: any, tol: number) {
    const pts = this.handlePoints(proj);
    let best = -1;
    let distance = (tol ?? 6) + 5;
    pts.forEach(([x, y]: [number, number], i: number) => {
      const d = Math.hypot(px - x, py - y);
      if (d <= distance) {
        best = i;
        distance = d;
      }
    });
    return best;
  };

  proto.dragHandle = function (
    handleIndex: number,
    point: { time: number; price: number },
    orig: Array<{ time: number; price: number }>
  ) {
    const a = this.anchors[0];
    const b = this.anchors[1];
    if (!a || !b) return;
    if (orig?.[0] && orig?.[1]) {
      a.time = orig[0].time;
      a.price = orig[0].price;
      b.time = orig[1].time;
      b.price = orig[1].price;
    }

    switch (handleIndex) {
      case 0:
        a.time = point.time;
        a.price = point.price;
        break;
      case 1:
        b.time = point.time;
        b.price = point.price;
        break;
      case 2:
        b.time = point.time;
        a.price = point.price;
        break;
      case 3:
        a.time = point.time;
        b.price = point.price;
        break;
      case 4: // top edge (y1)
        a.price = point.price;
        break;
      case 5: // right edge (x2)
        b.time = point.time;
        break;
      case 6: // bottom edge (y2)
        b.price = point.price;
        break;
      case 7: // left edge (x1)
        a.time = point.time;
        break;
    }
  };

  // Preserve custom box props (extendLeft, extendRight, middleLine, showBackground)
  const origWriteProps = proto.writeProps;
  proto.writeProps = function () {
    const base = origWriteProps?.call(this) ?? {};
    return {
      ...base,
      ...(this.extendLeft !== undefined ? { extendLeft: this.extendLeft } : {}),
      ...(this.extendRight !== undefined ? { extendRight: this.extendRight } : {}),
      ...(this.showMiddleLine !== undefined ? { showMiddleLine: this.showMiddleLine } : {}),
      ...(this.middleLineColor !== undefined ? { middleLineColor: this.middleLineColor } : {}),
      ...(this.middleLineStyle !== undefined ? { middleLineStyle: this.middleLineStyle } : {}),
      ...(this.showBackground !== undefined ? { showBackground: this.showBackground } : {}),
    };
  };

  const origReadProps = proto.readProps;
  proto.readProps = function (props: Record<string, any>) {
    origReadProps?.call(this, props);
    if (!props) return;
    if (typeof props.extendLeft === 'boolean') this.extendLeft = props.extendLeft;
    if (typeof props.extendRight === 'boolean') this.extendRight = props.extendRight;
    if (typeof props.showMiddleLine === 'boolean') this.showMiddleLine = props.showMiddleLine;
    if (typeof props.middleLineColor === 'string') this.middleLineColor = props.middleLineColor;
    if (typeof props.middleLineStyle === 'string') this.middleLineStyle = props.middleLineStyle;
    if (typeof props.showBackground === 'boolean') this.showBackground = props.showBackground;
  };
}

/**
 * 3. ENHANCE DRAWING INTERACTION
 * - Routes multi-handle drags through `d.dragHandle(handle, point, orig, proj)` when present
 * - Provides directional resize cursors (`ns-resize`, `ew-resize`, `nwse-resize`, `move`)
 */
function enhanceInteraction(interaction: any) {
  if (!interaction) return;
  const proto = Object.getPrototypeOf(interaction);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  const origMove = proto.move;
  proto.move = function (x: number, y: number, mode = 'off', shift = false) {
    if (this.state?.kind === 'pressed') {
      const d = this.byId(this.state.id);
      if (d && !d.locked && this.state.handle >= 0 && typeof d.dragHandle === 'function') {
        const slop = 3;
        if (!this.state.moved && Math.abs(x - this.state.px) <= slop && Math.abs(y - this.state.py) <= slop) {
          return;
        }
        this.state.moved = true;
        const point = this.resolve(x, y, d.paneId, mode);
        d.dragHandle(this.state.handle, point, this.state.orig, this.deps.projector());
        this.deps.changed();
        return;
      }
    }
    return origMove.call(this, x, y, mode, shift);
  };

  const origCursorAt = proto.cursorAt;
  proto.cursorAt = function (x: number, y: number) {
    if (this.deps.activeTool() != null) return null;
    const hit = this.hitAt(x, y);
    if (!hit) return null;
    const proj = this.deps.projector();
    const h = hit.hitHandle(x, y, proj, 8);
    if (h >= 0) {
      if (hit.type === 'position') {
        if (h === 1 || h === 2) return 'ns-resize';
        if (h === 3) return 'ew-resize';
        return 'pointer';
      }
      if (hit.type === 'box') {
        if (h === 4 || h === 6) return 'ns-resize';
        if (h === 5 || h === 7) return 'ew-resize';
        if (h === 0 || h === 1) return 'nwse-resize';
        if (h === 2 || h === 3) return 'nesw-resize';
      }
      return 'pointer';
    }
    return origCursorAt ? origCursorAt.call(this, x, y) : 'move';
  };
}

/**
 * 4. ENHANCE DRAWING PAINTER
 * - Distinguishes 2D free handles (Circles) vs 1D axis-constrained handles (Rounded Squares)
 * - Paints TradingView desktop Long/Short Position Tool with pill badges, trajectory & arrow
 * - Paints Box (Rectangle) extensions, middle line, and background toggle
 */
function enhancePainter(painter: any) {
  if (!painter) return;
  const proto = Object.getPrototypeOf(painter);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  // Pass drawing `d` into paintHandles so handle shapes match TradingView's 2D circle vs 1D square convention
  proto.paintHighlights = function (ctx: CanvasRenderingContext2D, drawings: any[], proj: any, highlightIds: Set<string>) {
    if (!highlightIds || highlightIds.size === 0) return;
    for (const d of drawings) {
      if (d.visible && highlightIds.has(d.id)) {
        this.paintClipped(ctx, d, proj, () => this.paintHandles(ctx, d.handlePoints(proj), d));
      }
    }
  };

  proto.paintHandles = function (ctx: CanvasRenderingContext2D, points: Array<[number, number]>, d?: any) {
    if (!points || !points.length) return;
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2962ff';

    const circleRadius = 4.5;
    const squareSize = 8.5;
    const squareHalf = squareSize / 2;
    const squareRadius = 2;

    points.forEach(([x, y], idx) => {
      let isSquare = false;
      if (d?.type === 'position') {
        // Handle 0 (entry) is a 2D circle; Handles 1 (stop), 2 (target), 3 (width) are 1D rounded squares
        isSquare = idx >= 1;
      } else if (d?.type === 'box') {
        // Handles 0..3 (corners) are 2D circles; Handles 4..7 (edge midpoints) are 1D rounded squares
        isSquare = idx >= 4;
      } else if (d?.type === 'hline' || d?.type === 'vline') {
        isSquare = true;
      }

      ctx.beginPath();
      if (isSquare) {
        drawRoundRect(ctx, x - squareHalf, y - squareHalf, squareSize, squareSize, squareRadius);
      } else {
        ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  };

  // Enhance paintOne for Box (Rectangle) extensions, middle line, and background toggle
  const origPaintOne = proto.paintOne;
  proto.paintOne = function (ctx: CanvasRenderingContext2D, d: any, proj: any, theme: any) {
    if (d?.type === 'box') {
      const pts = d.handlePoints(proj);
      if (pts.length < 2) return;
      let x1 = Math.min(pts[0][0], pts[1][0]);
      let x2 = Math.max(pts[0][0], pts[1][0]);
      if (d.extendLeft) x1 = 0;
      if (d.extendRight) x2 = proj.width;
      const y = Math.min(pts[0][1], pts[1][1]);
      const w = Math.max(1, x2 - x1);
      const h = Math.abs(pts[1][1] - pts[0][1]);

      if (d.style.fillColor && d.showBackground !== false) {
        ctx.save();
        ctx.fillStyle = d.style.fillColor;
        ctx.fillRect(x1, y, w, h);
        ctx.restore();
      }
      this.applyStroke(ctx, d.style);
      ctx.strokeRect(x1, y, w, h);
      ctx.setLineDash([]);

      if (d.showMiddleLine) {
        const midY = y + h / 2;
        this.stroke(
          ctx,
          {
            lineColor: d.middleLineColor || d.style.lineColor || '#9c27b0',
            lineWidth: 1,
            lineStyle: d.middleLineStyle || 'dashed',
          },
          () => {
            ctx.moveTo(x1, midY);
            ctx.lineTo(x2, midY);
          }
        );
      }
      this.paintLabel(ctx, d, proj, theme);
      return;
    }
    return origPaintOne.call(this, ctx, d, proj, theme);
  };

  // TradingView Long/Short Position Tool painter
  proto.paintPosition = function (ctx: CanvasRenderingContext2D, d: any, proj: any, theme: any) {
    const L = d.layout(proj);
    if (!L) return;
    const { x1, x2, ey, sy, ty } = L;
    const w = x2 - x1;
    if (w <= 0) return;

    const p = d.prices();
    if (!p) return;

    const isLong = p.target >= p.entry;
    const isShort = !isLong;

    // TradingView colors (customizable per drawing)
    const profitColor = d.profitColor || '#089981';
    const lossColor = d.lossColor || '#f23645';

    // Left progress highlight width (matches TradingView's darker left band and trajectory span)
    const highlightW = Math.min(w, Math.max(24, Math.min(w * 0.34, 96)));
    const xArrow = x1 + highlightW;

    // 1. Shaded Profit & Loss Zones
    ctx.save();

    // Profit zone base fill + left highlight band
    const profitTop = Math.min(ey, ty);
    const profitHeight = Math.abs(ty - ey);
    ctx.fillStyle = hexToRgba(profitColor, 0.16);
    ctx.fillRect(x1, profitTop, w, profitHeight);
    ctx.fillStyle = hexToRgba(profitColor, 0.26);
    ctx.fillRect(x1, profitTop, highlightW, profitHeight);

    // Profit target horizontal line
    ctx.strokeStyle = hexToRgba(profitColor, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, ty + 0.5);
    ctx.lineTo(x2, ty + 0.5);
    ctx.stroke();

    // Loss zone base fill
    const lossTop = Math.min(ey, sy);
    const lossHeight = Math.abs(sy - ey);
    ctx.fillStyle = hexToRgba(lossColor, 0.16);
    ctx.fillRect(x1, lossTop, w, lossHeight);

    // Stop loss horizontal line
    ctx.strokeStyle = hexToRgba(lossColor, 0.85);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, sy + 0.5);
    ctx.lineTo(x2, sy + 0.5);
    ctx.stroke();

    ctx.restore();

    // 2. Entry Horizontal Line
    ctx.save();
    ctx.strokeStyle = '#787b86';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, ey + 0.5);
    ctx.lineTo(x2, ey + 0.5);
    ctx.stroke();
    ctx.restore();

    // 3. Dashed Trajectory Line from (x1, ey) to (xArrow, ty) with Arrowhead
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(120, 123, 134, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x1, ey);
    ctx.lineTo(xArrow, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small arrowhead at (xArrow, ty)
    const angle = Math.atan2(ty - ey, xArrow - x1);
    const headLen = 6;
    ctx.beginPath();
    ctx.moveTo(xArrow, ty);
    ctx.lineTo(xArrow - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(xArrow, ty);
    ctx.lineTo(xArrow - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();

    if (d.showText === false) return;

    // 4. Pill Badges (Stop Pill, Target Pill, and Center Closed PnL / R:R Pill)
    const stopDelta = Math.abs(p.entry - p.stop);
    const targetDelta = Math.abs(p.target - p.entry);
    const riskPct = d.riskPct ? d.riskPct() : p.entry ? (stopDelta / p.entry) * 100 : 0;
    const rewardPct = d.rewardPct ? d.rewardPct() : p.entry ? (targetDelta / p.entry) * 100 : 0;
    const dollarLoss = d.dollarLoss ? d.dollarLoss() : 0;
    const rr = d.rr ? d.rr() : stopDelta > 1e-9 ? targetDelta / stopDelta : 0;
    const dollarGain = dollarLoss * rr;
    const qty = d.positionSize ? d.positionSize() : 0;

    const fmtDelta = (n: number) => (n >= 100 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n.toFixed(5));
    const fmtPrice = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 5 });
    const fmtAmount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const fmtQty = (n: number) => (n >= 10 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));

    ctx.save();
    const fontFam = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif';
    ctx.font = `600 11.5px ${fontFam}`;
    ctx.textBaseline = 'middle';

    const badgePaddingX = 9;
    const badgeHeight = 22;
    const badgeRadius = 4;

    // A) Red Stop Pill Badge
    if (d.showStopLabel !== false) {
      const stopText = `Stop: ${fmtDelta(stopDelta)} (${riskPct.toFixed(2)}%) ${fmtPrice(p.stop)}, Amount: ${fmtAmount(dollarLoss)}`;
      const stopTextWidth = ctx.measureText(stopText).width;
      const stopBadgeW = stopTextWidth + badgePaddingX * 2;
      const stopBadgeX = Math.max(6, Math.min(proj.width - stopBadgeW - 6, x1 + (w - stopBadgeW) / 2));
      const stopBadgeY = isShort ? sy - badgeHeight - 5 : sy + 5;

      drawPill(ctx, stopBadgeX, stopBadgeY, stopBadgeW, badgeHeight, badgeRadius, lossColor);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(stopText, stopBadgeX + badgePaddingX, stopBadgeY + badgeHeight / 2 + 0.5);
    }

    // B) Teal Target Pill Badge
    if (d.showTargetLabel !== false) {
      const targetText = `Target: ${fmtDelta(targetDelta)} (${rewardPct.toFixed(2)}%) ${fmtPrice(p.target)}, Amount: ${fmtAmount(dollarGain)}`;
      const targetTextWidth = ctx.measureText(targetText).width;
      const targetBadgeW = targetTextWidth + badgePaddingX * 2;
      const targetBadgeX = Math.max(6, Math.min(proj.width - targetBadgeW - 6, x1 + (w - targetBadgeW) / 2));
      const targetBadgeY = isShort ? ty + 5 : ty - badgeHeight - 5;

      drawPill(ctx, targetBadgeX, targetBadgeY, targetBadgeW, badgeHeight, badgeRadius, profitColor);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(targetText, targetBadgeX + badgePaddingX, targetBadgeY + badgeHeight / 2 + 0.5);
    }

    // C) Center Closed PnL & Risk/Reward Pill Badge (with crisp white border like TradingView)
    if (d.showHeader !== false || d.showLossSize !== false) {
      const pnlLine1 = `Closed PnL: ${fmtDelta(targetDelta)}, Qty: ${fmtQty(qty)}`;
      const pnlLine2 = `Risk/reward ratio: ${rr.toFixed(2)}`;
      const pnlW1 = ctx.measureText(pnlLine1).width;
      const pnlW2 = ctx.measureText(pnlLine2).width;
      const centerBadgeW = Math.max(pnlW1, pnlW2) + badgePaddingX * 2 + 4;
      const centerBadgeH = 38;
      const centerBadgeX = Math.max(6, Math.min(proj.width - centerBadgeW - 6, x1 + (w - centerBadgeW) / 2));
      const centerBadgeY = isShort ? ey + 10 : ey - centerBadgeH - 10;

      drawPill(ctx, centerBadgeX, centerBadgeY, centerBadgeW, centerBadgeH, 6, '#00897b', '#ffffff', 1.25);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      const centerX = centerBadgeX + centerBadgeW / 2;
      ctx.fillText(pnlLine1, centerX, centerBadgeY + 12.5);
      ctx.fillText(pnlLine2, centerX, centerBadgeY + 26.5);
    }

    ctx.restore();
  };
}

/**
 * 5. ENHANCE FLOATING TOOLBAR (.vela-dpop)
 * - TradingView 6-dot drag grip
 * - Templates button (`⊞+`) right after grip
 * - TradingView Pencil, Paint Bucket (with checkered transparency underline), Text `T`,
 *   Hexagonal Nut (Settings), Padlock, Trash Can, and Horizontal 3-Dot More icons
 */
function enhancePopup(popup: any) {
  if (!popup) return;
  const proto = Object.getPrototypeOf(popup);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  // Override colorButton to render TradingView's checkered transparency underline bar & crisp icons
  const origColorButton = proto.colorButton;
  proto.colorButton = function (
    tip: string,
    iconHtml: string,
    color: any,
    onChange: (v: string) => void,
    iconSize = 16,
    used: string[] = []
  ) {
    let tvGlyph = iconHtml;
    const lowerTip = (tip || '').toLowerCase();
    const isFill =
      lowerTip.includes('fill') ||
      lowerTip.includes('background') ||
      lowerTip.includes('zone') ||
      lowerTip.includes('candle') ||
      iconHtml.includes('bucket');
    const isText = lowerTip.includes('text') || iconHtml.includes('M4 4h');

    if (isText) tvGlyph = TV_ICONS.text;
    else if (isFill) tvGlyph = TV_ICONS.bucket;
    else tvGlyph = TV_ICONS.pencil;

    const btn = origColorButton.call(this, tip, tvGlyph, color, onChange, iconSize, used) as HTMLElement;
    btn.classList.add('tv-dpop-color-btn');
    const spans = btn.querySelectorAll('span');
    const barSpan = spans[spans.length - 1] as HTMLElement | undefined;
    if (barSpan) {
      barSpan.className = isFill ? 'tv-dpop-color-bar tv-dpop-color-bar-checker' : 'tv-dpop-color-bar';
      barSpan.style.width = '18px';
      barSpan.style.height = '3.5px';
      barSpan.style.borderRadius = '1.5px';
    }
    return btn;
  };

  const origOpen = proto.open;
  proto.open = function (drawings: any[], anchor: any, actions: any, onClose: any) {
    origOpen.call(this, drawings, anchor, actions, onClose);
    if (!this.el) return;

    const bar = this.el.firstElementChild as HTMLElement | null;
    if (!bar) return;

    // 1. Replace grip with TradingView 6-dot grip
    const grip = bar.querySelector('.vela-dpop-grip') as HTMLElement | null;
    if (grip) {
      grip.innerHTML = TV_ICONS.grip;
    }

    // 2. Insert TradingView Templates button (⊞+) right after grip when single drawing is selected
    if (drawings?.length === 1 && grip && !bar.querySelector('.tv-dpop-tpl-btn')) {
      const tplBtn = this.base('Templates') as HTMLButtonElement;
      tplBtn.classList.add('tv-dpop-tpl-btn');
      tplBtn.innerHTML = TV_ICONS.templates;
      tplBtn.addEventListener('pointerdown', (e: Event) => e.stopPropagation());
      tplBtn.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        if (this.menuOwner === tplBtn) {
          this.closeMenu();
          return;
        }
        const saved = actions.templates?.() ?? [];
        const rows: Array<{ icon: string; label: string; onClick: () => void }> = [];
        for (const tpl of saved) {
          rows.push({
            icon: TV_ICONS.templates,
            label: tpl.name,
            onClick: () => actions.applyToolSettings?.(tpl.settings),
          });
        }
        rows.push({
          icon: TV_ICONS.reset ?? TV_ICONS.templates,
          label: 'Apply Default Drawing Template',
          onClick: () => actions.resetSettings?.(),
        });
        this.openActionMenu(tplBtn, rows);
      });
      grip.after(tplBtn);
    }

    // 3. Upgrade Settings, Lock, Trash, and More icons to TradingView Desktop icons
    const buttons = Array.from(bar.querySelectorAll('.vela-dpop-btn')) as HTMLButtonElement[];
    for (const b of buttons) {
      const tip = (b.dataset.tip || '').toLowerCase();
      if (tip.includes('setting')) {
        b.innerHTML = TV_ICONS.nut;
      } else if (tip.includes('lock')) {
        const isLocked = b.dataset.active === '1';
        b.innerHTML = isLocked ? TV_ICONS.lock : TV_ICONS.unlock;
      } else if (tip.includes('delete') || tip.includes('remove')) {
        b.innerHTML = TV_ICONS.trash;
        b.style.color = ''; // Use clean neutral color like TradingView instead of forced red
        b.classList.add('tv-dpop-del-btn');
      } else if (tip.includes('more')) {
        b.innerHTML = TV_ICONS.more;
      }
    }

    this.reposition();
  };
}

/**
 * 6. ENHANCE DRAWING SETTINGS MODAL (.vela-dialog.vela-dsp)
 * - Top Tabs Bar:
 *   - PositionTool: [ Inputs ] [ Style ] [ Coordinates ] [ Visibility ]
 *   - Other Tools:  [ Style ] [ Text ] [ Coordinates ] [ Visibility ]
 * - Unfolds Text, Coordinates, and Visibility accordion folds so controls are immediately visible
 * - Adds Rectangle (Box) TradingView rows: Extend dropdown, Middle line checkbox, Background checkbox
 * - Moves Template dropdown button to footer left & labels it "Template"
 * - Adds edit pencil icon next to dialog title
 */
function enhanceSettingsPanel(panel: any) {
  if (!panel) return;
  const proto = Object.getPrototypeOf(panel);
  if (!proto || proto._tvEnhancedV2) return;
  proto._tvEnhancedV2 = true;

  const origBuild = proto.build;
  proto.build = function (drawing: any, actions: any, anchor: any) {
    origBuild.call(this, drawing, actions, anchor);
    if (!this.ui?.panel) return;

    const dialogPanel = this.ui.panel as HTMLElement;
    const scrollEl = dialogPanel.querySelector('.vela-dsp-scroll') as HTMLElement | null;
    const footerEl = dialogPanel.querySelector('.vela-dialog-footer') as HTMLElement | null;
    const titleEl = dialogPanel.querySelector('.vela-dialog-title') as HTMLElement | null;

    if (!scrollEl) return;

    // 1. Add edit pencil icon next to title
    if (titleEl && !titleEl.querySelector('.tv-dsp-pencil')) {
      const pencil = document.createElement('button');
      pencil.type = 'button';
      pencil.className = 'tv-dsp-pencil';
      pencil.title = 'Rename drawing';
      pencil.innerHTML = TV_ICONS.editPencil;
      titleEl.appendChild(pencil);
    }

    // 2. Move Template button to footer left and rename default label from "Style" to "Template"
    const styleBtn = dialogPanel.querySelector('.vela-dsp-style') as HTMLElement | null;
    if (styleBtn && footerEl) {
      const labelSpan = styleBtn.querySelector('span');
      const fixTemplateLabel = () => {
        if (labelSpan && (labelSpan.textContent === 'Style' || !labelSpan.textContent?.trim())) {
          labelSpan.textContent = 'Template';
        }
      };
      fixTemplateLabel();
      const obs = new MutationObserver(fixTemplateLabel);
      if (labelSpan) obs.observe(labelSpan, { childList: true, characterData: true, subtree: true });

      // Wrap right-side Cancel / Ok buttons in a flex container so Template sits cleanly on the left
      let rightGroup = footerEl.querySelector('.tv-dsp-footer-right') as HTMLElement | null;
      if (!rightGroup) {
        rightGroup = document.createElement('div');
        rightGroup.className = 'tv-dsp-footer-right';
        const actionBtns = Array.from(footerEl.querySelectorAll('.vela-dialog-btn'));
        for (const ab of actionBtns) rightGroup.appendChild(ab);
        footerEl.appendChild(rightGroup);
      }
      styleBtn.remove();
      footerEl.prepend(styleBtn);
    }

    // 3. Build TradingView Tabs and watch scrollEl for rebuilds (e.g. template apply / reset)
    let activeTabId: string | null = null;
    let buildingTabs = false;

    const applyTabs = () => {
      if (buildingTabs) return;
      buildingTabs = true;
      try {
        activeTabId = organizeModalTabs(this, dialogPanel, scrollEl, drawing, actions, activeTabId);
      } finally {
        buildingTabs = false;
      }
    };

    applyTabs();

    const scrollObserver = new MutationObserver(() => {
      if (!buildingTabs) applyTabs();
    });
    scrollObserver.observe(scrollEl, { childList: true });
  };
}

/**
 * Organizes the sections inside `.vela-dsp-scroll` into TradingView tabs
 * and injects Rectangle-specific TradingView controls (Extend, Middle line, Background toggle).
 */
function organizeModalTabs(
  panelInstance: any,
  dialogPanel: HTMLElement,
  scrollEl: HTMLElement,
  drawing: any,
  actions: any,
  previousTabId: string | null
): string | null {
  const liveDrawing = actions?.resolve?.() ?? drawing;
  const isPosition = liveDrawing?.type === 'position';
  const isBox = liveDrawing?.type === 'box';

  const children = Array.from(scrollEl.children) as HTMLElement[];
  if (!children.length) return previousTabId;

  const inputsEls: HTMLElement[] = [];
  const styleEls: HTMLElement[] = [];
  const textEls: HTMLElement[] = [];
  const coordEls: HTMLElement[] = [];
  const visEls: HTMLElement[] = [];

  for (const el of children) {
    const foldTitle = el.querySelector('.vela-dsp-fold-t')?.textContent?.trim().toLowerCase() ?? '';
    const blockHeading = el.querySelector('.vela-dsp-h')?.textContent?.trim().toLowerCase() ?? '';

    if (foldTitle.includes('point') || foldTitle.includes('coordinate')) {
      openAndUnwrapFold(el);
      coordEls.push(el);
    } else if (foldTitle.includes('show on') || foldTitle.includes('visibil')) {
      openAndUnwrapFold(el);
      visEls.push(el);
    } else if (foldTitle.includes('text') || foldTitle.includes('label')) {
      openAndUnwrapFold(el);
      textEls.push(el);
    } else if (isPosition && blockHeading.includes('position')) {
      // Remove redundant uppercase "POSITION" sub-heading inside the Inputs tab
      const h = el.querySelector('.vela-dsp-h') as HTMLElement | null;
      if (h) h.style.display = 'none';
      inputsEls.push(el);
    } else {
      styleEls.push(el);
    }
  }

  // Enhance Rectangle (Box) Style tab with TradingView's Extend, Border, Middle line, and Background checkboxes
  if (isBox && styleEls.length > 0 && !scrollEl.querySelector('.tv-box-extra-rows')) {
    const extraBlock = buildBoxTradingViewRows(panelInstance, liveDrawing, actions, styleEls[0]);
    styleEls[0].prepend(extraBlock);
  }

  // Ensure PositionTool also has a Coordinates tab (since Vela's NO_POINTS skips 'position')
  if (isPosition && coordEls.length === 0) {
    const existingPosCoords = scrollEl.querySelector('.tv-pos-coords-block') as HTMLElement | null;
    if (existingPosCoords) {
      coordEls.push(existingPosCoords);
    } else {
      const posCoords = buildPositionCoordinatesBlock(liveDrawing, actions);
      scrollEl.appendChild(posCoords);
      coordEls.push(posCoords);
    }
  }

  type TabDef = { id: string; label: string; elements: HTMLElement[] };
  const tabs: TabDef[] = [];

  if (isPosition && inputsEls.length > 0) {
    tabs.push({ id: 'inputs', label: 'Inputs', elements: inputsEls });
  }
  if (styleEls.length > 0) {
    tabs.push({ id: 'style', label: 'Style', elements: styleEls });
  }
  if (textEls.length > 0) {
    tabs.push({ id: 'text', label: 'Text', elements: textEls });
  }
  if (coordEls.length > 0) {
    tabs.push({ id: 'coordinates', label: 'Coordinates', elements: coordEls });
  }
  if (visEls.length > 0) {
    tabs.push({ id: 'visibility', label: 'Visibility', elements: visEls });
  }

  if (tabs.length === 0) return previousTabId;

  let tabBar = dialogPanel.querySelector('.tv-dsp-tab-bar') as HTMLElement | null;
  if (!tabBar) {
    tabBar = document.createElement('div');
    tabBar.className = 'tv-dsp-tab-bar';
    tabBar.setAttribute('role', 'tablist');
    const bodyEl = dialogPanel.querySelector('.vela-dialog-body') as HTMLElement | null;
    if (bodyEl) bodyEl.before(tabBar);
    else scrollEl.before(tabBar);
  } else {
    tabBar.replaceChildren();
  }

  let selectedId = tabs.some((t) => t.id === previousTabId) ? previousTabId! : tabs[0].id;

  const activateTab = (tabId: string) => {
    selectedId = tabId;
    tabBar!.querySelectorAll('.tv-dsp-tab').forEach((btn) => {
      const on = (btn as HTMLElement).dataset.tab === tabId;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    for (const t of tabs) {
      const show = t.id === tabId;
      for (const el of t.elements) {
        el.hidden = !show;
        el.style.display = show ? '' : 'none';
      }
    }
  };

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.role = 'tab';
    btn.className = `tv-dsp-tab${tab.id === selectedId ? ' active' : ''}`;
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab(tab.id);
    });
    tabBar.appendChild(btn);
  }

  activateTab(selectedId);
  return selectedId;
}

/**
 * Forces a Vela lazy accordion fold to build its DOM children and hides the accordion header
 * so its controls appear directly inside the corresponding TradingView tab.
 */
function openAndUnwrapFold(foldEl: HTMLElement) {
  const head = foldEl.querySelector('.vela-dsp-fold-h') as HTMLButtonElement | null;
  const body = foldEl.querySelector('.vela-dsp-fold-b') as HTMLElement | null;
  if (head && head.getAttribute('aria-expanded') !== 'true') {
    head.click();
  }
  foldEl.setAttribute('data-open', '');
  if (head) head.style.display = 'none';
  if (body) {
    body.hidden = false;
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    body.style.padding = '4px 0';
  }
}

/**
 * Builds TradingView's Extend dropdown and Middle line / Background checkbox rows for Rectangle (`box`).
 */
function buildBoxTradingViewRows(
  panelInstance: any,
  drawing: any,
  actions: any,
  styleBlockEl?: HTMLElement
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'tv-box-extra-rows';
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:6px;';

  const live = () => actions?.resolve?.() ?? drawing;

  // 1. Extend dropdown row ("Don't extend", "Extend right", "Extend left", "Extend both")
  const extendRow = document.createElement('div');
  extendRow.className = 'vela-dsp-row';
  const extendLab = document.createElement('span');
  extendLab.className = 'vela-dsp-lab';
  extendLab.textContent = 'Extend';

  const select = document.createElement('select');
  select.className = 'tv-dsp-select';
  const opts = [
    { value: 'none', label: "Don't extend" },
    { value: 'right', label: 'Extend right' },
    { value: 'left', label: 'Extend left' },
    { value: 'both', label: 'Extend both' },
  ];
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  }
  const curExtend = () => {
    const d = live();
    return d.extendLeft && d.extendRight ? 'both' : d.extendLeft ? 'left' : d.extendRight ? 'right' : 'none';
  };
  select.value = curExtend();
  select.addEventListener('change', () => {
    const v = select.value;
    const d = live();
    d.extendLeft = v === 'left' || v === 'both';
    d.extendRight = v === 'right' || v === 'both';
    actions.patch({
      extendLeft: d.extendLeft,
      extendRight: d.extendRight,
    });
  });
  extendRow.append(extendLab, select);

  // 2. Middle line checkbox row
  const midRow = document.createElement('div');
  midRow.className = 'vela-dsp-row';
  const midLabelWrap = document.createElement('label');
  midLabelWrap.className = 'tv-dsp-check-label';
  const midCheck = document.createElement('input');
  midCheck.type = 'checkbox';
  midCheck.className = 'tv-dsp-checkbox';
  midCheck.checked = !!live().showMiddleLine;
  const midText = document.createElement('span');
  midText.textContent = 'Middle line';
  midLabelWrap.append(midCheck, midText);

  const midColorInput = document.createElement('input');
  midColorInput.type = 'color';
  midColorInput.className = 'tv-dsp-color-Inline';
  midColorInput.value = (live().middleLineColor || '#9c27b0').slice(0, 7);

  midCheck.addEventListener('change', () => {
    const d = live();
    d.showMiddleLine = midCheck.checked;
    actions.patch({ showMiddleLine: d.showMiddleLine });
  });
  midColorInput.addEventListener('input', () => {
    const d = live();
    d.middleLineColor = midColorInput.value;
    actions.patch({ middleLineColor: d.middleLineColor });
  });
  midRow.append(midLabelWrap, midColorInput);

  // 3. Upgrade existing Line -> Border and Fill -> [✓] Background inside styleBlockEl
  if (styleBlockEl) {
    const rows = Array.from(styleBlockEl.querySelectorAll('.vela-dsp-row')) as HTMLElement[];
    for (const r of rows) {
      const lab = r.querySelector('.vela-dsp-lab') as HTMLElement | null;
      if (!lab) continue;
      const txt = lab.textContent?.trim().toLowerCase() ?? '';
      if (txt === 'line') {
        lab.textContent = 'Border';
      } else if (txt === 'fill') {
        const bgLabelWrap = document.createElement('label');
        bgLabelWrap.className = 'tv-dsp-check-label';
        const bgCheck = document.createElement('input');
        bgCheck.type = 'checkbox';
        bgCheck.className = 'tv-dsp-checkbox';
        bgCheck.checked = live().showBackground !== false;
        const bgText = document.createElement('span');
        bgText.textContent = 'Background';
        bgLabelWrap.append(bgCheck, bgText);
        bgCheck.addEventListener('change', () => {
          const d = live();
          d.showBackground = bgCheck.checked;
          actions.patch({ showBackground: d.showBackground });
        });
        lab.replaceWith(bgLabelWrap);
        r.before(midRow);
      }
    }
  }

  wrap.append(extendRow);
  if (!midRow.parentElement) {
    wrap.append(midRow);
  }
  return wrap;
}

/**
 * Builds the Coordinates tab content for PositionTool (Entry, Stop, Target prices & bars).
 */
function buildPositionCoordinatesBlock(drawing: any, actions: any): HTMLElement {
  const blockEl = document.createElement('div');
  blockEl.className = 'vela-dsp-block tv-pos-coords-block';
  const live = () => actions?.resolve?.() ?? drawing;

  const makePriceRow = (label: string, anchorIdx: number, propName: 'entryPrice' | 'stopPrice' | 'targetPrice') => {
    const rowEl = document.createElement('div');
    rowEl.className = 'vela-dsp-row';
    const lab = document.createElement('span');
    lab.className = 'vela-dsp-lab';
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.className = 'tv-dsp-select';
    const curVal = () => {
      const d = live();
      return d.anchors?.[anchorIdx]?.price ?? d[propName] ?? 0;
    };
    input.value = String(Number(curVal().toFixed(5)));
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (Number.isFinite(val)) {
        actions.patch({ [propName]: val });
      }
    });
    rowEl.append(lab, input);
    return rowEl;
  };

  blockEl.append(
    makePriceRow('Entry price', 0, 'entryPrice'),
    makePriceRow('Stop price', 1, 'stopPrice'),
    makePriceRow('Target price', 2, 'targetPrice')
  );
  return blockEl;
}

/**
 * Helper to draw a rounded rectangle on a canvas context
 */
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillColor: string,
  strokeColor?: string,
  strokeWidth = 1
) {
  ctx.save();
  drawRoundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
}

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(128, 128, 128, ${alpha})`;
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d.]+\)$/, `${alpha})`);
  }
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(128, 128, 128, ${alpha})`;
}

/**
 * Injects TradingView Desktop styles for the floating toolbar, color picker popover, and settings modal.
 */
function injectDrawingTvStyles() {
  if (typeof document === 'undefined') return;
  const styleId = 'deplyze-drawing-tv-styles';
  const existing = document.getElementById(styleId);
  if (existing) existing.remove();

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* === TradingView Floating Quick Toolbar (.vela-dpop) === */
    .vela-dpop {
      border-radius: 8px !important;
      background: var(--vela-surface-overlay, #1e222d) !important;
      border: 1px solid var(--vela-border, #363a45) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28), 0 1px 3px rgba(0, 0, 0, 0.16) !important;
      padding: 0 5px !important;
      min-height: 38px !important;
      box-sizing: border-box !important;
    }
    .vela-dpop > div:first-child {
      align-items: center !important;
      gap: 2px !important;
      padding: 3px 0 !important;
      min-height: 36px !important;
    }
    .vela-dpop-btn {
      width: 32px !important;
      height: 32px !important;
      border-radius: 6px !important;
      color: var(--vela-fg, #d1d4dc) !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: background 0.12s ease, color 0.12s ease !important;
    }
    .vela-dpop-btn:hover {
      background: var(--vela-hover-strong, rgba(255, 255, 255, 0.08)) !important;
      color: var(--vela-fg-bright, #ffffff) !important;
    }
    .vela-dpop-btn[data-active='1'] {
      background: rgba(41, 98, 255, 0.16) !important;
      color: #2962ff !important;
    }
    .vela-dpop-grip {
      width: 18px !important;
      height: 32px !important;
      cursor: grab !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      color: var(--vela-fg-muted, #787b86) !important;
      opacity: 0.75 !important;
    }
    .vela-dpop-grip:hover {
      opacity: 1 !important;
    }
    .tv-dpop-color-btn {
      gap: 2px !important;
      padding-top: 2px !important;
    }
    .tv-dpop-color-bar-checker {
      background-image:
        linear-gradient(45deg, rgba(128,128,128,0.35) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(128,128,128,0.35) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.35) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.35) 75%) !important;
      background-size: 4px 4px !important;
      background-position: 0 0, 0 2px, 2px -2px, -2px 0 !important;
    }

    /* === TradingView Drawing Settings Modal (.vela-dialog.vela-dsp) === */
    .vela-dialog.vela-dsp {
      width: 396px !important;
      max-width: calc(100vw - 28px) !important;
      background: var(--vela-surface-overlay, #1e222d) !important;
      border: 1px solid var(--vela-border, #363a45) !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.42) !important;
      color: var(--vela-fg, #d1d4dc) !important;
      overflow: hidden !important;
      font-family: -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif !important;
    }
    .vela-dsp .vela-dialog-header {
      padding: 16px 18px 10px 20px !important;
      border-bottom: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    .vela-dsp .vela-dialog-title {
      font-size: 18px !important;
      font-weight: 650 !important;
      letter-spacing: -0.01em !important;
      color: var(--vela-fg-bright, #ffffff) !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
    }
    .tv-dsp-pencil {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 5px !important;
      color: var(--vela-fg-muted, #787b86) !important;
      background: transparent !important;
      border: none !important;
      cursor: pointer !important;
      padding: 0 !important;
    }
    .tv-dsp-pencil:hover {
      background: var(--vela-hover-strong, rgba(255, 255, 255, 0.08)) !important;
      color: var(--vela-fg-bright, #ffffff) !important;
    }

    /* TradingView Top Tabs Bar */
    .tv-dsp-tab-bar {
      display: flex !important;
      align-items: center !important;
      gap: 18px !important;
      padding: 0 20px !important;
      border-bottom: 1px solid var(--vela-border, #2a2e39) !important;
      background: transparent !important;
    }
    .tv-dsp-tab {
      padding: 10px 2px 11px 2px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: var(--vela-fg-muted, #787b86) !important;
      background: transparent !important;
      border: 0 !important;
      cursor: pointer !important;
      position: relative !important;
      transition: color 0.14s ease !important;
    }
    .tv-dsp-tab:hover {
      color: var(--vela-fg-bright, #ffffff) !important;
    }
    .tv-dsp-tab.active {
      color: var(--vela-fg-bright, #ffffff) !important;
    }
    .tv-dsp-tab.active::after {
      content: '' !important;
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      bottom: -1px !important;
      height: 2.5px !important;
      background: var(--vela-fg-bright, #ffffff) !important;
      border-radius: 2px !important;
    }

    /* Modal Scroll Body & Rows */
    .vela-dsp-scroll {
      padding: 16px 20px !important;
      max-height: 400px !important;
    }
    .vela-dsp-block, .vela-dsp-fold {
      padding: 4px 0 !important;
      border-top: none !important;
      gap: 12px !important;
    }
    .vela-dsp-row {
      min-height: 34px !important;
      font-size: 13.5px !important;
      color: var(--vela-fg, #d1d4dc) !important;
      justify-content: space-between !important;
    }
    .vela-dsp-lab {
      color: var(--vela-fg, #d1d4dc) !important;
      font-size: 13.5px !important;
      min-width: 112px !important;
    }
    .tv-dsp-check-label {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 13.5px !important;
      color: var(--vela-fg, #d1d4dc) !important;
      cursor: pointer !important;
      min-width: 112px !important;
    }
    .tv-dsp-checkbox {
      width: 16px !important;
      height: 16px !important;
      accent-color: #2962ff !important;
      cursor: pointer !important;
      margin: 0 !important;
    }
    .tv-dsp-select {
      height: 32px !important;
      min-width: 156px !important;
      padding: 0 10px !important;
      border-radius: 6px !important;
      border: 1px solid var(--vela-border-strong, #434651) !important;
      background: var(--vela-surface-overlay, #1e222d) !important;
      color: var(--vela-fg-bright, #ffffff) !important;
      font-size: 13px !important;
      outline: none !important;
      cursor: pointer !important;
    }
    .tv-dsp-color-Inline {
      width: 34px !important;
      height: 28px !important;
      border-radius: 6px !important;
      border: 1px solid var(--vela-border-strong, #434651) !important;
      background: transparent !important;
      cursor: pointer !important;
      padding: 2px !important;
    }

    /* Modal Footer: Template on left, Cancel & Ok on right */
    .vela-dsp .vela-dialog-footer {
      padding: 14px 20px !important;
      border-top: 1px solid var(--vela-border, #2a2e39) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: var(--vela-surface-overlay, #1e222d) !important;
    }
    .tv-dsp-footer-right {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      margin-left: auto !important;
    }
    .vela-dsp .vela-dsp-style {
      height: 34px !important;
      padding: 0 12px !important;
      border-radius: 6px !important;
      border: 1px solid var(--vela-border-strong, #434651) !important;
      background: transparent !important;
      color: var(--vela-fg, #d1d4dc) !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    .vela-dsp .vela-dsp-style:hover {
      background: var(--vela-hover-strong, rgba(255, 255, 255, 0.06)) !important;
      color: var(--vela-fg-bright, #ffffff) !important;
    }
    .vela-dsp .vela-dialog-btn {
      height: 34px !important;
      padding: 0 18px !important;
      border-radius: 6px !important;
      font-size: 13.5px !important;
      font-weight: 500 !important;
      border: 1px solid var(--vela-border-strong, #434651) !important;
      background: transparent !important;
      color: var(--vela-fg-bright, #ffffff) !important;
      cursor: pointer !important;
    }
    .vela-dsp .vela-dialog-btn:hover {
      background: var(--vela-hover-strong, rgba(255, 255, 255, 0.08)) !important;
    }
    .vela-dsp .vela-dialog-btn[data-primary='1'],
    .vela-dsp .vela-dialog-btn--primary {
      background: var(--vela-fg-bright, #2962ff) !important;
      border-color: var(--vela-fg-bright, #2962ff) !important;
      color: var(--vela-surface-overlay, #ffffff) !important;
      font-weight: 600 !important;
    }
  `;
  document.head.appendChild(style);
}
