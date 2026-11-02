export type InstrumentSearchResult = {
  provider: string;
  symbol: string;
  instrumentId: string;
  name: string;
  assetClass: string;
  instrumentType: string;
  exchange?: string | null;
  quoteCurrency?: string | null;
  contractExpiry?: string | null;
  delayMs?: number | null;
  dataStatus?: string | null;
  identity: string;
  aliases?: unknown[];
};

export type WatchlistItem = InstrumentSearchResult;

export const watchlistKey = 'deplyzeview.workspace.watchlist.v1';
export const rightPanelKey = 'deplyzeview.workspace.right-panel.v1';
const supportedProviders = new Set(['binance', 'coinbase', 'hyperliquid', 'oanda', 'narwhal', 'finzdata']);

const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

export function instrumentIdentity(item: Pick<InstrumentSearchResult, 'provider' | 'instrumentId' | 'instrumentType' | 'contractExpiry'>) {
  return [item.provider.toLowerCase(), item.instrumentType.toLowerCase(), item.instrumentId.toUpperCase(), item.contractExpiry ?? ''].join('|');
}

export function readWatchlist(storage: Pick<Storage, 'getItem'>): WatchlistItem[] {
  try {
    const parsed = JSON.parse(storage.getItem(watchlistKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((raw): WatchlistItem[] => {
      if (!raw || typeof raw !== 'object') return [];
      const provider = text(raw.provider).toLowerCase();
      const symbol = text(raw.symbol).trim();
      const instrumentId = text(raw.instrumentId, symbol).trim();
      if (!supportedProviders.has(provider) || !symbol || !instrumentId) return [];
      const item: WatchlistItem = {
        provider, symbol, instrumentId,
        name: text(raw.name, symbol),
        assetClass: text(raw.assetClass, 'other').toLowerCase(),
        instrumentType: text(raw.instrumentType, 'unknown').toLowerCase(),
        exchange: typeof raw.exchange === 'string' ? raw.exchange : null,
        quoteCurrency: typeof raw.quoteCurrency === 'string' ? raw.quoteCurrency : null,
        contractExpiry: typeof raw.contractExpiry === 'string' ? raw.contractExpiry : null,
        delayMs: typeof raw.delayMs === 'number' && Number.isFinite(raw.delayMs) ? raw.delayMs : null,
        dataStatus: typeof raw.dataStatus === 'string' ? raw.dataStatus : null,
        identity: '',
        aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
      };
      item.identity = instrumentIdentity(item);
      if (seen.has(item.identity)) return [];
      seen.add(item.identity);
      return [item];
    });
  } catch { return []; }
}

export function writeWatchlist(storage: Pick<Storage, 'setItem'>, items: WatchlistItem[]): boolean {
  try { storage.setItem(watchlistKey, JSON.stringify(items)); return true; }
  catch { return false; }
}

export function addWatchlistItem(items: WatchlistItem[], item: InstrumentSearchResult): WatchlistItem[] {
  const identity = instrumentIdentity(item);
  if (items.some(existing => existing.identity === identity)) return items;
  return [...items, { ...item, identity }];
}
