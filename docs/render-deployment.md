# DeplyzeView Render deployment plan

Status: local implementation and provider acceptance passed. On 1 November 2026 the user approved committing, pushing and deploying to a new Render service on the Free compute plan. Production verification is recorded below after deployment.

The user reviewed the visible provider/instrument browser and approved publication. The existing venue and symbol popovers include provider directory browsing. The current development launcher starts/reuses the loopback gateway automatically.

## New service only

| Setting | Proposed value |
|---|---|
| Workspace | User-confirmed My Workspace, `tea-d0s3v7idbo4c73bbgve0` |
| Name | `deplyzeview-market-data` (availability checked at creation) |
| Type | Web Service on the Free compute plan; may spin down after 15 idle minutes |
| Compute plan | `free`, 0.1 CPU / 512 MB; no paid compute plan, per explicit user instruction |
| Region | Frankfurt, to keep the standalone gateway geographically closer to Nairobi; no private-network dependencies |
| Source | `https://github.com/dyglo/Deplyzeview.git` |
| Branch | User-authorized new branch `codex/multi-asset-market-data` |
| Runtime | Docker; Node 24 Alpine |
| Dockerfile / context | `gateway/Dockerfile` / repository root; `.dockerignore` allowlists gateway sources only |
| Start command | Image default: `node gateway/server.mjs` |
| Listener | `MARKET_DATA_HOST=0.0.0.0`, `MARKET_DATA_PORT=10000` |
| Replicas | One; in-memory caches and per-instrument stream fan-out |
| Auto-deploy | Off for deliberate releases |
| Storage | None; no database or disk needed |
| Platform readiness | Default TCP probe. The connected creation tool cannot set an HTTP health path. `/v1/health` remains authenticated and is checked explicitly after deploy. |
| Production URL | Not allocated yet; do not treat a predicted `onrender.com` hostname as deployed |

The existing TafTube service (`srv-d0s4uc95pdvs73978el0`) was inspected read-only and is outside scope. No existing service, deployment, region, environment variable or workspace setting is to be changed.

## Render environment variables

Configure through the connected Render plugin, never source, Docker build arguments, commit bodies or logs. Transfer only these gateway variables from the ignored local `.env`:

- `MARKET_DATA_PROVIDERS=oanda,narwhal,finzdata`
- `OANDA_API_TOKEN`, `OANDA_ACCOUNT_ID`, `OANDA_ENVIRONMENT`
- `NARWHAL_API_KEY`, `NARWHAL_PLAN`
- `FINZDATA_API_KEY`
- `MARKET_DATA_APP_TOKENS`
- `MARKET_DATA_HOST=0.0.0.0`, `MARKET_DATA_PORT=10000`, `NODE_ENV=production`

Do not send the desktop's `DEPLYZEVIEW_APP_TOKEN` or `DEPLYZEVIEW_GATEWAY_URL` as provider configuration. After Render reports the service's actual URL, set that public URL in the desktop build environment and rebuild. A separately provisioned runtime application token authorizes the desktop; no provider API keys go to a PC or installer.

Managed application-token provisioning is supported via OS environment or per-user `gateway.json`. Automatic consumer enrollment/sign-in is not implemented. Publicly distributing an installer with an embedded shared token is not acceptable.

## Required deployment verification

1. Complete local unit, frontend, Rust, provider, stream and secret checks before creating any service.
2. User permission to commit/push was received; commit and push the reviewed changes. Exclude `.env` and build outputs; audit the candidate commit for actual secret values without printing them.
3. Create only the new service through the Render plugin in the confirmed workspace, with the secret environment configured at creation.
4. Record the actual deploy ID; monitor it until `live`. Creation/trigger success alone is insufficient.
5. Verify HTTPS transport and authenticated `/v1/health`; verify unauthenticated data requests are rejected.
6. Run read-only provider discovery, OANDA H1/M15 history/pricing SSE, Narwhal daily history/delayed quote, and FinzData individual-contract history/volume/OI against the deployed URL.
7. Review new-service runtime logs for errors and secret leakage. Do not read or modify unrelated service logs.
8. Set the actual production URL in the desktop configuration, build the installer without secrets, and verify the Rust desktop path to the production service. Fresh-PC installation testing must be reported separately if unavailable.

## Local acceptance evidence

- 55 JavaScript tests passed; frontend check: zero errors/warnings.
- All eight final Rust tests passed, including the gateway transport checks and existing crypto normalization/dedupe/footprint tests.
- Vite production build passed. Windows MSI and NSIS installers built successfully on 1 November 2026 using the local gateway URL; these are local validation artifacts, not production-configured releases.
- OANDA account authentication and discovery: 68 forex pairs, no metals/CFDs. EUR_USD M15/H1 history returned HTTP 200 with ten candles each. Pricing SSE returned HTTP 200 and an actual normalized quote.
- Native desktop UI review: all six providers appear in the existing venue menu. OANDA directory/search and EUR_USD candles rendered; Narwhal GC selection switched to 1D and rendered; FinzData ES root expanded to individual contracts, displayed the provider's current/expiry labels, and ES.ESZ26 daily candles rendered. Frontend checks and all 55 JavaScript tests passed after these selector changes.
- Narwhal GC: daily candles and latest quote passed; free quote explicitly delayed.
- FinzData ES.ESZ26: individual-contract daily candles, volume and open interest passed. Historical expiry comes from the roll calendar; the current contract's unspecified expiry remains null.
- Binance, Coinbase Exchange and Hyperliquid live candle endpoints each returned HTTP 200 with nonempty data. Their existing normalization/dedupe/footprint tests pass.
- Actual local credential values were scanned against 52 source, documentation, script, frontend, executable and installer files: no matches. `.env` is ignored. The MSI File table contains only `deplyzeview.exe`, with no environment file or gateway secrets bundled. Audit the candidate commit again before publication.

## References

[Render compute plans](https://render.com/docs/compute-plans), [current pricing](https://render.com/pricing), [Free plan idle suspension](https://render.com/docs/free), [deployment lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [MCP capabilities and limitations](https://render.com/docs/mcp-server).

## Free plan limitation

The user explicitly selected Free instead of always-on paid compute. Render can spin down an idle Free service after 15 minutes; a cold start can take about a minute, existing streams can disconnect, and shared monthly Free instance hours apply. This deployment therefore does not claim always-on availability. No keep-alive workaround is configured. Metals/CFD entitlement expansion is deferred at the user's request.
