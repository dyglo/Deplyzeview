import { defaultDrawingTools, readDrawingTools, type DrawingToolPreferences } from './drawing-catalog.ts';
import type { AppTheme } from './chart-theme';
import { parseColor } from './color-utils.ts';
import type { ChartConfig } from '@luxalgo/vela';
import { isChartStyle } from './chart-style-catalog.ts';

export const preferenceKey = 'deplyzeview.workspace.chart.appearance.v1';
// Apply before saved preferences; explicit user colors always take precedence.
export const defaultCandleColors = {
  upColor: '#089981', downColor: '#F23645',
  wickUpColor: '#089981', wickDownColor: '#F23645',
  borderUpColor: '#089981', borderDownColor: '#F23645',
} satisfies Partial<ChartConfig['candles']>;
// Read the previous key once; all subsequent saves use the new app namespace.
const legacyPreferenceKey = 'vela.workspace.chart.appearance.v1';
export type ChartExtras = {
  drawingTools: DrawingToolPreferences;
  theme: AppTheme;
  volume: { visible: boolean; upColor: string; downColor: string; heightPct: number };
  crosshair: 'both' | 'vertical' | 'horizontal' | 'hidden';
};
export const defaultExtras: ChartExtras = {
  drawingTools: defaultDrawingTools(),
  theme: 'dark',
  volume: { visible: true, upColor: '#8a746e', downColor: '#c16f61', heightPct: 20 },
  crosshair: 'both',
};
export type Preferences = { version: 1; config: unknown; extras: ChartExtras };
export function readPreferences(storage: Pick<Storage, 'getItem'>): Preferences | undefined {
  try {
    const saved = JSON.parse(storage.getItem(preferenceKey) ?? storage.getItem(legacyPreferenceKey) ?? 'null');
    if (saved?.version !== 1 || !saved.config || typeof saved.config !== 'object') return;
    const config = saved.config;
    if (!isChartStyle(config.series?.style)) config.series = { ...config.series, style: 'candles' };
    // Upgrade the previous Light template's paper canvas without changing
    // custom canvas colors, dark layouts, or any other chart preferences.
    if (saved.extras?.theme === 'light' && config.layout?.background?.toLowerCase?.() === '#f6f7f9') {
      config.layout.background = '#ffffff';
    }
    const v = saved.extras?.volume;
    const color = (value: unknown, fallback: string) => typeof value === 'string' && parseColor(value) ? value : fallback;
    return { version: 1, config, extras: {
      drawingTools: readDrawingTools(saved.extras?.drawingTools),
      theme: saved.extras?.theme === 'light' ? 'light' : 'dark',
      crosshair: ['both', 'vertical', 'horizontal', 'hidden'].includes(saved.extras?.crosshair) ? saved.extras.crosshair : 'both',
      volume: { visible: typeof v?.visible === 'boolean' ? v.visible : true,
        upColor: color(v?.upColor, defaultExtras.volume.upColor), downColor: color(v?.downColor, defaultExtras.volume.downColor),
        heightPct: typeof v?.heightPct === 'number' && Number.isFinite(v.heightPct) ? Math.max(5, Math.min(50, v.heightPct)) : 20 },
    } };
  } catch { return; }
}
export function writePreferences(storage: Pick<Storage, 'setItem'>, config: ChartConfig, extras: ChartExtras): boolean {
  try { storage.setItem(preferenceKey, JSON.stringify({ version: 1, config, extras })); return true; }
  catch { return false; }
}
