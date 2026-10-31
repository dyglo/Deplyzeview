# Market-data backend

## Current architecture

The desktop renderer does not open exchange REST or WebSocket connections. Vela requests candle history through a Rust Tauri command; live candle updates and footprint updates are delivered as Tauri events from the Rust process. The Rust backend owns venue adapters, normalization, reconnect loops, local persistence, deduplication, gap accounting, and price-row aggregation.

This build runs the Rust feed service **inside each desktop installation**. Its SQLite store lives in the operating system's per-user Tauri app-data directory as `market-data.sqlite3`. This is a useful local-first development/service boundary, but it is not yet a centrally hosted multi-user feed gateway: multiple desktop installs still establish separate upstream venue connections. A shared production service should reuse the adapter and normalization contracts but run as a separately deployed Rust API/WebSocket service with a central database, authenticated client access, and per-venue connection fan-out. Do not describe this local build as shared-feed infrastructure.

## Normalized trade record

Each persisted normalized event contains:

| Field | Meaning |
|---|---|
| `venue`, `instrument` | Canonical provider and provider-specific market symbol. |
| `timestamp_ms` | Exchange event time in Unix milliseconds. |
| `price`, `size` | Traded price and base/contract quantity. |
| `aggressor_side` | `buy` or `sell`; buy aggressors add to ask volume, sell aggressors to bid volume. |
| `source_event_id` | Venue event identifier used as the dedupe key. |
| `contract_type`, `contract_multiplier`, `quote_currency` | Contract metadata used to interpret and convert volume. Current supported crypto instruments use multiplier 1. |
| `raw_event` | Original provider JSON retained to help audit normalization issues. |

SQLite uses WAL mode, a market/time index, and a unique key on `(venue, instrument, source_event_id)`. Duplicate replayed events are ignored. The feed-health table stores status, history bounds, last update, detected gaps, capability notes, and provider limits.

## Venue adapters and data semantics

- **Binance Spot:** exchange-info tick size, `aggTrades` REST seed, and `@aggTrade` WebSocket. Binance aggregate trades combine matches sharing one taker order and price; they are not every individual matching-engine fill. Numeric aggregate-trade IDs are checked for gaps, and a bounded REST time-range recovery is attempted.
- **Coinbase Exchange:** product `quote_increment`, public product-trades REST pages, and the `matches` WebSocket channel. Coinbase's documented match `side` is the maker side; the adapter reverses it to derive aggressor direction. Coinbase warns that match messages can be dropped, so detected numeric trade-ID gaps trigger a recent REST recovery attempt; this is not a guarantee that every outage can be repaired.
- **Hyperliquid perpetuals:** price precision inferred from `szDecimals`, `recentTrades` REST seed, and `trades` WebSocket subscription. This is a static precision floor, not a guaranteed per-price exchange tick ladder. The source's trade IDs are not treated as a sequential gap counter, so the UI explicitly reports gap detection as unavailable for this provider. Recent-history depth is venue-limited; trades are durably collected from the time this service starts.

## Current coverage boundary

The only wired feeds in this build are Binance Spot, Coinbase Exchange spot products, and Hyperliquid crypto perpetuals. The app does not currently provide forex, commodities, cash indices, or dated exchange-listed futures. Typing a symbol is not proof that a provider lists it, and an unsupported symbol must remain an explicit provider error rather than falling back to sample or synthetic data.

Adding those markets requires a named broker or licensed data vendor plus the corresponding product directory, historical and live entitlements, credentials when required, and documented symbol, price/quantity precision, contract multiplier, quote-currency, session, timezone, and holiday rules. Forex or CFD tick counts are not centralized traded volume. Candle-only index sources cannot supply trade-level bid/ask footprints. A continuous futures series also requires an explicit expiry and roll-adjustment policy. Until a source is selected and integrated, those asset classes must not be presented as working feeds.

The quote-volume field is `price × size × contract_multiplier`, denominated in the instrument's quote currency. It is not silently converted to USD. The settings UI labels quote volume with the actual selected market's quote currency. Standard candle volume comes from each venue's candle endpoint; live candle volume adds observed exchange trade size only when a known candle baseline or a complete post-subscription bar is available. Missing provider volume remains unavailable, not a fabricated zero. Footprint bid/ask rows are built only from normalized trades with an aggressor side, never from candle volume.

## Footprint calculation

One Rust function is used for both historical aggregation and live footprint updates. It floors trade time into the chart bar interval, obtains the exchange tick size, groups `ticks_per_row` ticks into each price row, and maps buy aggressors to ask and sell aggressors to bid. It accumulates base quantity and quote notional independently for both sides. The renderer only paints the returned bucket data: **Split Bar**, **Delta**, and **Total Volume** are presentation modes over the same calculated footprint.

Unit tests cover venue-side normalization and bucket price, side, time, and notional calculations, including floor-aligned tick rows and unknown-volume propagation. Run them from `src-tauri` with `cargo test`; the frontend volume helper tests run with `npm test`.

## Coverage and operating limits

History limits are surfaced in the UI and in `historyNote`; the chart only renders trades actually present in SQLite. Binance backfill is capped to a recent hour and bounded REST request budget. Coinbase seeds from a capped set of the latest public trade pages. Hyperliquid seeds the venue's `recentTrades` response. These sources do not provide the same historical depth, and the current chart history view queries the latest hour. Coverage timestamps and detected gap counts are shown in the settings panel. For Hyperliquid, the UI says gap detection is unavailable instead of displaying a misleading zero.

This first backend does not yet ship account authentication, remote multi-tenant access, central retention/partitioning, scheduled deep backfill, data licensing, or deployment automation. Those are prerequisites before exposing a shared hosted feed service. Public-market endpoints require network access and can be affected by provider availability, rate limits, regional restrictions, and feed drops.

## Official source documentation

- [Vela chart options and the OHLCV data-provider contract](https://docs.luxalgo.com/vela/user/options) and [Vela user-drawing tools/control API](https://docs.luxalgo.com/vela/user/drawing-tools); the host explicitly enables native volume and uses Vela's drawing-control surface for its custom toolbar.
- [Binance Spot WebSocket streams](https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams) and [market-data REST endpoints](https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints)
- [Coinbase Exchange WebSocket channels](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels) and [product trade history](https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproducttrades)
- [Hyperliquid WebSocket subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions) and [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
