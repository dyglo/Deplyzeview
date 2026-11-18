import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveAssetIcon,
  resolveAssetIconDataUri,
  parseInstrumentSymbol,
  formatDisplaySymbol,
  formatDescriptiveSymbolTitle,
  formatOrderQuoteParts,
} from './asset-icons.ts';

test('normalizes raw symbols across providers and separators', () => {
  const oanda = parseInstrumentSymbol('OANDA:XAU_USD');
  assert.equal(oanda.provider, 'oanda');
  assert.equal(oanda.raw, 'XAU_USD');
  assert.equal(oanda.clean, 'XAUUSD');
  assert.deepEqual(oanda.tokens, ['XAU', 'USD']);

  const perp = parseInstrumentSymbol('HYPERLIQUID:SOL.P');
  assert.equal(perp.provider, 'hyperliquid');
  assert.equal(perp.clean, 'SOL');

  assert.equal(formatDisplaySymbol('OANDA:XAU_USD'), 'XAUUSD');
  assert.equal(formatDisplaySymbol('GBP_USD'), 'GBPUSD');
  assert.equal(formatDescriptiveSymbolTitle('XAU_USD'), 'Gold Spot / U.S. Dollar');
  assert.equal(formatDescriptiveSymbolTitle('GBP_USD'), 'British Pound / U.S. Dollar');
});

test('computes TradingView-style SELL / BUY order quote parts and spread', () => {
  const gold = formatOrderQuoteParts(3783.24, 'XAU_USD');
  assert.equal(gold.sellMain, '3,782.98');
  assert.equal(gold.sellPip, '0');
  assert.equal(gold.buyMain, '3,783.50');
  assert.equal(gold.buyPip, '0');
  assert.equal(gold.spread, '52.0');

  const gbp = formatOrderQuoteParts(1.31678, 'GBP_USD');
  assert.equal(gbp.sellMain, '1.3167');
  assert.equal(gbp.buyMain, '1.3168');
  assert.equal(gbp.spread, '1.2');
});

test('resolves Forex pairs into dual overlapping currency flag SVGs', () => {
  for (const sym of ['EUR_USD', 'EURUSD', 'OANDA:GBP_JPY', 'AUD-CAD', 'USD/CHF']) {
    const icon = resolveAssetIcon(sym);
    assert.equal(icon.kind, 'forex', `Expected forex for ${sym}`);
    assert.ok(icon.quote, `Expected quote currency for ${sym}`);
    assert.match(icon.svg, /clipPath/);
    assert.match(icon.dataUri, /^data:image\/svg\+xml;utf8,/);
  }
});

test('resolves Gold, Silver, and Oil commodities into TradingView circular badges', () => {
  const xauUsd = resolveAssetIcon('XAU_USD', 'oanda');
  assert.equal(xauUsd.kind, 'commodity');
  assert.equal(xauUsd.base, 'XAU');
  assert.equal(xauUsd.quote, 'USD');
  assert.match(xauUsd.svg, /#d69a00/);

  const xauConcat = resolveAssetIcon('XAUUSD');
  assert.equal(xauConcat.kind, 'commodity');
  assert.equal(xauConcat.base, 'XAU');
  assert.equal(xauConcat.quote, 'USD');

  const xagUsd = resolveAssetIcon('XAG_USD', 'oanda');
  assert.equal(xagUsd.kind, 'commodity');
  assert.equal(xagUsd.base, 'XAG');
  assert.equal(xagUsd.quote, 'USD');

  const oil = resolveAssetIcon('USOIL');
  assert.equal(oil.kind, 'commodity');
  assert.equal(oil.base, 'OIL');

  const wtiUsd = resolveAssetIcon('WTICO_USD', 'oanda');
  assert.equal(wtiUsd.kind, 'commodity');
  assert.equal(wtiUsd.base, 'OIL');
  assert.equal(wtiUsd.quote, 'USD');
});

test('resolves Crypto tickers and strips quote suffixes', () => {
  const btc = resolveAssetIcon('BTCUSDT', 'binance');
  assert.equal(btc.kind, 'crypto');
  assert.equal(btc.base, 'BTC');
  assert.equal(btc.quote, 'USDT');
  assert.match(btc.svg, /#f7931a/);

  const eth = resolveAssetIcon('ETH-USD', 'coinbase');
  assert.equal(eth.kind, 'crypto');
  assert.equal(eth.base, 'ETH');
  assert.equal(eth.quote, 'USD');
  assert.match(eth.svg, /#627eea/);

  const sol = resolveAssetIcon('SOL', 'hyperliquid');
  assert.equal(sol.kind, 'crypto');
  assert.equal(sol.base, 'SOL');
  assert.match(sol.svg, /#14f195/);

  const dataUri = resolveAssetIconDataUri('BTCUSDT', 'binance');
  assert.match(dataUri, /^data:image\/svg\+xml;utf8,/);
});

test('topbar gap, layout picker, TradingView dark theme, SELL/BUY strip, and clean watchlist are wired', () => {
  const styleCss = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const appSvelte = fs.readFileSync(new URL('./App.svelte', import.meta.url), 'utf8');
  const watchlistSvelte = fs.readFileSync(new URL('./Watchlist.svelte', import.meta.url), 'utf8');
  const dataProvider = fs.readFileSync(new URL('./data-provider.ts', import.meta.url), 'utf8');

  // 1. Topbar-to-chart gap fix
  assert.match(styleCss, /\.vela-workspace>\.vela-widget-topbar/);
  assert.match(styleCss, /\.vela-workspace>\.vela-widget-bottombar/);
  assert.match(styleCss, /\.chart-area \[data-vela-pane="price"\]\{translate:0 0!important\}/);

  // 2. Layout picker trigger + popover menu
  assert.match(appSvelte, /class="layout-trigger"/);
  assert.match(appSvelte, /class="layout-menu"/);
  assert.match(styleCss, /\.layout-trigger\{/);
  assert.match(styleCss, /\.layout-menu\{/);
  assert.doesNotMatch(styleCss, /--tone-17181d/);

  // 3. TradingView topbar pill, SELL / BUY placeholder strip, dark theme, and clean watchlist
  assert.match(appSvelte, /class="tv-order-strip"/);
  assert.match(appSvelte, /class="tv-order-btn tv-order-sell"/);
  assert.match(appSvelte, /class="tv-order-btn tv-order-buy"/);
  assert.match(styleCss, /--tone-101114:#000000/);
  assert.doesNotMatch(watchlistSvelte, /inset 3px 0 0/);
  assert.match(dataProvider, /resolveSymbolIcon\(/);

  // 4. Multi-chart independent timeframe switching
  assert.match(appSvelte, /mountedWorkspace\.sync\.set\('timeframe', false\)/);
  assert.match(appSvelte, /workspace\.sync\.set\('timeframe', false\)/);
  assert.match(appSvelte, /const targetCellId = timeframeMenuAnchor\?\.cellId \?\? workspace\?\.active\.id \?\? activeCellId/);
  assert.match(styleCss, /\.vela-chart \.vela-statusline \.vela-sl-meta\{display:inline!important/);
});
