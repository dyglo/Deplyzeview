import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { registerChartType, registerRendererLayer, type RendererLayerArgs, type SeriesDataEngine, type SeriesDataEngineHost } from '@luxalgo/vela/plugin';
import { formatVolume } from './volume-utils.mjs';

type Level = { bid: number; ask: number; bidQuote: number; askQuote: number };
type BarFootprint = { time: number; levels: Record<string, Level> };
type FootprintData = { bars: BarFootprint[]; step: number; ticksPerRow: number };
export type FootprintMode = 'split' | 'delta' | 'total';
export type FootprintUnit = 'quote' | 'coin';
export type TradeVenue = 'binance' | 'coinbase' | 'hyperliquid' | 'oanda' | 'narwhal' | 'finzdata';
export const isGatewayVenue = (venue: TradeVenue) => ['oanda', 'narwhal', 'finzdata'].includes(venue);
export type FeedHealth = { venue: string; instrument: string; status: string; lastMessageMs?: number | null; coverageStartMs?: number | null; coverageEndMs?: number | null; tradesStored: number; gapsDetected: number; gapDetectionAvailable: boolean; quoteCurrency?: string; historyNote: string; lastError?: string | null };
export type FootprintHistory = { venue: string; instrument: string; bars: Array<{ time: number; levels: Array<Level & { price: number }> }>; step: number; ticksPerRow: number; coverageStartMs?: number | null; coverageEndMs?: number | null; trades: number; sourceEventIds: string[]; gapsDetected: number; historyNote: string; quoteCurrency: string };
type BucketUpdate = { venue: string; instrument: string; barTime: number; price: number; bid: number; ask: number; bidQuote: number; askQuote: number; sourceEventId: string };

let mode: FootprintMode = 'split';
let unit: FootprintUnit = 'quote';
let ticksPerRow = 15;
let activeVenue: TradeVenue = 'binance';
let healthSink: ((health: FeedHealth) => void) | undefined;
const activeRestarts = new Set<() => void>();
const activePainters = new Set<() => void>();

export function setFootprintMode(next: FootprintMode) { mode = next; for (const repaint of activePainters) repaint(); }
export function setFootprintUnit(next: FootprintUnit) { unit = next; for (const repaint of activePainters) repaint(); }
export function setFootprintTicks(value: number) {
  ticksPerRow = Math.max(1, Math.min(100, Math.round(value)));
  for (const restart of activeRestarts) restart();
}
export function setTradeVenue(next: TradeVenue) { activeVenue = next; }
export function publishFeedHealth(health: FeedHealth) { healthSink?.(health); }
export function setFeedHealthSink(sink: (health: FeedHealth) => void) { healthSink = sink; }

function intervalMilliseconds(timeframe: string | number): number {
  const text = String(timeframe);
  if (/^\d+[dD]$/.test(text)) return Number.parseInt(text, 10) * 86_400_000;
  if (/^\d+[wW]$/.test(text)) return Number.parseInt(text, 10) * 7 * 86_400_000;
  if (/^\d+[mM]$/.test(text)) return Number.parseInt(text, 10) * 30 * 86_400_000;
  return Math.max(1, Number.parseInt(text, 10) || 1) * 60_000;
}
function toLayerData(history: FootprintHistory): FootprintData {
  return { bars: history.bars.map((bar) => ({ time: bar.time, levels: Object.fromEntries(bar.levels.map((level) => [String(level.price), { bid: level.bid, ask: level.ask, bidQuote: level.bidQuote, askQuote: level.askQuote }])) })), step: history.step, ticksPerRow: history.ticksPerRow };
}

function createFootprintEngine(): SeriesDataEngine {
  let host: SeriesDataEngineHost | undefined;
  let active = false;
  let intervalMs = 60_000;
  let venue = activeVenue;
  let instrument = '';
  let rowStep = 0.01 * ticksPerRow;
  let payload: FootprintData = { bars: [], step: rowStep, ticksPerRow };
  const data = new Map<number, Map<number, Level>>();
  const repaint = () => { if (active && host) host.pushData(payload); };
  const processedEventIds = new Set<string>();
  let historyLoaded = false;
  let pendingUpdates: BucketUpdate[] = [];
  let unlistenTrades: UnlistenFn | undefined;
  let unlistenHealth: UnlistenFn | undefined;
  let restartRequested = false;
  const matching = (v: string, s: string) => v.toLowerCase() === venue && s.toUpperCase() === instrument;
  const flush = () => {
    if (!active || !host) return;
    const bars = [...data.entries()].map(([time, levels]) => ({ time, levels: Object.fromEntries([...levels.entries()].map(([price, value]) => [String(price), { ...value }])) })).sort((a, b) => a.time - b.time);
    payload = { bars, step: rowStep, ticksPerRow };
    host.pushData(payload);
  };
  const mergeUpdate = (event: BucketUpdate) => {
    if (!matching(event.venue, event.instrument) || processedEventIds.has(event.sourceEventId)) return;
    processedEventIds.add(event.sourceEventId);
    if (processedEventIds.size > 100_000) processedEventIds.delete(processedEventIds.values().next().value!);
    let levels = data.get(event.barTime);
    if (!levels) data.set(event.barTime, levels = new Map());
    const level = levels.get(event.price) ?? { bid: 0, ask: 0, bidQuote: 0, askQuote: 0 };
    level.bid += event.bid; level.ask += event.ask;
    level.bidQuote += event.bidQuote; level.askQuote += event.askQuote;
    levels.set(event.price, level);
    if (data.size > 2_000) data.delete(Math.min(...data.keys()));
    flush();
  };
  const removeListeners = async () => {
    unlistenTrades?.(); unlistenTrades = undefined;
    unlistenHealth?.(); unlistenHealth = undefined;
  };
  const restart = async () => {
    if (!active || !host) return;
    restartRequested = true;
    await removeListeners();
    try { await invoke('unsubscribe_market_feed', { venue, instrument }); } catch { /* The feed may not have started yet. */ }
    if (!active) return;
    restartRequested = false;
    await initialize();
  };
  const initialize = async () => {
    if (isGatewayVenue(venue)) {
      healthSink?.({ venue, instrument, status: 'unavailable', tradesStored: 0, gapsDetected: 0, gapDetectionAvailable: false, historyNote: 'This provider has no aggressor-side trade feed. Quote tick counts and candle volume cannot supply a volume footprint.' });
      flush();
      return;
    }
    if (!active || !host || !(window as any).__TAURI_INTERNALS__) {
      healthSink?.({ venue, instrument, status: 'desktop-backend-required', tradesStored: 0, gapsDetected: 0, gapDetectionAvailable: false, historyNote: 'The Rust market-data service is available in the Tauri desktop app.' });
      flush();
      return;
    }
    historyLoaded = false;
    pendingUpdates = [];
    try {
      // Buffer live buckets until the durable history snapshot is applied; event IDs prevent double-counting.
      unlistenTrades = await listen<BucketUpdate>('trade-bucket-update', (event) => { if (historyLoaded) mergeUpdate(event.payload); else pendingUpdates.push(event.payload); });
      unlistenHealth = await listen<FeedHealth>('feed-health', (event) => { if (matching(event.payload.venue, event.payload.instrument)) healthSink?.(event.payload); });
      const info = await invoke<{ tickSize: number; historyNote: string; gapDetectionAvailable: boolean }>('subscribe_market_feed', { venue, instrument, barIntervalMs: intervalMs, ticksPerRow });
      rowStep = info.tickSize * ticksPerRow;
      const toMs = Date.now();
      const history = await invoke<FootprintHistory>('query_footprint_history', { venue, instrument, fromMs: toMs - 60 * 60_000, toMs, barIntervalMs: intervalMs, ticksPerRow });
      if (!active || restartRequested) return;
      data.clear();
      processedEventIds.clear();
      for (const id of history.sourceEventIds) processedEventIds.add(id);
      for (const bar of history.bars) data.set(bar.time, new Map(bar.levels.map((level) => [level.price, { bid: level.bid, ask: level.ask, bidQuote: level.bidQuote, askQuote: level.askQuote }])));
      while (data.size > 2_000) data.delete(Math.min(...data.keys()));
      rowStep = history.step;
      historyLoaded = true;
      for (const update of pendingUpdates) mergeUpdate(update);
      pendingUpdates = [];
      healthSink?.({ venue: history.venue, instrument: history.instrument, status: 'live', coverageStartMs: history.coverageStartMs, coverageEndMs: history.coverageEndMs, tradesStored: history.trades, gapsDetected: history.gapsDetected, gapDetectionAvailable: info.gapDetectionAvailable, quoteCurrency: history.quoteCurrency, historyNote: history.historyNote });
      flush();
    } catch (error) {
      historyLoaded = true;
      pendingUpdates = [];
      healthSink?.({ venue, instrument, status: 'error', tradesStored: 0, gapsDetected: 0, gapDetectionAvailable: false, historyNote: String(error) });
    }
  };
  return {
    start(nextHost: SeriesDataEngineHost) {
      host = nextHost; active = true; venue = activeVenue;
      instrument = host.symbol.toUpperCase().split(':').pop()!.replace(/[^A-Z0-9:/_-]/g, '');
      intervalMs = intervalMilliseconds(host.timeframe);
      data.clear(); payload = { bars: [], step: rowStep, ticksPerRow };
      activeRestarts.add(restart); activePainters.add(repaint);
      void initialize();
    },
    suspend() { active = false; activeRestarts.delete(restart); void removeListeners(); },
    resume() { if (host) { active = true; activeRestarts.add(restart); activePainters.add(repaint); void initialize(); } },
    stop() { active = false; activeRestarts.delete(restart); activePainters.delete(repaint); void removeListeners(); void invoke('unsubscribe_market_feed', { venue, instrument }).catch(() => undefined); data.clear(); processedEventIds.clear(); pendingUpdates = []; },
  };
}

registerChartType({ id: 'footprint', label: 'Volume Footprint', basePainting: 'none', dataEngine: createFootprintEngine });
registerRendererLayer({
  id: 'footprint', placement: 'above-data', repaintOnCursor: true,
  create() {
    let canvas: HTMLCanvasElement | undefined;
    return {
      mount(element) { canvas = element; },
      render(args: RendererLayerArgs) {
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;
        const dpr = args.coords.dpr || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, width, height);
        if (args.priceStyle !== 'footprint') return;
        const payload = args.data as FootprintData | undefined;
        if (!payload?.bars.length || !args.bars.length) {
          context.fillStyle = args.theme.textColor; context.font = '10px Inter, sans-serif'; context.fillText((window as any).__TAURI_INTERNALS__ ? 'Waiting for Rust market-data service…' : 'Open the desktop app to start the Rust market-data service.', 18, 24); return;
        }
        const byTime = new Map<number, BarFootprint>(payload.bars.map((bar): [number, BarFootprint] => [bar.time, bar]));
        const maxTotal = Math.max(1, ...payload.bars.flatMap((bar) => Object.entries(bar.levels).map(([price, value]) => unit === 'quote' ? value.bidQuote + value.askQuote : value.bid + value.ask)));
        const step = payload.step || 0.01;
        const interval = args.coords.barInterval;
        const visible: Array<{ x: number; width: number; levels: Array<[number, Level]> }> = [];
        args.bars.forEach((bar, index) => {
          const footprint = byTime.get(Math.floor(bar.time / interval) * interval);
          if (!footprint) return;
          const x0 = args.coords.logicalToX(index - 0.42); const x1 = args.coords.logicalToX(index + 0.42);
          const x = Math.min(x0, x1); const barWidth = Math.max(9, Math.abs(x1 - x0));
          if (x + barWidth < 0 || x > width) return;
          visible.push({ x, width: barWidth, levels: Object.entries(footprint.levels).map(([price, value]) => [Number(price), value] as [number, Level]).sort((a, b) => b[0] - a[0]) });
        });
        for (const candle of visible) {
          const half = mode === 'split' ? candle.width / 2 : candle.width;
          for (const [price, value] of candle.levels) {
            const top = args.coords.priceToY(price + step / 2, args.scale, args.bounds);
            const bottom = args.coords.priceToY(price - step / 2, args.scale, args.bounds);
            const cellTop = Math.max(args.bounds.top, Math.min(top, bottom));
            const cellHeight = Math.max(10, Math.min(args.bounds.height, Math.abs(bottom - top)));
            if (cellTop + cellHeight < args.bounds.top || cellTop > args.bounds.top + args.bounds.height) continue;
            const bid = unit === 'quote' ? value.bidQuote : value.bid;
            const ask = unit === 'quote' ? value.askQuote : value.ask;
            const total = bid + ask;
            if (mode === 'split') {
              context.fillStyle = `rgba(119,127,137,${0.2 + Math.min(0.65, bid / maxTotal * 1.2)})`; context.fillRect(candle.x, cellTop, half - 1, cellHeight - 1);
              context.fillStyle = `rgba(177,100,79,${0.2 + Math.min(0.65, ask / maxTotal * 1.2)})`; context.fillRect(candle.x + half, cellTop, half - 1, cellHeight - 1);
              if (cellHeight >= 12 && half >= 22) { context.fillStyle = args.theme.textColor; context.font = '9px "Roboto Mono",monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(formatVolume(bid), candle.x + half / 2, cellTop + cellHeight / 2); context.fillText(formatVolume(ask), candle.x + half + half / 2, cellTop + cellHeight / 2); }
            } else if (mode === 'delta') {
              const delta = ask - bid; context.fillStyle = delta >= 0 ? `rgba(188,104,82,${0.22 + Math.abs(delta) / Math.max(1,total) * 0.68})` : `rgba(104,128,145,${0.22 + Math.abs(delta) / Math.max(1,total) * 0.68})`; context.fillRect(candle.x, cellTop, candle.width - 1, cellHeight - 1);
              if (cellHeight >= 12 && candle.width >= 23) { context.fillStyle = args.theme.textColor; context.font = '9px "Roboto Mono",monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(formatVolume(delta), candle.x + candle.width / 2, cellTop + cellHeight / 2); }
            } else {
              context.fillStyle = `rgba(153,158,164,${0.15 + Math.min(1,total / maxTotal) * 0.68})`; context.fillRect(candle.x, cellTop, candle.width - 1, cellHeight - 1);
              if (cellHeight >= 12 && candle.width >= 23) { context.fillStyle = args.theme.textColor; context.font = '9px "Roboto Mono",monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(formatVolume(total), candle.x + candle.width / 2, cellTop + cellHeight / 2); }
            }
          }
        }
        context.textAlign = 'start';
      },
      destroy() { canvas = undefined; },
    };
  },
});
