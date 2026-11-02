import type { InstrumentSearchResult } from './watchlist';

export function normalizeSearchTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchesInstrumentQuery(item: InstrumentSearchResult, value: string) {
  const term = normalizeSearchTerm(value);
  if (!term) return false;
  const fields = [
    item.symbol, item.name, item.assetClass, item.instrumentType, item.exchange ?? '',
    ...(item.aliases ?? []).map(alias => typeof alias === 'string' ? alias : JSON.stringify(alias)),
  ];
  return normalizeSearchTerm(fields.join(' ')).includes(term);
}

function suggestionRank(item: InstrumentSearchResult, term: string) {
  const symbol = normalizeSearchTerm(item.symbol);
  const name = normalizeSearchTerm(item.name);
  if (symbol === term) return 0;
  if (symbol.startsWith(term)) return 1;
  if (name.startsWith(term)) return 2;
  if (symbol.includes(term)) return 3;
  if (name.includes(term)) return 4;
  return 5;
}

export function sortInstrumentSuggestions(items: InstrumentSearchResult[], value: string) {
  const term = normalizeSearchTerm(value);
  return [...items].sort((a, b) => suggestionRank(a, term) - suggestionRank(b, term)
    || a.symbol.localeCompare(b.symbol)
    || a.provider.localeCompare(b.provider));
}

export function mergeSearchResults(existing: InstrumentSearchResult[], incoming: InstrumentSearchResult[], limit = 3000) {
  const merged = new Map(existing.map(item => [item.identity, item]));
  for (const item of incoming) merged.set(item.identity, item);
  return [...merged.values()].slice(-limit);
}
