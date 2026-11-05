import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TradeVenue } from './footprint';
import { publishFeedHealth, isGatewayVenue } from './footprint';
import { mergeObservedTradeVolume, shouldApplyTradeAfterSnapshot } from './volume-utils.mjs';

type Ohlcv = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type MarketBar = Ohlcv;
type TradeEvent = { venue: string; instrument: string; timestampMs: number; price: number; size: number; aggressorSide: 'buy' | 'sell'; sourceEventId: string };
type BarRange = { from?: number; to?: number; limit?: number };
type GatewayBars = { bars: Ohlcv[]; instrument: { quoteCurrency?: string; delayMs?: number; instrumentType: string }; delivery: string };
export type GatewayQuote = { price: number; time: number; delayMs?: number; freshness: 'stale' | 'delayed' | 'live' | 'market_closed'; marketSession?: string };

function intervalMs(timeframe: string) {
  if (/^\d+[dD]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 86_400_000;
  if (/^\d+[wW]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 7 * 86_400_000;
  if (/^\d+[mM]$/.test(timeframe)) return Number.parseInt(timeframe, 10) * 30 * 86_400_000;
  return Math.max(1, Number.parseInt(timeframe, 10) || 1) * 60_000;
}

/** Vela-facing OHLCV adapter. All venue HTTP and sockets remain inside the Rust Tauri backend. */
export class RustMarketDataProvider {
  private readonly candleCache = new Map<string, Map<number, Ohlcv>>();
  private readonly candleSnapshotAt = new Map<string, number>();
  constructor(private readonly venue: TradeVenue) {}

  info() {
    const gateway = isGatewayVenue(this.venue);
    return { name: this.venue, displayName: `${this.venue} (Rust ${gateway ? 'gateway' : 'feed'})`, supportedTimeframes: this.venue === 'narwhal' || this.venue === 'finzdata' ? ['1D'] : undefined, capabilities: { enumerate: false, stream: !gateway, symbolInfo: gateway } };
  }

  async getSymbolInfo(ticker: string) {
    if (!isGatewayVenue(this.venue)) return undefined;
    const instrument = await invoke<{ instrumentType: string; quoteCurrency?: string; tickSize?: number; exchange?: string }>('get_remote_market_data', { provider: this.venue, action: 'instrument', instrument: ticker });
    return { ticker, type: instrument.instrumentType, currency: instrument.quoteCurrency, mintick: instrument.tickSize, prefix: instrument.exchange ?? this.venue.toUpperCase(), timezone: 'Etc/UTC' };
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<Ohlcv[]> {
    if (!(window as any).__TAURI_INTERNALS__) throw new Error('Run DeplyzeView in its Tauri desktop shell to access the Rust market-data service.');
    if (isGatewayVenue(this.venue)) {
      try {
        const result = await invoke<GatewayBars>('get_remote_market_data', { provider: this.venue, action: 'bars', instrument: ticker.toUpperCase(), timeframe, fromMs: range.from ?? null, toMs: range.to ?? null, limit: range.limit ?? 500 });
        publishFeedHealth({ venue: this.venue, instrument: ticker.toUpperCase(), status: this.venue === 'oanda' ? 'candle-polling' : 'historical', tradesStored: 0, gapsDetected: 0, gapDetectionAvailable: false, quoteCurrency: result.instrument.quoteCurrency,
          historyNote: this.venue === 'finzdata' ? 'Daily individual-contract history only. Provider volume and open interest; no live feed or trade footprint.' : this.venue === 'narwhal' ? `Unadjusted front-month futures; roll gaps; daily history only. Quotes ${result.instrument.delayMs ? 'delayed 15 minutes' : 'subject to plan'}. No individual expiry or trade footprint.` : 'OANDA midpoint candles; refreshed every 10 seconds. Tick counts are not traded volume. No trade footprint.' });
        return result.bars.map(bar => ({ ...bar, volume: typeof bar.volume === 'number' ? bar.volume : undefined }));
      } catch (error) {
        publishFeedHealth({ venue: this.venue, instrument: ticker.toUpperCase(), status: 'error', tradesStored: 0, gapsDetected: 0, gapDetectionAvailable: false, historyNote: String(error) });
        throw error;
      }
    }
    const bars = await invoke<MarketBar[]>('get_market_bars', {
      venue: this.venue,
      instrument: ticker.toUpperCase(),
      timeframe,
      fromMs: range.from ?? null,
      toMs: range.to ?? null,
      limit: range.limit ?? 500,
    });
    const normalized = bars.map((bar) => ({
      ...bar,
      time: Number(bar.time),
      volume: typeof bar.volume === 'number' && Number.isFinite(bar.volume) ? bar.volume : undefined,
    }));
    const key = `${ticker.toUpperCase()}|${timeframe}`;
    this.candleSnapshotAt.set(key, Date.now());
    const cache = this.candleCache.get(key) ?? new Map<number, Ohlcv>();
    for (const bar of normalized) cache.set(bar.time, bar);
    this.candleCache.set(key, cache);
    return normalized;
  }

  async getQuote(ticker: string): Promise<GatewayQuote | undefined> {
    if (this.venue !== 'narwhal') return undefined;
    if (!(window as any).__TAURI_INTERNALS__) throw new Error('Run DeplyzeView in its Tauri desktop shell to access market quotes.');
    return invoke<GatewayQuote>('get_remote_market_data', { provider: this.venue, action: 'quote', instrument: ticker.toUpperCase() });
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: Ohlcv) => void) {
    if (isGatewayVenue(this.venue)) {
      // Fetch authoritative candles: sampled quotes cannot reconstruct broker OHLC.
      let active = true;
      let timer: ReturnType<typeof setTimeout>;
      let failures = 0;
      const refresh = async () => {
        try {
          const bars = await this.getBars(ticker, timeframe, { limit: 3 });
          if (!active) return;
          for (const bar of bars) onBar(bar);
          failures = 0;
        } catch { failures = Math.min(failures + 1, 5); }
        if (active) timer = setTimeout(refresh, Math.min(14_400_000, (this.venue === 'oanda' ? 10_000 : 3_600_000) * 2 ** failures));
      };
      timer = setTimeout(refresh, this.venue === 'oanda' ? 10_000 : 3_600_000);
      return () => { active = false; clearTimeout(timer); };
    }
    const instrument = ticker.toUpperCase();
    const duration = intervalMs(timeframe);
    let active = true;
    let unlisten: UnlistenFn | undefined;
    const subscriberId = crypto.randomUUID();
    let subscriptionRequest: Promise<unknown> | undefined;
    const cacheKey = `${instrument}|${timeframe}`;
    const seenEventIds = new Set<string>();
    const firstCompleteLiveBarTime = Math.ceil(Date.now() / duration) * duration;
    const attach = async () => {
      const remove = await listen<TradeEvent>('normalized-trade', (event) => {
        const trade = event.payload;
        if (!active || trade.venue !== this.venue || trade.instrument.toUpperCase() !== instrument) return;
        if (!shouldApplyTradeAfterSnapshot(trade.timestampMs, this.candleSnapshotAt.get(cacheKey) ?? 0)) return;
        if (seenEventIds.has(trade.sourceEventId)) return;
        seenEventIds.add(trade.sourceEventId);
        if (seenEventIds.size > 100_000) seenEventIds.delete(seenEventIds.values().next().value!);
        const time = Math.floor(trade.timestampMs / duration) * duration;
        // Re-read the map so a history response that lands after subscription setup cannot
        // strand this handler on the pre-history cache instance.
        const forming = this.candleCache.get(cacheKey) ?? new Map<number, Ohlcv>();
        this.candleCache.set(cacheKey, forming);
        const current = forming.get(time);
        const next: Ohlcv = current
          ? { time, open: current.open, high: Math.max(current.high, trade.price), low: Math.min(current.low, trade.price), close: trade.price, volume: mergeObservedTradeVolume(current.volume, trade.size, time, firstCompleteLiveBarTime) }
          : { time, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: mergeObservedTradeVolume(undefined, trade.size, time, firstCompleteLiveBarTime) };
        forming.set(time, next);
        // Retain a bounded cache to preserve the true forming bar across reconnects.
        while (forming.size > 1_600) forming.delete(Math.min(...forming.keys()));
        onBar(next);
      });
      if (!active) { remove(); return; }
      unlisten = remove;
      try {
        subscriptionRequest = invoke('subscribe_market_feed', { venue: this.venue, instrument, barIntervalMs: duration, ticksPerRow: 15, subscriberId });
        await subscriptionRequest;
      } catch { /* Feed health is surfaced by the footprint service and status line. */ }
    };
    void attach();
    return () => {
      active = false;
      unlisten?.();
      const release = () => invoke('unsubscribe_market_feed', { venue: this.venue, instrument, subscriberId }).catch(() => undefined);
      if (subscriptionRequest) void subscriptionRequest.then(release, release);
    };
  }
}
