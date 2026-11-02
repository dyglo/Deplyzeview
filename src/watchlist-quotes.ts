import { RustMarketDataProvider } from './data-provider';
import type { TradeVenue } from './footprint';
import type { WatchlistItem } from './watchlist';
import { buildWatchlistQuote, type WatchlistQuote } from './watchlist-quote-math';

export { buildWatchlistQuote } from './watchlist-quote-math';
export type { DailyBar, WatchlistQuote } from './watchlist-quote-math';

export async function fetchWatchlistQuote(item: WatchlistItem): Promise<WatchlistQuote | null> {
  const provider = new RustMarketDataProvider(item.provider as TradeVenue);
  const [bars, liveQuote] = await Promise.all([
    provider.getBars(item.symbol, '1D', { limit: 3 }).catch(() => []),
    provider.getQuote(item.symbol).catch(() => undefined),
  ]);
  return buildWatchlistQuote(item, bars, liveQuote);
}
