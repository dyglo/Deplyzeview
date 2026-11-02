use crate::remote_data::get_remote_market_data;
use futures_util::{future::join_all, join};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::AppHandle;

static CRYPTO_CATALOGS: OnceLock<Mutex<HashMap<String, (Instant, Vec<Value>)>>> = OnceLock::new();
const CATALOG_TTL: Duration = Duration::from_secs(600);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    provider: String,
    status: String,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct SearchResponse {
    results: Vec<Value>,
    providers: Vec<ProviderStatus>,
}

fn cached(provider: &str) -> Option<Vec<Value>> {
    let cache = CRYPTO_CATALOGS.get_or_init(|| Mutex::new(HashMap::new()));
    let values = cache.lock().ok()?;
    let (at, catalog) = values.get(provider)?;
    (at.elapsed() < CATALOG_TTL).then(|| catalog.clone())
}

fn cache_catalog(provider: &str, catalog: Vec<Value>) -> Vec<Value> {
    if let Ok(mut cache) = CRYPTO_CATALOGS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        cache.insert(provider.to_string(), (Instant::now(), catalog.clone()));
    }
    catalog
}

async fn crypto_catalog(provider: &str, client: &reqwest::Client) -> Result<Vec<Value>, String> {
    if let Some(catalog) = cached(provider) {
        return Ok(catalog);
    }
    let data = match provider {
        "binance" => {
            let value: Value = client
                .get("https://api.binance.com/api/v3/exchangeInfo")
                .send()
                .await
                .map_err(|_| "Binance catalog request failed".to_string())?
                .error_for_status()
                .map_err(|_| "Binance catalog is unavailable".to_string())?
                .json()
                .await
                .map_err(|_| "Binance returned an invalid catalog".to_string())?;
            value["symbols"].as_array().cloned().ok_or_else(|| "Binance returned an invalid instrument directory".to_string())?.into_iter()
                .filter(|item| item["status"].as_str() == Some("TRADING") && item["isSpotTradingAllowed"].as_bool().unwrap_or(true))
                .map(|item| {
                    let base = item["baseAsset"].as_str().unwrap_or("");
                    let quote = item["quoteAsset"].as_str().unwrap_or("");
                    json!({"symbol":item["symbol"],"instrumentId":item["symbol"],"name":format!("{base} / {quote}"),"assetClass":"crypto","instrumentType":"spot","exchange":"Binance Spot","quoteCurrency":quote,"dataStatus":"Real-time"})
                }).collect()
        }
        "coinbase" => {
            let values: Vec<Value> = client
                .get("https://api.exchange.coinbase.com/products")
                .header("User-Agent", "DeplyzeView/0.1 market-data")
                .send()
                .await
                .map_err(|_| "Coinbase catalog request failed".to_string())?
                .error_for_status()
                .map_err(|_| "Coinbase catalog is unavailable".to_string())?
                .json()
                .await
                .map_err(|_| "Coinbase returned an invalid catalog".to_string())?;
            values.into_iter().filter(|item| item["status"].as_str() == Some("online") && !item["trading_disabled"].as_bool().unwrap_or(false))
                .map(|item| {
                    let id = item["id"].as_str().unwrap_or("");
                    json!({"symbol":id,"instrumentId":id,"name":item["display_name"].as_str().unwrap_or(id),"assetClass":"crypto","instrumentType":"spot","exchange":"Coinbase Exchange","quoteCurrency":item["quote_currency"],"dataStatus":"Real-time"})
                }).collect()
        }
        "hyperliquid" => {
            let value: Value = client
                .post("https://api.hyperliquid.xyz/info")
                .json(&json!({"type":"meta"}))
                .send()
                .await
                .map_err(|_| "Hyperliquid catalog request failed".to_string())?
                .error_for_status()
                .map_err(|_| "Hyperliquid catalog is unavailable".to_string())?
                .json()
                .await
                .map_err(|_| "Hyperliquid returned an invalid catalog".to_string())?;
            value["universe"].as_array().cloned().ok_or_else(|| "Hyperliquid returned an invalid instrument directory".to_string())?.into_iter()
                .filter_map(|item| {
                    let symbol = item["name"].as_str()?;
                    Some(json!({"symbol":symbol,"instrumentId":symbol,"name":format!("{symbol} Perpetual"),"assetClass":"crypto","instrumentType":"perpetual","exchange":"Hyperliquid","quoteCurrency":"USD","dataStatus":"Real-time"}))
                }).collect()
        }
        _ => return Err("Unsupported provider catalog".into()),
    };
    Ok(cache_catalog(provider, data))
}

async fn gateway_catalog(app: AppHandle, provider: &str) -> Result<Vec<Value>, String> {
    let value = get_remote_market_data(
        app.clone(),
        provider.to_string(),
        "instruments".into(),
        None,
        None,
        None,
        None,
        None,
    )
    .await?;
    let instruments = value
        .as_array()
        .cloned()
        .ok_or_else(|| format!("{provider} returned an invalid instrument catalog"))?;
    // FinzData roots are searched here; actual individual contracts are fetched
    // only for likely matches after all source catalogs have completed.
    Ok(instruments)
}

fn normalized(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn result_from(provider: &str, raw: Value) -> Value {
    let symbol = raw["symbol"].as_str().unwrap_or("").to_string();
    let instrument_id = raw["instrumentId"].as_str().unwrap_or(&symbol).to_string();
    let instrument_type = raw["instrumentType"]
        .as_str()
        .unwrap_or("unknown")
        .to_lowercase();
    let asset_class = raw["assetClass"].as_str().unwrap_or("other").to_lowercase();
    let contract_expiry = raw["contractExpiry"].as_str();
    let identity = format!(
        "{}|{}|{}|{}",
        provider,
        instrument_type,
        instrument_id.to_uppercase(),
        contract_expiry.unwrap_or("")
    );
    let aliases = raw["tags"].as_array().cloned().unwrap_or_default();
    let delay_ms = raw["delayMs"].as_i64();
    let freshness = raw["dataStatus"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| match provider {
            "finzdata" => "Historical-only · Daily".into(),
            "narwhal" if delay_ms.unwrap_or(0) > 0 => {
                format!("Delayed · {}m", delay_ms.unwrap_or(0) / 60_000)
            }
            "narwhal" => "Plan-dependent".into(),
            "oanda" => "Midpoint · refreshed 10s".into(),
            _ => "Provider-reported".into(),
        });
    json!({
        "provider": provider,
        "symbol": symbol,
        "instrumentId": instrument_id,
        "name": raw["name"].as_str().unwrap_or(&symbol),
        "assetClass": asset_class,
        "instrumentType": instrument_type,
        "exchange": raw["exchange"],
        "quoteCurrency": raw["quoteCurrency"],
        "aliases": aliases,
        "contractExpiry": raw["contractExpiry"],
        "delayMs": raw["delayMs"],
        "dataStatus": freshness,
        "identity": identity,
    })
}

#[tauri::command]
pub async fn search_market_instruments(
    app: AppHandle,
    query: String,
) -> Result<SearchResponse, String> {
    let term = query.trim();
    if term.is_empty() || term.len() > 80 {
        return Err("Enter a search term of 1–80 characters".into());
    }
    let normalized_query = normalized(term);
    if normalized_query.is_empty() {
        return Err("Search using a ticker, instrument name, or alias".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("DeplyzeView/0.1 market-data")
        .build()
        .map_err(|_| "Could not initialize market search".to_string())?;

    let (binance, coinbase, hyperliquid, oanda, narwhal, finzdata) = join!(
        crypto_catalog("binance", &client),
        crypto_catalog("coinbase", &client),
        crypto_catalog("hyperliquid", &client),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "oanda")
        ),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "narwhal")
        ),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "finzdata")
        ),
    );
    let finzdata_roots = finzdata
        .as_ref()
        .ok()
        .and_then(|result| result.as_ref().ok())
        .cloned();

    let mut sources = Vec::new();
    let mut raw_results: Vec<(String, Value)> = Vec::new();
    for (provider, outcome) in [
        ("binance", binance),
        ("coinbase", coinbase),
        ("hyperliquid", hyperliquid),
    ] {
        match outcome {
            Ok(catalog) => {
                sources.push(ProviderStatus {
                    provider: provider.into(),
                    status: "ok".into(),
                    error: None,
                });
                raw_results.extend(catalog.into_iter().map(|item| (provider.into(), item)));
            }
            Err(error) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some(error),
            }),
        }
    }
    for (provider, outcome) in [
        ("oanda", oanda),
        ("narwhal", narwhal),
        ("finzdata", finzdata),
    ] {
        match outcome {
            Ok(Ok(catalog)) => {
                sources.push(ProviderStatus {
                    provider: provider.into(),
                    status: "ok".into(),
                    error: None,
                });
                raw_results.extend(catalog.into_iter().map(|item| (provider.into(), item)));
            }
            Ok(Err(error)) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some(error),
            }),
            Err(_) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some("Provider search timed out".into()),
            }),
        }
    }

    // Search matched FinzData root(s) for actual listed contracts and retain only
    // contract-specific records. Root series are not substituted for dated contracts.
    let mut finz_contract_lookup_failed = false;
    if let Some(roots) = finzdata_roots {
        let matches = roots
            .iter()
            .filter(|root| {
                let symbol = root["symbol"].as_str().unwrap_or("");
                let name = root["name"].as_str().unwrap_or("");
                let q = normalized_query.as_str();
                let root_normalized = normalized(symbol);
                normalized(name).contains(q)
                    || root_normalized.contains(q)
                    || q.starts_with(&root_normalized)
            })
            .take(4)
            .filter_map(|root| root["symbol"].as_str().map(str::to_string))
            .collect::<Vec<_>>();
        let contract_jobs = matches.into_iter().map(|root| {
            let app = app.clone();
            async move {
                tokio::time::timeout(
                    Duration::from_secs(14),
                    get_remote_market_data(
                        app,
                        "finzdata".into(),
                        "contracts".into(),
                        Some(root),
                        None,
                        None,
                        None,
                        None,
                    ),
                )
                .await
            }
        });
        for outcome in join_all(contract_jobs).await {
            match outcome {
                Ok(Ok(value)) => {
                    if let Some(contracts) = value.as_array() {
                        raw_results.extend(
                            contracts
                                .iter()
                                .cloned()
                                .map(|item| ("finzdata".into(), item)),
                        );
                    }
                }
                Ok(Err(_)) | Err(_) => finz_contract_lookup_failed = true,
            }
        }
    }
    if finz_contract_lookup_failed {
        if let Some(source) = sources
            .iter_mut()
            .find(|source| source.provider == "finzdata")
        {
            source.status = "partial".into();
            source.error = Some("Could not load individual contracts for this search".into());
        }
    }

    let mut results = raw_results
        .into_iter()
        .filter_map(|(provider, raw)| {
            let item = result_from(&provider, raw);
            if item["instrumentType"] == "futures_root" {
                return None;
            }
            let haystack = normalized(&format!(
                "{} {} {} {} {} {}",
                item["symbol"].as_str().unwrap_or(""),
                item["name"].as_str().unwrap_or(""),
                item["assetClass"].as_str().unwrap_or(""),
                item["instrumentType"].as_str().unwrap_or(""),
                item["exchange"].as_str().unwrap_or(""),
                item["aliases"].to_string()
            ));
            haystack.contains(&normalized_query).then_some(item)
        })
        .collect::<Vec<_>>();
    results.sort_by(|a, b| {
        a["symbol"]
            .as_str()
            .unwrap_or("")
            .cmp(b["symbol"].as_str().unwrap_or(""))
            .then_with(|| {
                a["provider"]
                    .as_str()
                    .unwrap_or("")
                    .cmp(b["provider"].as_str().unwrap_or(""))
            })
    });
    results.dedup_by(|a, b| a["identity"] == b["identity"]);
    results.truncate(250);
    Ok(SearchResponse {
        results,
        providers: sources,
    })
}

#[tauri::command]
pub async fn get_market_search_catalog(app: AppHandle) -> Result<SearchResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("DeplyzeView/0.1 market-data")
        .build()
        .map_err(|_| "Could not initialize market search".to_string())?;
    let (binance, coinbase, hyperliquid, oanda, narwhal, finzdata) = join!(
        crypto_catalog("binance", &client),
        crypto_catalog("coinbase", &client),
        crypto_catalog("hyperliquid", &client),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "oanda")
        ),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "narwhal")
        ),
        tokio::time::timeout(
            Duration::from_secs(14),
            gateway_catalog(app.clone(), "finzdata")
        ),
    );
    let mut sources = Vec::new();
    let mut raw_results: Vec<(String, Value)> = Vec::new();
    for (provider, outcome) in [
        ("binance", binance),
        ("coinbase", coinbase),
        ("hyperliquid", hyperliquid),
    ] {
        match outcome {
            Ok(catalog) => {
                sources.push(ProviderStatus {
                    provider: provider.into(),
                    status: "ok".into(),
                    error: None,
                });
                raw_results.extend(catalog.into_iter().map(|item| (provider.into(), item)));
            }
            Err(error) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some(error),
            }),
        }
    }
    for (provider, outcome) in [
        ("oanda", oanda),
        ("narwhal", narwhal),
        ("finzdata", finzdata),
    ] {
        match outcome {
            Ok(Ok(catalog)) => {
                sources.push(ProviderStatus {
                    provider: provider.into(),
                    status: "ok".into(),
                    error: None,
                });
                raw_results.extend(catalog.into_iter().map(|item| (provider.into(), item)));
            }
            Ok(Err(error)) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some(error),
            }),
            Err(_) => sources.push(ProviderStatus {
                provider: provider.into(),
                status: "error".into(),
                error: Some("Provider search timed out".into()),
            }),
        }
    }
    let mut results = raw_results
        .into_iter()
        .filter_map(|(provider, raw)| {
            let item = result_from(&provider, raw);
            (item["instrumentType"] != "futures_root").then_some(item)
        })
        .collect::<Vec<_>>();
    results.sort_by(|a, b| {
        a["symbol"]
            .as_str()
            .unwrap_or("")
            .cmp(b["symbol"].as_str().unwrap_or(""))
            .then_with(|| {
                a["provider"]
                    .as_str()
                    .unwrap_or("")
                    .cmp(b["provider"].as_str().unwrap_or(""))
            })
    });
    results.dedup_by(|a, b| a["identity"] == b["identity"]);
    results.truncate(10_000);
    Ok(SearchResponse {
        results,
        providers: sources,
    })
}

#[cfg(test)]
mod tests {
    use super::{normalized, result_from};
    use serde_json::json;

    #[test]
    fn symbol_queries_ignore_case_and_common_separators() {
        assert_eq!(normalized("XAU/USD"), normalized("xau_usd"));
        assert_eq!(normalized("Gold Futures"), "goldfutures");
    }

    #[test]
    fn provider_and_contract_expiry_are_preserved_in_identity() {
        let raw = json!({
            "symbol":"ES.ESZ26", "instrumentId":"ESZ26", "name":"E-mini S&P 500",
            "assetClass":"FUTURES", "instrumentType":"exchange_futures",
            "exchange":"CME", "contractExpiry":"2026-12-18"
        });
        let contract = result_from("finzdata", raw);
        let other_source = result_from(
            "narwhal",
            json!({
                "symbol":"ES", "instrumentId":"ES", "name":"E-mini S&P 500",
                "assetClass":"futures", "instrumentType":"continuous_futures"
            }),
        );
        assert_eq!(contract["assetClass"], "futures");
        assert_eq!(contract["exchange"], "CME");
        assert_eq!(contract["contractExpiry"], "2026-12-18");
        assert_ne!(contract["identity"], other_source["identity"]);
    }
}
