# DeplyzeView

DeplyzeView is a compact Tauri 2 + Svelte 5 desktop trading terminal built on the `@luxalgo/vela` chart engine. Binance, Coinbase Exchange and Hyperliquid market data is fetched by the Rust backend; no sample candles or generated trade data are included.

## Run

```sh
npm install
npm run dev       # browser preview at http://127.0.0.1:5173
npm run tauri dev # native desktop shell (requires Rust and platform Tauri prerequisites)
npm run build
```

Requires Node.js 24 or later, npm, the Rust stable toolchain/Cargo, and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating system. Browser preview has no market-data connection; run the native Tauri shell to use the Rust backend.

## Chart workspace

- Choose Candles, Hollow Candles, OHLC Bars, Line, Area, Baseline, Columns, Heikin Ashi, or Volume Footprint from the compact chart-style menu.
- Drawing tools are organized into seven groups with sectioned flyouts. Click the group icon to use its last-selected tool or its chevron to browse the full collection. Star a tool to add it to the floating horizontal favorites toolbar. Drag its grip to move it, or use the grip's arrow keys to nudge it. Favorites, toolbar position/visibility, and each group's last-used tool are saved with workspace preferences. The catalog exposes all drawing tools registered by the installed engine; it does not claim complete TradingView tool parity.
- Open **Indicators** to search the engine's built-in catalog by name or abbreviation (for example EMA or RSI) and add studies to the chart. Repeated instances are supported where the indicator allows them. Indicators unavailable for the current market are disabled. Use each indicator's chart label to configure, hide, or remove it. This catalog does not include TradingView community scripts or Pine Script imports.
- Open **Chart settings** for symbol colors, canvas, scales, crosshair, and volume controls. The color palette includes custom colors and opacity.
- Choose **DeplyzeView Light** or **DeplyzeView Dark** under **Template**. Changes preview immediately; **Cancel** restores the previous settings and **Ok** keeps them.
- Select **Nairobi / Kampala (UTC+3)** from the footer timezone selector or chart settings. The chart and clock use the same saved timezone.
- Appearance preferences persist across restarts. Style changes preserve the selected market, interval, indicators, drawings, and viewport. Heikin Ashi indicators use the smoothed bars rather than execution prices.

Renko, Line Break, Kagi, Point & Figure, and Range charts are not available in this build.

## Build and validation

```sh
npm test
npm run check
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo build --manifest-path src-tauri/Cargo.toml
npm run tauri build # package the desktop application
```

The Windows debug executable is `src-tauri/target/debug/deplyzeview.exe`. The application ID is `com.deplyzeview.desktop`. Existing installations retain access to their previous market-data database and Windows WebView profile; appearance preferences read the legacy key and save under the DeplyzeView namespace.

The development launcher reuses a running server only when it identifies this exact checkout. An unrelated server on port 5173 produces an actionable error rather than launching the wrong frontend.

## Market data and chart engine

Default market is Binance BTCUSDT spot at 1-hour intervals. The venue selector also includes Coinbase Exchange spot products (for example BTC-USD) and Hyperliquid crypto perpetuals (for example BTC). A separate authenticated gateway adds OANDA forex/metals/CFDs, Narwhal daily front-month futures and optional FinzData daily individual-contract research. Configure credentials before using these feeds; typing a symbol alone does not establish coverage. Use the existing symbol input with `OANDA:EUR_USD`, `NARWHAL:GC` (1D), or an explicitly discovered FinzData contract. See [gateway setup, credentials, coverage and deployment](docs/multi-asset-gateway.md). The interval controls switch the active DeplyzeView chart. Availability depends on each provider, region and account permissions. The charting dependency and its original license notices are documented in `VELA-LICENSE` and `VELA-NOTICE`.


## Rust market-data backend

The Tauri Rust process owns provider REST/WebSocket connections, normalized trade persistence, deduplication, bounded reconnect recovery, feed health, and the shared historical/live footprint calculation. Trades and raw venue payloads are stored in a local SQLite database in the per-user app-data directory. Candle REST history and live candle updates also route through Rust. See [the backend and data-coverage notes](docs/market-data-backend.md) for schema, limits, official feed docs, unit semantics, and the distinction between this local per-install service and a future centrally hosted feed gateway.

## Volume Footprint

Standard chart volume uses provider candle volume, with live updates from observed exchange trade sizes. The footprint remains separate: it uses actual normalized trades with aggressor-side classification. Quote notional is shown in the instrument's quote currency and is not converted to USD; unavailable candle volume is left unavailable rather than shown as zero. Choose **Volume Footprint** from the chart-style selector. The chart uses Vela's public native chart-type and renderer-layer extension points, not a separate canvas mock. A provider-neutral trade-feed interface connects venue-specific REST and WebSocket adapters. Binance uses its real `aggTrades` API and stream; those aggregate trades combine fills from a single taker order at one price. Coinbase uses its public product-trades REST endpoint and `matches` WebSocket channel; its public match stream may drop messages, as Coinbase documents. Hyperliquid uses its recent-trades info endpoint and `trades` WebSocket subscription. These are genuine trade feeds, but not a universal individual matching-engine fill feed. The built-in modes are **Split Bar** (bid × ask), **Delta** (ask minus bid) and **Total Volume**. The tick grouping control changes the number of exchange price ticks rolled into each displayed row. Historical depth varies by venue: Binance is capped to the recent hour and a request budget; Coinbase seeds from its latest public trades page; Hyperliquid seeds from its recent-trades endpoint. None of these adapters claims full-depth backfill.

Network access to the selected venue's public REST and WebSocket endpoints is required by the Rust backend. Regional availability, API limits and connection interruptions can affect live order-flow history. No mock trades are generated.
