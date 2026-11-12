import test from 'node:test';
import assert from 'node:assert/strict';
import { addWatchlistItem, instrumentIdentity, readWatchlist, writeWatchlist, watchlistKey } from './watchlist.ts';

const storage = value => ({ getItem: () => value });
const instrument = (provider, symbol, type = 'spot', expiry = null) => ({
  provider, symbol, instrumentId: symbol, name: symbol, assetClass: 'crypto', instrumentType: type,
  exchange: null, quoteCurrency: null, contractExpiry: expiry, delayMs: null, dataStatus: 'Real-time', aliases: [],
  identity: instrumentIdentity({ provider, instrumentId: symbol, instrumentType: type, contractExpiry: expiry }),
});

test('new or malformed watchlists start empty', () => {
  for (const value of [null, '{', 'null', '{}']) assert.deepEqual(readWatchlist(storage(value)), []);
});

test('watchlist saves ordered provider-specific identities and restores them', () => {
  const rows = [instrument('binance', 'BTCUSDT'), instrument('coinbase', 'BTC-USD'), instrument('finzdata', 'ES.ESZ26', 'exchange_futures', '2026-12-18')];
  let savedKey, savedValue;
  assert.equal(writeWatchlist({ setItem(key, value) { savedKey = key; savedValue = value; } }, rows), true);
  assert.equal(savedKey, watchlistKey);
  assert.deepEqual(readWatchlist(storage(savedValue)), rows);
});

test('same asset on different providers or contract expiries remains distinct', () => {
  const first = instrument('finzdata', 'ES.ESZ26', 'exchange_futures', '2026-12-18');
  const second = instrument('finzdata', 'ES.ESH27', 'exchange_futures', '2027-03-19');
  const alternate = instrument('narwhal', 'ES', 'continuous_futures');
  assert.equal(addWatchlistItem([first], first).length, 1);
  assert.deepEqual(addWatchlistItem([first, second], alternate), [first, second, alternate]);
});

test('restoration removes duplicate identities and ignores malformed entries without changing order', () => {
  const first = instrument('binance', 'BTCUSDT');
  const second = instrument('coinbase', 'BTC-USD');
  const unknown = { ...instrument('unknown', 'BTCUSDT') };
  assert.deepEqual(readWatchlist(storage(JSON.stringify([first, null, first, second, unknown]))), [first, second]);
});

test('storage write failure is safely reported', () => {
  assert.equal(writeWatchlist({ setItem() { throw new Error('quota'); } }, []), false);
});

import { readWatchlists, watchlistsKey, watchlistCategory, reorderWatchlist, formatWatchlistNumber, formatWatchlistPriceParts } from './watchlist.ts';
test('named lists migrate legacy symbols and restore the active list independently', () => {
  const rows = [instrument('oanda', 'EUR_USD', 'cfd')];
  const legacy = readWatchlists({ getItem: key => key === watchlistKey ? JSON.stringify(rows) : null });
  assert.deepEqual(legacy.lists[0].items, rows);
  const saved = { activeId: 'fx', lists: [...legacy.lists, { id: 'fx', name: 'Forex', items: [] }] };
  assert.deepEqual(readWatchlists({ getItem: key => key === watchlistsKey ? JSON.stringify(saved) : null }), saved);
});
test('categories and reordering preserve instrument identities and category boundaries', () => {
  const a = instrument('binance', 'BTCUSDT');
  const b = instrument('binance', 'ETHUSDT');
  const c = { ...instrument('oanda', 'EUR_USD', 'cfd'), assetClass: 'forex' };
  const gold = { ...instrument('oanda', 'XAU_USD', 'cfd'), assetClass: 'commodities', symbol: 'XAUUSD' };
  assert.equal(watchlistCategory(c), 'Forex');
  assert.equal(watchlistCategory(instrument('finzdata', 'ES', 'exchange_futures')), 'Futures');
  assert.deepEqual(reorderWatchlist([a,b,c], a.identity,b.identity), [b,a,c]);
  assert.deepEqual(reorderWatchlist([a,b,c], a.identity,c.identity), [a,b,c]);
  assert.equal(formatWatchlistNumber(1.0876,c), '1.08760');
  assert.equal(formatWatchlistNumber(-0.00032,c,true), '−0.00032');
  assert.equal(formatWatchlistNumber(null,c), '—');
  assert.deepEqual(formatWatchlistPriceParts(1.08767, c), { main: '1.0876', pip: '7' });
  assert.deepEqual(formatWatchlistPriceParts(4031.655, gold), { main: '4,031.65', pip: '5' });
  assert.deepEqual(formatWatchlistPriceParts(50000.5, a), { main: '50,000.50' });
  assert.deepEqual(formatWatchlistPriceParts(null, c), { main: '—' });
});
