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

export type WatchlistCollection = { activeId: string; lists: { id: string; name: string; items: WatchlistItem[] }[] };
export const watchlistsKey = 'deplyzeview.workspace.watchlists.v1';
export function readWatchlists(storage: Pick<Storage, 'getItem'>): WatchlistCollection {
  try {
    const raw = JSON.parse(storage.getItem(watchlistsKey) ?? 'null');
    if (Array.isArray(raw?.lists)) {
      const ids = new Set<string>();
      const lists = raw.lists.flatMap((list: any) => {
        if (typeof list?.id !== 'string' || ids.has(list.id) || typeof list.name !== 'string' || !list.name.trim()) return [];
        ids.add(list.id);
        return [{ id: list.id, name: list.name.trim().slice(0, 40), items: readWatchlist({ getItem: () => JSON.stringify(list.items) }) }];
      });
      if (lists.length) return { lists, activeId: lists.some((list: { id: string }) => list.id === raw.activeId) ? raw.activeId : lists[0].id };
    }
  } catch { /* Keep the original saved watchlist as a migration fallback. */ }
  return { activeId: 'default', lists: [{ id: 'default', name: 'Watchlist', items: readWatchlist(storage) }] };
}
export function watchlistCategory(item: WatchlistItem): string {
  if (/future/.test(item.instrumentType)) return 'Futures';
  if (/index|indices/.test(item.assetClass)) return 'Indices';
  if (/forex|fx/.test(item.assetClass)) return 'Forex';
  if (/commodity|commodities|metal|energy/.test(item.assetClass)) return 'Commodities';
  if (/crypto/.test(item.assetClass)) return 'Crypto';
  if (/stock|equity|equities/.test(item.assetClass)) return 'Stocks';
  return 'Other';
}
export function reorderWatchlist(items: WatchlistItem[], source: string, target: string): WatchlistItem[] {
  const from = items.findIndex(item => item.identity === source);
  const to = items.findIndex(item => item.identity === target);
  if (from < 0 || to < 0 || from === to || watchlistCategory(items[from]) !== watchlistCategory(items[to])) return items;
  const next = [...items];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
export function formatWatchlistNumber(value: number | null | undefined, item: WatchlistItem, signed = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const decimals = watchlistCategory(item) === 'Forex' ? (/JPY/.test(item.symbol) ? 3 : 5) : /XAU|XAG/.test(item.symbol) ? 3 : Math.abs(value) > 0 && Math.abs(value) < 1 ? 5 : 2;
  return `${signed && value !== 0 ? value > 0 ? '+' : '−' : ''}${new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(signed ? Math.abs(value) : value)}`;
}

export function formatWatchlistPriceParts(value: number | null | undefined, item: WatchlistItem): { main: string; pip?: string } {
  const full = formatWatchlistNumber(value, item, false);
  if (full === '—') return { main: '—' };
  const cat = watchlistCategory(item);
  const isForex = cat === 'Forex';
  const isMetal = /XAU|XAG/.test(item.symbol);
  if (isForex || isMetal) {
    const parts = full.split('.');
    if (parts.length === 2 && parts[1].length >= 3) {
      return {
        main: `${parts[0]}.${parts[1].slice(0, -1)}`,
        pip: parts[1].slice(-1)
      };
    }
  }
  return { main: full };
}
