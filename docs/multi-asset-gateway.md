# Multi-asset market-data gateway

## Implementation and verification status

The existing Binance Spot, Coinbase Exchange Spot and Hyperliquid perpetual adapters still run directly inside Rust. Their connections, SQLite trades and footprint calculations are unchanged. New sources use the same Vela provider port and OHLCV chart series, with requests carried by a Rust command to a separately deployed Node.js 24 gateway. Unified symbol search combines actual crypto exchange listings with the configured gateway provider directories, normalizes source identity and keeps provider failures isolated. The right-side watchlist stores only explicitly added instruments. Chart layout, toolbars, drawings and indicator settings retain their existing behavior. No execution endpoints, account-management functionality or separate chart engine was added. Typed qualified symbols remain supported.

| Provider | Implemented scope | Restrictions |
|---|---|---|
| OANDA v20 | Account-specific instrument discovery, midpoint OHLC, quote stream over authenticated SSE | Forex, metals and commodity/index CFDs only when listed for the configured account. Candle refresh every 10 seconds; quote SSE is available through the gateway API, not used to fabricate chart candles. |
| Narwhal | Futures root directory, cursor-paginated daily OHLC, latest quote | **Unadjusted front-month series**, not individual contracts. No expiry is invented. No volume or open interest. Free quotes are 15 minutes delayed. Intraday is explicitly rejected in this implementation, including on paid plans. |
| FinzData (optional) | Roots, individual-contract directory and roll metadata, daily raw OHLC, volume, open interest and provider expiry when present | Historical research only, explicit `ROOT.CONTRACT`. No automatic continuous series, price adjustment or live prices. Daily trading dates use midnight UTC as a label; Eastern-time intraday bars are not implemented. Missing expiry stays unknown; estimated roll dates retain the provider's status. |

Protocol tests use injected provider response fixtures, including real HTTP requests to an ephemeral local gateway. Separately, after credentials were supplied, local live acceptance passed for OANDA EUR_USD H1/M15 candles and pricing SSE, Narwhal GC daily candles and delayed quotes, and FinzData ES.ESZ26 daily candles with volume/open interest. FinzData's actual daily JSON uses a naive midnight datetime as the trading-date label; the adapter accepts that exact shape without treating arbitrary local times as UTC. The OANDA directory lists 68 forex instruments, but direct authorized endpoints also serve gold. As of 2 November 2026 the adapter verifies XAU_USD candle access and includes it in discovery (69 instruments total), with H1/M15 history and pricing-stream acceptance checks passed. A directory omission is not treated as proof that market data is unavailable; rejected gold probes do not add an instrument or interrupt forex. Production deployment, redistribution rights and connectivity from a fresh installed PC are separate checks. Do not treat an adapter as proof of universal coverage.

## Configuration

Fill the ignored repository-root `.env`; `.env.example` documents every variable. Provider keys were supplied by the user; local application authentication tokens were generated securely without printing them.

| Variable | Where and meaning |
|---|---|
| `MARKET_DATA_PROVIDERS` | Gateway; comma-separated `oanda,narwhal`; add `finzdata` to enable the optional historical supplement. Disabled adapters do not require credentials. |
| `OANDA_API_TOKEN` | Gateway only; OANDA personal access token, sent as `Authorization: Bearer`. |
| `OANDA_ACCOUNT_ID` | Gateway only; v20 account used for instrument availability and pricing. |
| `OANDA_ENVIRONMENT` | Gateway; `practice` (default) or `live`; both REST and stream hosts follow it. |
| `NARWHAL_API_KEY` | Gateway only; sent as `Authorization: Bearer`. |
| `NARWHAL_PLAN` | Gateway; `free`, `basic`, `pro`. Describes entitlement and conservative delay labeling; does not purchase access. |
| `FINZDATA_API_KEY` | Gateway only; sent as `X-API-Key`, never in a query string. |
| `MARKET_DATA_HOST`, `MARKET_DATA_PORT` | Gateway listener; local defaults `127.0.0.1:8787`. Container listens on `0.0.0.0:8787`. |
| `MARKET_DATA_APP_TOKENS` | Gateway only; comma-separated independent random application tokens, minimum 32 characters each. Provision a different token to each authorized desktop and remove it to revoke that desktop. |
| `DEPLYZEVIEW_GATEWAY_URL` | Public gateway base URL; runtime override or build-time default in the Rust executable. HTTPS is required except for loopback development. |
| `DEPLYZEVIEW_APP_TOKEN` | Runtime desktop application credential matching one allowed app token. **Never a provider credential and never compiled into the installer.** |

These environment variable names are application configuration. HTTP authentication header names and provider endpoints follow the vendors' documentation; OANDA itself does not prescribe an environment variable name for its bearer token.

Create random application tokens with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Put one into `MARKET_DATA_APP_TOKENS` and the same one into `DEPLYZEVIEW_APP_TOKEN` for local development. Do not reuse a provider API token for application authentication.

```sh
npm run desktop:dev   # loads .env; starts/reuses the loopback gateway, then launches Tauri
npm run gateway:dev   # optional: run the gateway separately
```

Startup probes each configured instrument directory independently. `/v1/health` distinguishes `not_checked`, `ok` and upstream failures; health is based on observations, not a claim of constant availability. Bad provider credentials are surfaced without stopping other sources. Startup does not read brokerage balances, positions, orders or transactions.

## Production and installer

Run this gateway as one small always-on Node service behind your existing HTTPS reverse proxy/load balancer. It uses built-in Node modules; no npm runtime dependencies, cloud vendor, database or paid hosting integration is required. It can run on your existing backend host.

```sh
docker build -f gateway/Dockerfile -t deplyzeview-market-data .
docker run --env-file /secure/server/market-data.env -p 127.0.0.1:8787:8787 deplyzeview-market-data
```

The Docker build context is allowlisted by `.dockerignore`; `.env`, frontend assets, desktop executables and credentials are excluded. Inject gateway variables through the backend's secret environment. Terminate TLS at the reverse proxy, disable buffering on `/v1/oanda/stream`, and allow long-lived SSE responses. Bind the container port to loopback when proxying on the same host. Do not expose this listener directly over public plaintext HTTP. Provider connections always use fixed official HTTPS hosts with redirects disabled.

Build with the **public production URL** in `DEPLYZEVIEW_GATEWAY_URL`, then run `npm run desktop:build`. This launcher loads `.env`, removes provider/application tokens from the build subprocess, and embeds only the public URL. `src-tauri/build.rs` tells Cargo to rebuild when that public URL changes. Existing direct `npm run tauri build` still works if the public URL is supplied in the process environment. No `.env` file or gateway service is a Tauri bundle resource.

A fresh installation needs **no OANDA, Narwhal or FinzData keys**. It does need application authorization. Your deployment system can provision a per-user `gateway.json` in Tauri's app config directory (`%APPDATA%/com.deplyzeview.desktop/gateway.json` on Windows):

```json
{"url":"https://your-backend.example","appToken":"a-unique-random-authorized-application-token"}
```

### Windows launch fix in 0.1.1

The application now persists its own access in the Windows per-user credential vault (`com.deplyzeview.desktop.market-data`) and restores `gateway.json` when it is missing. This removes dependence on a terminal's inherited environment and keeps access across ordinary app-data cleanup/reinstallation. This vault entry contains **application access only**, never OANDA/Narwhal/FinzData credentials.

`npm run desktop:build` provisions this development PC after a successful Windows build by passing only the gateway URL and application token to the native executable over stdin. The executable determines its real Tauri configuration directory; Node no longer guesses that location. `npm run desktop:configure` repairs authorization from the ignored local `.env` without rebuilding. The helper never passes secrets as command-line arguments or prints them.

Both `npm run desktop:dev` and direct `npm run tauri dev` prepare an ignored `src-tauri/target/development-gateway.json` before starting. Only debug builds can read that development file. Installed release builds never load `.env` or any provider credentials. Safe native diagnostics (`--gateway-status`, or the per-user `gateway-status.json`) report only configuration presence/path and errors, not the token.

New Windows users or other PCs still require their own application authorization; a shared access token is never embedded in the installer. Version 0.1.1 is a desktop authorization fix and does not change the deployed provider API or enable metals/CFDs.

Alternatively provision the runtime OS environment. Restrict this file to that user, keep it out of the installer and repositories, and rotate/revoke it through `MARKET_DATA_APP_TOKENS`. The runtime environment takes precedence over the file, which takes precedence over the compiled public URL. Gateway configuration is read only in Rust; it is never returned to the WebView. There is no frontend fetch permission for remote APIs and the existing CSP remains unchanged.

**Unattended per-device authorization is not magically supplied by a shared installer.** No existing login/identity service was present in the repository. This implementation supports managed per-device application credential provisioning, not OAuth login or automatic device enrollment. Your existing deployment/auth system must provision that application credential; if you want unmanaged consumer installations, an enrollment/sign-in flow is still required. Embedding a shared secret in a downloadable installer would expose the gateway and was deliberately not implemented.

Render deployment is prepared separately; see [the reviewable Render service plan](render-deployment.md). The local release build cannot by itself verify production or installed-PC connectivity.

## Existing chart integration

Use the symbol control or **Add symbol** in the right-side watchlist to open unified symbol search; selecting a provider is not required. The dialog preloads actual searchable provider catalogs and filters them locally on each keystroke, while debounced unified lookups add query-specific candidates such as individual futures contracts. The Tauri search command queries Binance, Coinbase Exchange and Hyperliquid instrument directories together with the OANDA, Narwhal and FinzData catalogs through the authenticated gateway. It returns partial results when a source is unavailable and labels each instrument with its provider and relevant type/exchange/expiry/freshness metadata. OANDA lists only instruments available to the configured account. FinzData contract results are discovered under matching futures roots and retain each listed expiry; no continuous-contract substitution is made. Selecting a futures instrument uses the supported daily timeframe. A result is added to the watchlist only when its explicit add control is used. The watchlist polls provider-backed daily bars for price and previous-close changes; Narwhal uses its delayed quote endpoint, while FinzData remains historical-only. `npm run desktop:dev` starts the credential-owning loopback gateway automatically; browser-only `npm run dev` cannot call Tauri commands.

The same input also accepts qualified identifiers:

- `OANDA:EUR_USD` (also `OANDA:EUR/USD`), `OANDA:XAU_USD`, `OANDA:XAG_USD`; other exact account identifiers are discoverable through the gateway.
- `NARWHAL:GC`, `NARWHAL:SI`, `NARWHAL:CL`, `NARWHAL:ES`, `NARWHAL:6E`: select **1D**. A root is a rolling series, never a dated contract.
- `FINZDATA:ES.ESZ26`: select **1D**. This is a syntax example, not a guarantee that a contract exists or your plan includes it; discover contracts first.
- Binance spot, Coinbase Exchange spot and Hyperliquid perpetual symbols are returned as distinct provider-specific alternatives by unified search.

Unavailable timeframes/symbols fail explicitly. No source fallback, interpolated candles, calendar-gap filling, resampled quote bars or synthetic trades are generated. Provider metadata identifies instrument type, exchange, contract, expiry, price source, frequency, retrieval time and delay/freshness. The Vela engine consumes the same OHLCV fields for every provider. Open interest and extra metadata remain available in normalized gateway responses; no new indicator/UI was added for them.

The volume footprint requires actual trades with aggressor-side classification. All three new sources are explicitly unavailable for footprints. OANDA `volume` is a count of prices and is retained only as `tickCount`; chart `volume` is null. Narwhal volume is unavailable. FinzData's historical contract volume is separate from a trade-level footprint.

## API and reliability

Every endpoint requires `Authorization: Bearer <application-token>`, including health and streaming. Tokens are compared using fixed-length cryptographic digests and timing-safe equality. The gateway has no CORS access, order/execution routes or client-selectable upstream URLs.

```text
GET /v1/health
GET /v1/{provider}/instruments
GET /v1/{provider}/instrument?symbol=...
GET /v1/finzdata/contracts?symbol=ES
GET /v1/{provider}/bars?symbol=...&timeframe=1D&from=UNIX_MS&to=UNIX_MS&limit=500
GET /v1/narwhal/quote?symbol=GC
GET /v1/oanda/stream?symbol=EUR_USD
```

Instrument and contract directories are cached and concurrent requests coalesced. Exact candle ranges have short bounded caches; different date bounds never share truncated results. All caches are bounded in memory and errors are not cached as data. This is a single-process service: multiple replicas multiply upstream usage and stream connections; shared distributed caching/fan-out is not implemented.

REST requests use 15-second timeouts, fixed HTTPS origins, bounded retries with exponential backoff/jitter for transient failures, and per-provider request pacing. Authentication/entitlement errors are not retried. HTTP 429 sets an upstream cooldown using Retry-After (or a conservative default), rather than looping through a monthly quota. Application access is capped at 120 requests/minute/token. Range sizes, page budgets and cache sizes are bounded. Outages remain isolated by source. Structured logs contain request IDs, HTTP status and duration, never credentials, URLs, account IDs or upstream response bodies.

OANDA candle pagination uses count plus from, excludes the previous page's boundary candle on subsequent pages, and handles short final pages/market closures. Narwhal cursors are followed with repeated-cursor detection. FinzData daily requests are bounded below the provider row limit and explicitly reject potential truncation. Rows are validated, sorted and deduplicated by timestamp; malformed OHLC/time/volume fails the request. Missing traded volume remains null. FinzData contract mismatches are rejected. Gaps remain gaps.

OANDA quotes are shared across downstream SSE subscribers per instrument, capped at 10 active instruments (below the documented upstream limit of 20). Streams include heartbeats, read-silence detection, bounded exponential reconnect delays, explicit reconnection gap events, slow-client disconnection and cancellation when the last subscriber disconnects. A stream is sampled by OANDA at at most four updates/second; it is not every price. Downstream users must reconcile gaps with authoritative candles. Charts poll those authoritative candles every 10 seconds; futures history refreshes hourly, with backoff on failures. No claim of tick-perfect OHLC reconstruction is made.

## Verified provider terms and limits

Reviewed on 1 November 2026; verify your account and redistribution rights before production.

- [OANDA development guide](https://developer.oanda.com/rest-live-v20/development-guide/), [account instrument discovery](https://developer.oanda.com/rest-live-v20/account-ep/), [candles and pricing streams](https://developer.oanda.com/rest-live-v20/pricing-ep/): v20 account/personal access token required; practice and live environments. Account/jurisdiction determines available forex, metals and CFDs. Documented limits include 120 REST requests/second, 20 streams/IP and 2 new connections/second. Account API access is not a blanket right to redistribute prices to other users.
- [Narwhal futures reference](https://narwhalapi.com/docs/api/futures) and [pricing/data terms](https://narwhalapi.com/pricing): Free has 5,000 requests/month, 30/minute, last 12 months of daily futures history, and quotes delayed 15 minutes. Basic/Pro add paid live quotes and one-minute history; this gateway currently implements daily OHLC only. Series are front-month, unadjusted, with roll discontinuities. Commercial use requires attribution; reselling a data feed requires an Enterprise license.
- [FinzData futures coverage](https://finzdata.com/futures-data), [pricing](https://finzdata.com/shop), [API authentication](https://finzdata.com/docs), [OpenAPI](https://api.finzdata.com/openapi.json), and [published Python client](https://pypi.org/project/finzdata/): free 1,000 calls/day, last 30 days of daily futures, documented coverage of 139 roots and individual contracts. Full history is paid (single market $49; Futures Daily $95; Futures Complete $295), optional updates $19.95/month. This supplement adds contract volume/open interest and contract identity that Narwhal's rolling OHLC series lacks. This implementation does not provide intraday, adjusted continuous history or live data. Expiry is kept only when supplied; it is never inferred from a contract month code.

## Validation and remaining work

Run `npm test`, `npm run check`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, and `npm run desktop:build`. Gateway tests cover missing configuration, application authentication, malformed data, account availability, candle pagination boundaries, delayed freshness, cursor traversal, futures contract identity/expiry, price/volume/OI semantics, upstream auth/rate limits, outage recovery, HTTP routes, safe logs and SSE shutdown. Existing crypto normalization, persistence/dedupe and footprint math have their existing Rust tests; no provider keys are needed for these tests.

After entering real credentials and starting the gateway, run `npm run gateway:smoke` for read-only account discovery and representative history/quote checks. This script does not place trades or print credentials. Also verify M15 OANDA, a closed session, invalid token, expired/unlisted contract, pricing SSE and exhausted quota. Confirm the exact FinzData response fields against account responses. Deploy to your hostname, provision an application token, build with that public URL, then install on a separate PC and verify the entire path. Fixture tests do not establish non-crypto live acceptance.

During implementation, public live candle HTTP smoke requests to Binance BTCUSDT (1h), Coinbase BTC-USD (1h), and Hyperliquid BTC (1h) all returned HTTP 200 with nonempty data (2, 350, and 3 bars respectively). These test endpoint reachability and candle response availability, not the entire installed chart or live WebSocket lifecycle.

## OANDA gold update in 0.1.2

Search **Gold**, **XAUUSD**, **XAU_USD**, or **XAU/USD** under OANDA. Compact six-letter OANDA pairs normalize to the official underscore form. Gold remains OANDA midpoint metal/CFD data, not Narwhal GC futures. When the account directory omits XAU_USD, the adapter validates an authenticated real candle response before including it. Missing permissions or invalid prices leave gold unavailable without disrupting existing forex. No display precision or traded volume is invented for the supplementary directory entry. Local checks passed for ten H1 candles, ten M15 candles and an actual pricing-stream quote.
