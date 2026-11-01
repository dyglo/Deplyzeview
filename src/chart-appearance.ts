export type ChartStyle = 'candles' | 'hollow' | 'bars' | 'line' | 'area' | 'baseline' | 'heikinashi' | 'footprint';
export type CrosshairLineStyle = 'solid' | 'dashed' | 'dotted';
export type ScaleMode = 'price' | 'percent' | 'indexed';

export interface ChartAppearance {
  background: string;
  textColor: string;
  fontSize: number;
  gridVertVisible: boolean;
  gridVertColor: string;
  gridHorzVisible: boolean;
  gridHorzColor: string;
  upColor: string;
  downColor: string;
  borderVisible: boolean;
  borderUpColor: string;
  borderDownColor: string;
  wickVisible: boolean;
  wickUpColor: string;
  wickDownColor: string;
  barUpColor: string;
  barDownColor: string;
  lineColor: string;
  areaLineColor: string;
  areaFillColor: string;
  baselineUpColor: string;
  baselineDownColor: string;
  scaleMode: ScaleMode;
  scaleLog: boolean;
  invertScale: boolean;
  priceOnly: boolean;
  priceLabels: boolean;
  currentPriceLine: boolean;
  priceLabel: boolean;
  countdown: boolean;
  axisBorderColor: string;
  separatorColor: string;
  crosshairColor: string;
  crosshairLabelBackground: string;
  crosshairOpacity: number;
  crosshairWidth: number;
  crosshairStyle: CrosshairLineStyle;
  marginTop: number;
  marginBottom: number;
  marginRight: number;
  lineWidth: number;
  areaWidth: number;
  baselineWidth: number;
  baselineLevel: number;
}

export type AppearanceKey = keyof ChartAppearance;

export const VELA_DARK_DEFAULTS: ChartAppearance = {
  background: '#101114', textColor: '#c7c9ce', fontSize: 11,
  gridVertVisible: true, gridVertColor: '#25272d', gridHorzVisible: true, gridHorzColor: '#25272d',
  upColor: '#8a746e', downColor: '#c16f61', borderVisible: true,
  borderUpColor: '#8a746e', borderDownColor: '#c16f61', wickVisible: true,
  wickUpColor: '#8a746e', wickDownColor: '#c16f61', barUpColor: '#8a746e', barDownColor: '#c16f61',
  lineColor: '#a69a96', areaLineColor: '#a69a96', areaFillColor: '#705c56',
  baselineUpColor: '#8a746e', baselineDownColor: '#c16f61',
  scaleMode: 'price', scaleLog: false, invertScale: false, priceOnly: false,
  priceLabels: true, currentPriceLine: true, priceLabel: true, countdown: false,
  axisBorderColor: '#25272d', separatorColor: '#25272d',
  crosshairColor: '#747780', crosshairLabelBackground: '#25272d', crosshairOpacity: 0.4, crosshairWidth: 1, crosshairStyle: 'dashed',
  marginTop: 10, marginBottom: 10, marginRight: 10,
  lineWidth: 2, areaWidth: 2, baselineWidth: 2, baselineLevel: 50,
};

type Dict = Record<string, unknown>;
function dict(value: unknown): Dict | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Dict : undefined;
}
function child(root: Dict | undefined, key: string): Dict | undefined { return dict(root?.[key]); }
function stringValue(root: Dict | undefined, key: string, fallback: string): string {
  const value = root?.[key];
  return typeof value === 'string' ? value : fallback;
}
function booleanValue(root: Dict | undefined, key: string, fallback: boolean): boolean {
  const value = root?.[key];
  return typeof value === 'boolean' ? value : fallback;
}
function numberValue(root: Dict | undefined, key: string, fallback: number): number {
  const value = root?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function colorHex(value: string, fallback: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return fallback;
  return `#${rgb.slice(1, 4).map((part) => Math.max(0, Math.min(255, Number(part))).toString(16).padStart(2, '0')).join('')}`;
}
function alphaColor(hex: string, alpha: number): string {
  const safe = colorHex(hex, VELA_DARK_DEFAULTS.areaFillColor).slice(1);
  const [r, g, b] = [0, 2, 4].map((index) => Number.parseInt(safe.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function appearanceFromConfig(configValue: unknown): ChartAppearance {
  const config = dict(configValue);
  const layout = child(config, 'layout');
  const grid = child(config, 'grid');
  const vert = child(grid, 'vertLines');
  const horz = child(grid, 'horzLines');
  const candles = child(config, 'candles');
  const bars = child(config, 'bars');
  const line = child(config, 'line');
  const area = child(config, 'area');
  const baseline = child(config, 'baseline');
  const crosshair = child(config, 'crosshair');
  const priceScale = child(config, 'priceScale');
  const panes = child(config, 'panes');
  const margins = child(config, 'margins');
  const scaleMode = stringValue(priceScale, 'mode', VELA_DARK_DEFAULTS.scaleMode);
  const crosshairStyle = stringValue(crosshair, 'style', VELA_DARK_DEFAULTS.crosshairStyle);
  return {
    ...VELA_DARK_DEFAULTS,
    background: stringValue(layout, 'background', VELA_DARK_DEFAULTS.background),
    textColor: stringValue(layout, 'textColor', VELA_DARK_DEFAULTS.textColor),
    fontSize: numberValue(layout, 'fontSize', VELA_DARK_DEFAULTS.fontSize),
    gridVertVisible: booleanValue(vert, 'visible', true),
    gridVertColor: stringValue(vert, 'color', VELA_DARK_DEFAULTS.gridVertColor),
    gridHorzVisible: booleanValue(horz, 'visible', true),
    gridHorzColor: stringValue(horz, 'color', VELA_DARK_DEFAULTS.gridHorzColor),
    upColor: stringValue(candles, 'upColor', VELA_DARK_DEFAULTS.upColor),
    downColor: stringValue(candles, 'downColor', VELA_DARK_DEFAULTS.downColor),
    borderVisible: booleanValue(candles, 'borderVisible', true),
    borderUpColor: stringValue(candles, 'borderUpColor', VELA_DARK_DEFAULTS.borderUpColor),
    borderDownColor: stringValue(candles, 'borderDownColor', VELA_DARK_DEFAULTS.borderDownColor),
    wickVisible: booleanValue(candles, 'wickVisible', true),
    wickUpColor: stringValue(candles, 'wickUpColor', VELA_DARK_DEFAULTS.wickUpColor),
    wickDownColor: stringValue(candles, 'wickDownColor', VELA_DARK_DEFAULTS.wickDownColor),
    barUpColor: stringValue(bars, 'upColor', VELA_DARK_DEFAULTS.barUpColor),
    barDownColor: stringValue(bars, 'downColor', VELA_DARK_DEFAULTS.barDownColor),
    lineColor: stringValue(line, 'color', VELA_DARK_DEFAULTS.lineColor),
    areaLineColor: stringValue(area, 'lineColor', VELA_DARK_DEFAULTS.areaLineColor),
    areaFillColor: colorHex(stringValue(area, 'topColor', VELA_DARK_DEFAULTS.areaFillColor), VELA_DARK_DEFAULTS.areaFillColor),
    baselineUpColor: stringValue(baseline, 'topLineColor', VELA_DARK_DEFAULTS.baselineUpColor),
    baselineDownColor: stringValue(baseline, 'bottomLineColor', VELA_DARK_DEFAULTS.baselineDownColor),
    scaleMode: (['price', 'percent', 'indexed'].includes(scaleMode) ? scaleMode : 'price') as ScaleMode,
    scaleLog: booleanValue(priceScale, 'log', false),
    invertScale: booleanValue(priceScale, 'invert', false),
    priceOnly: booleanValue(priceScale, 'priceOnly', false),
    priceLabels: booleanValue(priceScale, 'labelsVisible', true),
    currentPriceLine: booleanValue(priceScale, 'currentPriceLine', true),
    priceLabel: booleanValue(priceScale, 'priceLabel', true),
    countdown: booleanValue(priceScale, 'countdown', false),
    axisBorderColor: stringValue(priceScale, 'borderColor', VELA_DARK_DEFAULTS.axisBorderColor),
    separatorColor: stringValue(panes, 'separatorColor', VELA_DARK_DEFAULTS.separatorColor),
    crosshairColor: stringValue(crosshair, 'color', VELA_DARK_DEFAULTS.crosshairColor),
    crosshairLabelBackground: stringValue(crosshair, 'labelBackground', VELA_DARK_DEFAULTS.crosshairLabelBackground),
    crosshairOpacity: numberValue(crosshair, 'opacity', VELA_DARK_DEFAULTS.crosshairOpacity),
    crosshairWidth: numberValue(crosshair, 'width', VELA_DARK_DEFAULTS.crosshairWidth),
    crosshairStyle: (['solid', 'dashed', 'dotted'].includes(crosshairStyle) ? crosshairStyle : 'dashed') as CrosshairLineStyle,
    marginTop: numberValue(margins, 'top', VELA_DARK_DEFAULTS.marginTop),
    marginBottom: numberValue(margins, 'bottom', VELA_DARK_DEFAULTS.marginBottom),
    marginRight: numberValue(margins, 'right', VELA_DARK_DEFAULTS.marginRight),
    lineWidth: numberValue(line, 'width', VELA_DARK_DEFAULTS.lineWidth),
    areaWidth: numberValue(area, 'width', VELA_DARK_DEFAULTS.areaWidth),
    baselineWidth: numberValue(baseline, 'width', VELA_DARK_DEFAULTS.baselineWidth),
    baselineLevel: numberValue(baseline, 'baselineLevel', VELA_DARK_DEFAULTS.baselineLevel),
  };
}

export function chartStyleFromRenderer(style: string, configValue: unknown): ChartStyle {
  if (style === 'candles') {
    const candles = child(dict(configValue), 'candles');
    if (candles?.bodyVisible === false) return 'hollow';
  }
  const styles: ChartStyle[] = ['candles', 'bars', 'line', 'area', 'baseline', 'heikinashi', 'footprint'];
  return styles.includes(style as ChartStyle) ? style as ChartStyle : 'candles';
}

export function configPatch(key: AppearanceKey, value: string | number | boolean): Dict {
  switch (key) {
    case 'background': return { layout: { background: value } };
    case 'textColor': return { layout: { textColor: value } };
    case 'fontSize': return { layout: { fontSize: value } };
    case 'gridVertVisible': return { grid: { vertLines: { visible: value } } };
    case 'gridVertColor': return { grid: { vertLines: { color: value } } };
    case 'gridHorzVisible': return { grid: { horzLines: { visible: value } } };
    case 'gridHorzColor': return { grid: { horzLines: { color: value } } };
    case 'upColor': return { candles: { upColor: value } };
    case 'downColor': return { candles: { downColor: value } };
    case 'borderVisible': return { candles: { borderVisible: value } };
    case 'borderUpColor': return { candles: { borderUpColor: value } };
    case 'borderDownColor': return { candles: { borderDownColor: value } };
    case 'wickVisible': return { candles: { wickVisible: value } };
    case 'wickUpColor': return { candles: { wickUpColor: value } };
    case 'wickDownColor': return { candles: { wickDownColor: value } };
    case 'barUpColor': return { bars: { upColor: value } };
    case 'barDownColor': return { bars: { downColor: value } };
    case 'lineColor': return { line: { color: value } };
    case 'areaLineColor': return { area: { lineColor: value } };
    case 'areaFillColor': return { area: { topColor: alphaColor(String(value), 0.28), bottomColor: alphaColor(String(value), 0.02) } };
    case 'baselineUpColor': return { baseline: { topLineColor: value, topFillColor: alphaColor(String(value), 0.25), topFillColor2: alphaColor(String(value), 0.05) } };
    case 'baselineDownColor': return { baseline: { bottomLineColor: value, bottomFillColor: alphaColor(String(value), 0.25), bottomFillColor2: alphaColor(String(value), 0.05) } };
    case 'scaleMode': return { priceScale: { mode: value } };
    case 'scaleLog': return { priceScale: { log: value } };
    case 'invertScale': return { priceScale: { invert: value } };
    case 'priceOnly': return { priceScale: { priceOnly: value } };
    case 'priceLabels': return { priceScale: { labelsVisible: value } };
    case 'currentPriceLine': return { priceScale: { currentPriceLine: value } };
    case 'priceLabel': return { priceScale: { priceLabel: value } };
    case 'countdown': return { priceScale: { countdown: value } };
    case 'axisBorderColor': return { priceScale: { borderColor: value } };
    case 'separatorColor': return { panes: { separatorColor: value } };
    case 'crosshairColor': return { crosshair: { color: value } };
    case 'crosshairLabelBackground': return { crosshair: { labelBackground: value } };
    case 'crosshairOpacity': return { crosshair: { opacity: value } };
    case 'crosshairWidth': return { crosshair: { width: value } };
    case 'crosshairStyle': return { crosshair: { style: value } };
    case 'marginTop': return { margins: { top: value } };
    case 'marginBottom': return { margins: { bottom: value } };
    case 'marginRight': return { margins: { right: value } };
    case 'lineWidth': return { line: { width: value } };
    case 'areaWidth': return { area: { width: value } };
    case 'baselineWidth': return { baseline: { width: value } };
    case 'baselineLevel': return { baseline: { baselineLevel: value } };
  }
}

export function resetAppearancePatch(): Dict {
  const d = VELA_DARK_DEFAULTS;
  return {
    layout: { background: d.background, textColor: d.textColor, fontSize: d.fontSize },
    grid: { vertLines: { visible: d.gridVertVisible, color: d.gridVertColor }, horzLines: { visible: d.gridHorzVisible, color: d.gridHorzColor } },
    crosshair: { color: d.crosshairColor, width: d.crosshairWidth, style: d.crosshairStyle, opacity: d.crosshairOpacity, labelBackground: d.crosshairLabelBackground },
    priceScale: { mode: d.scaleMode, log: d.scaleLog, invert: d.invertScale, priceOnly: d.priceOnly, labelsVisible: d.priceLabels, currentPriceLine: d.currentPriceLine, priceLabel: d.priceLabel, countdown: d.countdown, borderColor: d.axisBorderColor },
    panes: { separatorColor: d.separatorColor },
    margins: { top: d.marginTop, bottom: d.marginBottom, right: d.marginRight },
    candles: { upColor: d.upColor, downColor: d.downColor, bodyVisible: true, borderVisible: d.borderVisible, borderUpColor: d.borderUpColor, borderDownColor: d.borderDownColor, wickVisible: d.wickVisible, wickUpColor: d.wickUpColor, wickDownColor: d.wickDownColor },
    bars: { upColor: d.barUpColor, downColor: d.barDownColor },
    line: { color: d.lineColor, width: d.lineWidth },
    area: { lineColor: d.areaLineColor, width: d.areaWidth, topColor: alphaColor(d.areaFillColor, 0.28), bottomColor: alphaColor(d.areaFillColor, 0.02) },
    baseline: { topLineColor: d.baselineUpColor, bottomLineColor: d.baselineDownColor, topFillColor: alphaColor(d.baselineUpColor, 0.25), topFillColor2: alphaColor(d.baselineUpColor, 0.05), bottomFillColor: alphaColor(d.baselineDownColor, 0.25), bottomFillColor2: alphaColor(d.baselineDownColor, 0.05), width: d.baselineWidth, baselineLevel: d.baselineLevel },
  };
}
