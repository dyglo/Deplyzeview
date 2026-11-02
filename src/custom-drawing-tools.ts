import * as Vela from '@luxalgo/vela';
import { registerRendererLayer } from '@luxalgo/vela/plugin';
import designIcons from '../design/tool-icons.json' with { type: 'json' };
import type { Drawing, DrawingPoint, DrawingTypeKey, Projector } from '@luxalgo/vela';

const api = Vela as unknown as { registerDrawingType: (meta: Record<string, any>) => void; drawingTypes: () => Array<Record<string, any>> };
export const CUSTOM_DRAWING_LAYER = 'toolrail-custom-drawings';
const CUSTOM_TYPES = [
  { id: 'tv_trianglepattern', label: 'Triangle pattern', group: 'patterns', kind: 'triangle', min: 4, max: 4, mode: 'click' },
  { id: 'tv_cycliclines', label: 'Cyclic lines', group: 'lines', kind: 'cyclic', min: 2, max: 2, mode: 'click' },
  { id: 'tv_timecycles', label: 'Time cycles', group: 'lines', kind: 'time-cycles', min: 2, max: 2, mode: 'drag' },
  { id: 'tv_sineline', label: 'Sine line', group: 'lines', kind: 'sine', min: 2, max: 2, mode: 'drag' },
  { id: 'tv_sector', label: 'Sector', group: 'measure', kind: 'sector', min: 3, max: 3, mode: 'click', enabled: false },
  { id: 'tv_arrowmarker', label: 'Arrow marker', group: 'shapes', kind: 'arrow-marker', min: 2, max: 2, mode: 'drag' },
  { id: 'tv_doublecurve', label: 'Double curve', group: 'shapes', kind: 'double-curve', min: 4, max: 4, mode: 'click', enabled: false },
  { id: 'tv_pin', label: 'Pin', group: 'annotations', kind: 'pin', min: 1, max: 1, mode: 'click' },
] as const;

type CustomId = typeof CUSTOM_TYPES[number]['id'];
type CustomMeta = typeof CUSTOM_TYPES[number] & { enabled?: boolean };
const CUSTOM_BY_ID = new Map<string, CustomMeta>(CUSTOM_TYPES.map((tool) => [tool.id, tool]));
const labelToIcon = new Map<string, string>();
for (const items of Object.values(designIcons)) for (const item of items) labelToIcon.set(stripLabel(item.label).toLowerCase(), item.svg);
function stripLabel(label: string) { return label.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim(); }
const standardStyle = api.drawingTypes().find((meta) => meta.type === 'trendline')?.defaultStyle ?? { lineColor: '#d1d4dc', lineWidth: 2, lineStyle: 'solid' };

class ToolRailDrawing extends (Vela.Drawing as unknown as typeof Drawing) {
  readonly type: DrawingTypeKey;
  private readonly toolId: CustomId;
  private readonly minimum: number;
  private readonly maximum: number;
  private readonly mode: 'click' | 'drag' | 'freehand';
  private values: Record<string, unknown> = {};

  constructor(tool: CustomMeta, init: Record<string, any>) {
    super({ ...init, type: tool.id } as any);
    this.type = tool.id as unknown as DrawingTypeKey;
    this.toolId = tool.id;
    this.minimum = tool.min;
    this.maximum = tool.max;
    this.mode = tool.mode;
    this.values = { ...(init.props ?? {}) };
  }
  anchorSchema() {
    return { min: this.minimum, max: this.maximum, slots: Array.from({ length: this.maximum }, (_, i) => ({ role: `Point ${i + 1}`, free: 'both' as const })) };
  }
  placementMode() { return this.mode; }
  hitTest(px: number, py: number, proj: Projector, tol: number) {
    const pts = this.handlePoints(proj);
    if (pts.some(([x, y]) => Math.hypot(px - x, py - y) <= tol)) return true;
    if ((this.toolId === 'tv_cycliclines' || this.toolId === 'tv_timecycles') && pts.length >= 2) {
      const step = Math.abs(pts[1][0] - pts[0][0]);
      if (step > 1 && Math.abs(px - (pts[0][0] + Math.round((px - pts[0][0]) / step) * step)) <= tol) return true;
    }
    if (this.toolId === 'tv_sineline' && pts.length >= 2) {
      const [a, b] = pts, period = Math.max(2, Math.abs(b[0] - a[0]));
      const expectedY = (a[1] + b[1]) / 2 + Math.abs(b[1] - a[1]) / 2 * Math.sin((px - a[0]) * Math.PI * 2 / period);
      if (Math.abs(py - expectedY) <= tol) return true;
    }
    if (this.toolId === 'tv_trianglepattern' && pts.length >= 4 && pointInPolygon(px, py, polygonOf(this.toolId, pts))) return true;
    if (this.toolId === 'tv_sector' && pts.length >= 3 && pointInPolygon(px, py, polygonOf(this.toolId, pts))) return true;
    return segmentsOf(this.toolId, pts).some(([a, b]) => segmentDistance(px, py, a[0], a[1], b[0], b[1]) <= tol);
  }
  hitHandle(px: number, py: number, proj: Projector, tol: number) {
    const pts = this.handlePoints(proj);
    let best = -1, distance = tol;
    pts.forEach(([x, y], i) => { const d = Math.hypot(px - x, py - y); if (d <= distance) { best = i; distance = d; } });
    return best;
  }
  handlePoints(proj: Projector): Array<[number, number]> {
    return this.anchors.flatMap((point) => { const y = proj.yOf(point.price, this.paneId); return y == null ? [] : [[proj.xOf(point.time), y] as [number, number]]; });
  }
  bounds(proj: Projector) {
    const pts = this.handlePoints(proj); if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
  }
  priceRange() {
    if (!this.anchors.length) return null;
    const values = this.anchors.map((p) => p.price); return { min: Math.min(...values), max: Math.max(...values) };
  }
  schema(): any {
    const fields: any[] = [
      { path: 'style.lineColor', label: 'Color', kind: 'color', group: 'line' },
      { path: 'style.lineWidth', label: 'Thickness', kind: 'number', min: 1, max: 8, step: 1, group: 'line' },
      { path: 'style.lineStyle', label: 'Line style', kind: 'lineStyle', group: 'line' },
    ];
    if (this.toolId === 'tv_trianglepattern' || this.toolId === 'tv_sector' || this.toolId === 'tv_timecycles') fields.push(
      { path: 'style.fillColor', label: 'Background', kind: 'color', group: 'fill' },
      { path: 'style.fillOpacity', label: 'Background opacity', kind: 'opacity', min: 0, max: 1, step: .05, group: 'fill' },
    );
    if (this.toolId === 'tv_pin' || this.toolId === 'tv_arrowmarker') fields.push(
      { path: 'text.value', label: this.toolId === 'tv_pin' ? 'Note' : 'Text', kind: 'text', group: 'text' },
    );
    return { fields, textIsContent: this.toolId === 'tv_pin' };
  }
  placeholderText() { return this.toolId === 'tv_pin' ? 'Note' : null; }
  protected writeProps() { return Object.keys(this.values).length ? { ...this.values } : undefined; }
  protected readProps(props: Record<string, unknown>) { this.values = { ...props }; }
  get toolValues() { return this.values; }
}

function segmentsOf(type: CustomId, pts: Array<[number, number]>) {
  if (type === 'tv_trianglepattern' && pts.length >= 4) return [[pts[0], pts[2]], [pts[1], pts[3]]] as Array<[[number, number], [number, number]]>;
  if (type === 'tv_sector' && pts.length >= 3) return [[pts[0], pts[1]], [pts[1], pts[2]], [pts[2], pts[0]]] as Array<[[number, number], [number, number]]>;
  if (type === 'tv_pin') return [];
  if (type === 'tv_sineline' || type === 'tv_timecycles' || type === 'tv_cycliclines') return pts.length > 1 ? [[pts[0], pts[1]]] : [];
  if (type === 'tv_doublecurve' && pts.length >= 4) {
    const sampled: Array<[number, number]> = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; sampled.push([
      u ** 3 * pts[0][0] + 3 * u ** 2 * t * pts[2][0] + 3 * u * t ** 2 * pts[3][0] + t ** 3 * pts[1][0],
      u ** 3 * pts[0][1] + 3 * u ** 2 * t * pts[2][1] + 3 * u * t ** 2 * pts[3][1] + t ** 3 * pts[1][1],
    ]); }
    return sampled.slice(1).map((p, i) => [sampled[i], p] as [[number, number], [number, number]]);
  }
  return pts.slice(1).map((p, i) => [pts[i], p] as [[number, number], [number, number]]);
}
function polygonOf(type: CustomId, pts: Array<[number, number]>) {
  return type === 'tv_trianglepattern' ? [pts[0], pts[2], pts[3], pts[1]] : pts.slice(0, 3);
}
function pointInPolygon(x: number, y: number, points: Array<[number, number]>) {
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

for (const tool of CUSTOM_TYPES.filter((item) => (item as CustomMeta).enabled !== false)) {
  api.registerDrawingType({
    type: tool.id, group: tool.group, label: tool.label,
    icon: labelToIcon.get(tool.label.toLowerCase()) ?? '<svg viewBox="0 0 24 24"><path d="M4 20 20 4"/></svg>',
    defaultStyle: { ...standardStyle, ...(tool.kind === 'triangle' || tool.kind === 'sector' ? { fillColor: '#38c0fd', fillOpacity: .12 } : {}), ...(tool.kind === 'time-cycles' ? { fillColor: '#38c0fd', fillOpacity: 0 } : {}) },
    create: (init: Record<string, any>) => new ToolRailDrawing(tool, init),
  });
}

function pointOf(anchor: DrawingPoint, args: any): [number, number] | null {
  const y = args.coords.priceToY(anchor.price, args.scale, args.bounds);
  return y == null || !Number.isFinite(y) ? null : [args.coords.timeToX(anchor.time), y];
}
function configure(ctx: CanvasRenderingContext2D, style: any) {
  ctx.strokeStyle = style.lineColor ?? '#d1d4dc'; ctx.lineWidth = Math.max(1, style.lineWidth ?? 2); ctx.globalAlpha *= style.opacity ?? 1;
  ctx.setLineDash(style.lineStyle === 'dashed' ? [7, 5] : style.lineStyle === 'dotted' ? [2, 4] : []);
}
function drawLine(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]) { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); }
function arrowHead(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]), size = 9;
  ctx.beginPath(); ctx.moveTo(...b); ctx.lineTo(b[0] - size * Math.cos(angle - .42), b[1] - size * Math.sin(angle - .42));
  ctx.moveTo(...b); ctx.lineTo(b[0] - size * Math.cos(angle + .42), b[1] - size * Math.sin(angle + .42)); ctx.stroke();
}
function paintDrawing(ctx: CanvasRenderingContext2D, doc: any, args: any, alpha = 1, selected = false) {
  if (doc.visible === false) return;
  const type = doc.type as CustomId, meta = CUSTOM_BY_ID.get(type); if (!meta) return;
  const pts = (doc.anchors ?? []).map((a: DrawingPoint) => pointOf(a, args)).filter((p: any) => p) as Array<[number, number]>;
  if (!pts.length) return;
  ctx.save(); configure(ctx, doc.style ?? {}); ctx.globalAlpha *= alpha;
  const closeFill = (vertices: Array<[number, number]>) => {
    if (vertices.length < 3) return;
    ctx.beginPath(); ctx.moveTo(...vertices[0]); for (const p of vertices.slice(1)) ctx.lineTo(...p); ctx.closePath();
    ctx.fillStyle = doc.style?.fillColor ?? 'rgba(41,98,255,.12)'; ctx.globalAlpha *= doc.style?.fillOpacity ?? .15; ctx.fill(); ctx.globalAlpha = alpha * (doc.style?.opacity ?? 1);
    ctx.stroke();
  };
  if (meta.kind === 'triangle' && pts.length >= 4) {
    closeFill([pts[0], pts[2], pts[3], pts[1]]); drawLine(ctx, pts[0], pts[2]); drawLine(ctx, pts[1], pts[3]);
  } else if (meta.kind === 'sector' && pts.length >= 3) {
    closeFill([pts[0], pts[1], pts[2]]);
  } else if (meta.kind === 'arrow-marker' && pts.length >= 2) {
    drawLine(ctx, pts[0], pts[1]); arrowHead(ctx, pts[0], pts[1]);
    const value = doc.text?.value; if (value) { ctx.fillStyle = doc.text?.color ?? doc.style?.lineColor ?? '#d1d4dc'; ctx.font = '12px sans-serif'; ctx.fillText(value, pts[1][0] + 9, pts[1][1] - 9); }
  } else if (meta.kind === 'double-curve' && pts.length >= 4) {
    ctx.beginPath(); ctx.moveTo(...pts[0]); ctx.bezierCurveTo(...pts[2], ...pts[3], ...pts[1]); ctx.stroke();
  } else if (meta.kind === 'pin') {
    const [x, y] = pts[0]; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 2, y + 1, x - 9, y - 5, x - 9, y - 11); ctx.arc(x, y - 11, 9, Math.PI, 0); ctx.bezierCurveTo(x + 9, y - 5, x + 2, y + 1, x, y + 4); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y - 11, 2.4, 0, Math.PI * 2); ctx.stroke();
    if (selected && doc.text?.value) { ctx.fillStyle = doc.text.color ?? '#d1d4dc'; ctx.font = '12px sans-serif'; ctx.fillText(doc.text.value, x + 10, y - 14); }
  } else if (meta.kind === 'cyclic' || meta.kind === 'time-cycles') {
    if (pts.length >= 2) { const step = Math.abs(pts[1][0] - pts[0][0]); if (step > 1) {
      const from = Math.min(pts[0][0], pts[1][0]), to = args.coords.width, top = args.bounds.top, bottom = top + args.bounds.height;
      let i = 0; for (let x = from; x <= to && i++ < 500; x += step) {
        if (meta.kind === 'time-cycles' && i % 2 === 0 && (doc.style?.fillOpacity ?? 0) > 0) { ctx.save(); ctx.fillStyle = doc.style?.fillColor ?? '#38c0fd'; ctx.globalAlpha *= doc.style?.fillOpacity ?? 0; ctx.fillRect(x - step, top, step, args.bounds.height); ctx.restore(); }
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    } }
  } else if (meta.kind === 'sine' && pts.length >= 2) {
    const [a, b] = pts, period = Math.max(2, Math.abs(b[0] - a[0])), amplitude = Math.max(1, Math.abs(b[1] - a[1]) / 2), mid = (a[1] + b[1]) / 2;
    ctx.beginPath(); for (let x = 0; x <= args.coords.width; x += 2) { const y = mid + amplitude * Math.sin((x - a[0]) * Math.PI * 2 / period); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
  }
  ctx.restore();
}

registerRendererLayer({ id: CUSTOM_DRAWING_LAYER, placement: 'above-data', create: () => {
  let canvas: HTMLCanvasElement | undefined;
  return {
    mount(node) { canvas = node; },
    render(args: any) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const dpr = args.coords.dpr ?? 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, args.coords.width, args.coords.height);
      const data = args.data as { drawings?: any[]; draft?: any; selected?: string[] } | undefined;
      const selectedIds = new Set(data?.selected ?? []);
      ctx.save(); ctx.beginPath(); ctx.rect(0, args.bounds.top, args.coords.width, args.bounds.height); ctx.clip();
      for (const doc of data?.drawings ?? []) paintDrawing(ctx, doc, args, 1, selectedIds.has(doc.id));
      if (data?.draft) paintDrawing(ctx, data.draft, args, .65);
      for (const doc of data?.drawings ?? []) if (data?.selected?.includes(doc.id) && CUSTOM_BY_ID.has(doc.type)) {
        const points = (doc.anchors ?? []).map((a: DrawingPoint) => pointOf(a, args)).filter((p: any) => p) as Array<[number, number]>;
        ctx.save(); ctx.setLineDash([]); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2962ff';
        for (const [x, y] of points) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } ctx.restore();
      }
      ctx.restore();
    },
  };
} });

export function customDrawingPayload(chart: any, draft: any = null, selected: string[] = []) {
  return { drawings: chart.drawings.all(), draft, selected };
}
export function isCustomDrawingType(type: string) { return CUSTOM_BY_ID.get(type)?.enabled !== false && CUSTOM_BY_ID.has(type); }
export function customToolType(toolLabel: string): string | undefined { return CUSTOM_TYPES.find((tool) => (tool as CustomMeta).enabled !== false && tool.label.toLowerCase() === stripLabel(toolLabel).toLowerCase())?.id; }
export function pushCustomDrawingData(rendererControl: unknown, chart: any, draft: any = null, selected: string[] = []) {
  // RendererControl deliberately hides the underlying IChartRenderer from its public
  // surface, while IChartRenderer.setNativeData is the documented custom-layer channel.
  const nativeRenderer = (rendererControl as { renderer?: { setNativeData?: (id: string, data: unknown) => void } } | null)?.renderer;
  nativeRenderer?.setNativeData?.(CUSTOM_DRAWING_LAYER, customDrawingPayload(chart, draft, selected));
}
