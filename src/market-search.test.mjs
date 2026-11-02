import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesInstrumentQuery, mergeSearchResults, normalizeSearchTerm, sortInstrumentSuggestions } from './market-search.ts';

const result = (provider, symbol, extras = {}) => ({
  provider, symbol, instrumentId: symbol, name: extras.name ?? symbol,
  assetClass: extras.assetClass ?? 'crypto', instrumentType: extras.instrumentType ?? 'spot',
  exchange: extras.exchange ?? null, quoteCurrency: extras.quoteCurrency ?? 'USD',
  contractExpiry: extras.contractExpiry ?? null, dataStatus: extras.dataStatus ?? 'Real-time',
  identity: `${provider}|${extras.instrumentType ?? 'spot'}|${symbol}|${extras.contractExpiry ?? ''}`,
  aliases: extras.aliases ?? [],
});

test('suggestions match symbols, names, aliases, and case/punctuation variants', () => {
  const gold = result('oanda', 'XAU_USD', { name: 'Gold / US Dollar', assetClass: 'metals', aliases: ['Gold'] });
  assert.equal(normalizeSearchTerm('XAU/USD'), 'xauusd');
  assert.equal(matchesInstrumentQuery(gold, 'xauusd'), true);
  assert.equal(matchesInstrumentQuery(gold, 'GOLD'), true);
  assert.equal(matchesInstrumentQuery(gold, 'AU_US'), true);
  assert.equal(matchesInstrumentQuery(gold, 'eth'), false);
});

test('exact and symbol-prefix suggestions are ranked ahead of name matches', () => {
  const exact = result('coinbase', 'BTC');
  const prefix = result('binance', 'BTCUSDT');
  const nameMatch = result('oanda', 'XBT_USD', { name: 'Bitcoin / US Dollar' });
  assert.deepEqual(sortInstrumentSuggestions([nameMatch, prefix, exact], 'btc'), [exact, prefix, nameMatch]);
});

test('same ticker from different providers remains distinct while updated records refresh in place', () => {
  const binance = result('binance', 'BTCUSDT');
  const coinbase = result('coinbase', 'BTC-USD');
  const refreshedBinance = { ...binance, name: 'Bitcoin / Tether' };
  const merged = mergeSearchResults([binance, coinbase], [refreshedBinance]);
  assert.deepEqual(merged.map(item => item.provider), ['binance', 'coinbase']);
  assert.equal(merged[0].name, 'Bitcoin / Tether');
});
