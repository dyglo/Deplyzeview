import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAssetIcon, resolveAssetIconDataUri, parseInstrumentSymbol } from './asset-icons.ts';

test('normalizes raw symbols across providers and separators', () => {
  const oanda = parseInstrumentSymbol('OANDA:XAU_USD');
  assert.equal(oanda.provider, 'oanda');
  assert.equal(oanda.raw, 'XAU_USD');
  assert.equal(oanda.clean, 'XAUUSD');
  assert.deepEqual(oanda.tokens, ['XAU', 'USD']);

  const perp = parseInstrumentSymbol('HYPERLIQUID:SOL.P');
  assert.equal(perp.provider, 'hyperliquid');
  assert.equal(perp.clean, 'SOL');
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

test('resolves Gold, Silver, and Oil commodities with optional quote currency flag', () => {
  const xauUsd = resolveAssetIcon('XAU_USD', 'oanda');
  assert.equal(xauUsd.kind, 'commodity');
  assert.equal(xauUsd.base, 'XAU');
  assert.equal(xauUsd.quote, 'USD');
  assert.match(xauUsd.svg, /#f59e0b/);

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

test('topbar gap, layout picker popover theme tokens, and asset icons are wired in CSS and Svelte components', () => {
  const styleCss = fs.readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const appSvelte = fs.readFileSync(new URL('./App.svelte', import.meta.url), 'utf8');
  const dataProvider = fs.readFileSync(new URL('./data-provider.ts', import.meta.url), 'utf8');

  // 1. Topbar-to-chart gap fix: Vela's .vela-widget-topbar and .vela-widget-bottombar are hidden and price pane has no translate offset
  assert.match(styleCss, /\.vela-workspace>\.vela-widget-topbar/);
  assert.match(styleCss, /\.vela-workspace>\.vela-widget-bottombar/);
  assert.match(styleCss, /\.chart-area \[data-vela-pane="price"\]\{translate:0 0!important\}/);

  // 2. Layout picker trigger + popover menu uses theme tokens present in light mode
  assert.match(appSvelte, /class="layout-trigger"/);
  assert.match(appSvelte, /class="layout-menu"/);
  assert.match(styleCss, /\.layout-trigger\{/);
  assert.match(styleCss, /\.layout-menu\{/);
  assert.doesNotMatch(styleCss, /--tone-17181d/);

  // 3. Asset icons wired into topbar symbol button, data provider statusline resolver, symbol search, and watchlist
  assert.match(appSvelte, /<AssetIcon \{symbol\} provider=\{venueId\}/);
  assert.match(dataProvider, /resolveSymbolIcon\(/);
});
