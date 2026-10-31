# Vela Terminal

A compact Tauri 2 + Svelte 5 desktop chart built on the real `@luxalgo/vela` chart engine. Binance, Coinbase Exchange and Hyperliquid market data is fetched by the Rust backend; no sample candles or generated trade data are included.

## Run

```sh
npm install
npm run dev       # browser preview at http://127.0.0.1:5173
npm run tauri dev # native desktop shell (requires Rust and platform Tauri prerequisites)
npm run build
```

Requires Node.js, npm, the Rust stable toolchain/Cargo, and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for the current operating system. Browser preview has no market-data connection; run the native Tauri shell to use the Rust backend.

## Data and attribution

Default market is Binance BTCUSDT spot at 1-hour intervals. The venue selector also includes Coinbase Exchange (for example BTC-USD) and Hyperliquid perpetuals (for example BTC). Market symbols and supported products depend on each selected provider. The interval controls switch the actual Vela chart. Availability depends on each venue, region and network policies. The Vela attribution remains visible on the chart as required by its Apache-2.0 license and NOTICE. Original copies are in `VELA-LICENSE` and `VELA-NOTICE`.


## Rust market-data backend

The Tauri Rust process owns provider REST/WebSocket connections, normalized trade persistence, deduplication, bounded reconnect recovery, feed health, and the shared historical/live footprint calculation. Trades and raw venue payloads are stored in a local SQLite database in the per-user app-data directory. Candle REST history and live candle updates also route through Rust. See [the backend and data-coverage notes](docs/market-data-backend.md) for schema, limits, official feed docs, unit semantics, and the distinction between this local per-install service and a future centrally hosted feed gateway.

## Volume Footprint update

Choose **Volume Footprint** from the chart-style selector. The chart uses Vela's public native chart-type and renderer-layer extension points, not a separate canvas mock. A provider-neutral trade-feed interface connects venue-specific REST and WebSocket adapters. Binance uses its real `aggTrades` API and stream; those aggregate trades combine fills from a single taker order at one price. Coinbase uses its public product-trades REST endpoint and `matches` WebSocket channel; its public match stream may drop messages, as Coinbase documents. Hyperliquid uses its recent-trades info endpoint and `trades` WebSocket subscription. These are genuine trade feeds, but not a universal individual matching-engine fill feed. The built-in modes are **Split Bar** (bid × ask), **Delta** (ask minus bid) and **Total Volume**. The tick grouping control changes the number of exchange price ticks rolled into each displayed row. Historical depth varies by venue: Binance is capped to the recent hour and a request budget; Coinbase seeds from its latest public trades page; Hyperliquid seeds from its recent-trades endpoint. None of these adapters claims full-depth backfill.

Network access to the selected venue's public REST and WebSocket endpoints is required by the Rust backend. Regional availability, API limits and connection interruptions can affect live order-flow history. No mock trades are generated.
