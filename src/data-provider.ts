import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TradeVenue } from './footprint';

type Ohlcv = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type MarketBar = Ohlcv;
type TradeEvent = { venue: string; instrument: string; timestampMs: number; price: number; size: number; aggressorSide: 'buy' | 'sell'; sourceEventId: string };
type BarRange = { from?: number; to?: number; limit?: number };

function intervalMs(timeframe: string) {
  if (/^\d+[dD]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 86_400_000;
  if (/^\d+[wW]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 7 * 86_400_000;
  if (/^\d+[mM]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 30 * 86_400_000;
  return Math.max(1, Number.parseInt(timeframe, 10) || 1) * 60_000;
}

/** Vela-facing OHLCV adapter. All venue HTTP and sockets remain inside the Rust Tauri backend. */
export class RustMarketDataProvider {
  private readonly candleCache = new Map<string, Map<number, Ohlcv>>();
  constructor(private readonly venue: TradeVenue) {}

  info() {
    return { displayName: `${this.venue} (Rust feed)`, capabilities: { enumerate: false, stream: true, symbolInfo: false } };
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<Ohlcv[]> {
    if (!(window as any).__TAURI_INTERNALS__) throw new Error('Run Vela Terminal in its Tauri desktop shell to access the Rust market-data service.');
    const bars = await invoke<MarketBar[]>('get_market_bars', {
      venue: this.venue,
      instrument: ticker.toUpperCase(),
      timeframe,
      fromMs: range.from ?? null,
      toMs: range.to ?? null,
      limit: range.limit ?? 500,
    });
    const normalized = bars.map((bar) => ({ ...bar, time: Number(bar.time), volume: Number(bar.volume ?? 0) }));
    const key = `${ticker.toUpperCase()}|${timeframe}`;
    const cache = this.candleCache.get(key) ?? new Map<number, Ohlcv>();
    for (const bar of normalized) cache.set(bar.time, bar);
    this.candleCache.set(key, cache);
    return normalized;
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: Ohlcv) => void) {
    const instrument = ticker.toUpperCase();
    const duration = intervalMs(timeframe);
    let active = true;
    let unlisten: UnlistenFn | undefined;
    const cacheKey = `${instrument}|${timeframe}`;
    const forming = this.candleCache.get(cacheKey) ?? new Map<number, Ohlcv>();
    this.candleCache.set(cacheKey, forming);
    void listen<TradeEvent>('normalized-trade', (event) => {
      const trade = event.payload;
      if (!active || trade.venue !== this.venue || trade.instrument.toUpperCase() !== instrument) return;
      const time = Math.floor(trade.timestampMs / duration) * duration;
      const current = forming.get(time);
      const next: Ohlcv = current
        ? { time, open: current.open, high: Math.max(current.high, trade.price), low: Math.min(current.low, trade.price), close: trade.price, volume: (current.volume ?? 0) + trade.size }
        : { time, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.size };
      forming.set(time, next);
      // Retain a bounded cache to preserve the true forming bar across reconnects.
      while (forming.size > 1_600) forming.delete(Math.min(...forming.keys()));
      onBar(next);
    }).then((remove) => { if (active) unlisten = remove; else remove(); });
    void invoke('subscribe_market_feed', { venue: this.venue, instrument, barIntervalMs: duration, ticksPerRow: 15 }).catch(() => undefined);
    return () => {
      active = false;
      unlisten?.();
      void invoke('unsubscribe_market_feed', { venue: this.venue, instrument }).catch(() => undefined);
    };
  }
}
