import type { GatewayQuote } from './data-provider';
import type { WatchlistItem } from './watchlist';

export type DailyBar = { time: number; open: number; high: number; low: number; close: number };
export type WatchlistQuote = {
  price: number;
  change: number | null;
  changePercent: number | null;
  quoteCurrency: string | null;
  asOf: number;
  freshness: string;
};

export function buildWatchlistQuote(
  item: WatchlistItem,
  bars: DailyBar[],
  liveQuote?: GatewayQuote,
): WatchlistQuote | null {
  const latest = bars[bars.length - 1];
  if ((!latest || !Number.isFinite(latest.close)) && !Number.isFinite(liveQuote?.price)) return null;
  const price = Number.isFinite(liveQuote?.price) ? liveQuote!.price : latest!.close;
  let reference = bars[bars.length - 2];
  if (item.provider === 'narwhal' && liveQuote && latest) {
    const quoteDay = Math.floor(liveQuote.time / 86_400_000);
    const candleDay = Math.floor(latest.time / 86_400_000);
    // Use the prior close when today's daily candle has already started; otherwise
    // the latest completed daily close is the reference for the delayed quote.
    reference = quoteDay === candleDay ? bars[bars.length - 2] : latest;
  }
  const change = reference && Number.isFinite(reference.close) ? price - reference.close : null;
  const changePercent = change !== null && reference && reference.close !== 0
    ? change / reference.close * 100
    : null;
  const freshness = liveQuote
    ? liveQuote.freshness === 'delayed' ? 'Delayed quote'
      : liveQuote.freshness === 'stale' ? 'Stale quote'
        : liveQuote.freshness === 'market_closed' ? 'Market closed' : 'Live quote'
    : item.dataStatus ?? (item.provider === 'finzdata' ? 'Historical-only · Daily' : 'Daily bar');
  return {
    price,
    change,
    changePercent,
    quoteCurrency: item.quoteCurrency ?? null,
    asOf: liveQuote?.time ?? latest!.time,
    freshness,
  };
}
