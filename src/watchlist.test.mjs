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
