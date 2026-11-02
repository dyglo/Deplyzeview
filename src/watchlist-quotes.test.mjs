import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWatchlistQuote } from './watchlist-quote-math.ts';

const item = (provider = 'binance', overrides = {}) => ({
  provider, symbol: 'BTCUSDT', instrumentId: 'BTCUSDT', name: 'Bitcoin / Tether',
  assetClass: 'crypto', instrumentType: 'spot', quoteCurrency: 'USDT',
  dataStatus: 'Real-time', identity: `${provider}|spot|BTCUSDT|`, ...overrides,
});
const bars = [
  { time: Date.UTC(2026, 10, 1), open: 100, high: 105, low: 99, close: 100 },
  { time: Date.UTC(2026, 10, 2), open: 100, high: 110, low: 99, close: 110 },
];

test('daily snapshot calculates absolute and percentage change from prior close', () => {
  const quote = buildWatchlistQuote(item(), bars);
  assert.equal(quote.price, 110);
  assert.equal(quote.change, 10);
  assert.equal(quote.changePercent, 10);
  assert.equal(quote.quoteCurrency, 'USDT');
  assert.equal(quote.freshness, 'Real-time');
});

test('Narwhal uses its actual delayed quote and the appropriate prior close', () => {
  const currentDay = Date.UTC(2026, 10, 2, 12);
  const quote = buildWatchlistQuote(item('narwhal', { dataStatus: 'Delayed · 15m' }), bars, {
    price: 108, time: currentDay, delayMs: 900_000, freshness: 'delayed',
  });
  assert.equal(quote.price, 108);
  assert.equal(quote.change, 8);
  assert.equal(quote.changePercent, 8);
  assert.equal(quote.freshness, 'Delayed quote');
});

test('historical-only quotes use the latest listed close and remain labeled historical', () => {
  const quote = buildWatchlistQuote(item('finzdata', { dataStatus: 'Historical-only · Daily' }), bars);
  assert.equal(quote.price, 110);
  assert.equal(quote.change, 10);
  assert.equal(quote.freshness, 'Historical-only · Daily');
});

test('missing prior bars preserve last price while leaving changes unavailable', () => {
  const quote = buildWatchlistQuote(item(), [bars[0]]);
  assert.equal(quote.price, 100);
  assert.equal(quote.change, null);
  assert.equal(quote.changePercent, null);
});
