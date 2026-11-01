export const chartStyles = [
  { id: 'candles', label: 'Candles' }, { id: 'hollow', label: 'Hollow Candles' },
  { id: 'bars', label: 'Bars (OHLC)' }, { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' }, { id: 'baseline', label: 'Baseline' },
  { id: 'columns', label: 'Columns' }, { id: 'heikinashi', label: 'Heikin Ashi' },
  { id: 'footprint', label: 'Volume Footprint' },
] as const;
export type ChartStyleId = typeof chartStyles[number]['id'];
export function isChartStyle(value: unknown): value is ChartStyleId {
  return chartStyles.some(style => style.id === value);
}
