import type { Vela } from '@luxalgo/vela';
import type { NativeIndicatorInfo } from '@luxalgo/vela/plugin';

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\bavg\b/g, 'average');
}
export function findIndicators(catalog: readonly NativeIndicatorInfo[], query: string): NativeIndicatorInfo[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  return catalog.filter(item => {
    const haystack = normalize(`${item.title} ${item.type}`);
    const acronym = item.title.split(/[^a-z0-9]+/i).map(word => word[0] ?? '').join('').toLowerCase();
    return tokens.every(token => haystack.includes(token) || acronym === token);
  }).sort((a, b) => a.title.localeCompare(b.title));
}
export function addCatalogIndicator(chart: Pick<Vela, 'indicators' | 'addNativeIndicator'>, item: NativeIndicatorInfo) {
  if (!item.supported) throw new Error(`${item.title} is unavailable for this market.`);
  const existing = !item.multiInstance && chart.indicators().find(handle => handle.nativeType === item.type);
  if (existing) {
    if (!existing.visible) existing.setVisible(true);
    return { handle: existing, added: false };
  }
  return { handle: chart.addNativeIndicator(item.type), added: true };
}
