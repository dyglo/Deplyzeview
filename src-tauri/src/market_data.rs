use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex},
    time::Duration,
};

use chrono::DateTime;
use futures_util::{SinkExt, StreamExt};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::{task::JoinHandle, time::sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const HISTORY_WINDOW_MS: i64 = 60 * 60 * 1000;
const MAX_BINANCE_HISTORY_REQUESTS: usize = 110;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedTrade {
    pub venue: String,
    pub instrument: String,
    pub timestamp_ms: i64,
    pub price: f64,
    pub size: f64,
    pub aggressor_side: String,
    pub source_event_id: String,
    pub contract_type: String,
    pub contract_multiplier: f64,
    pub quote_currency: String,
    pub raw_event: Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedHealth {
    pub venue: String,
    pub instrument: String,
    pub status: String,
    pub last_message_ms: Option<i64>,
    pub coverage_start_ms: Option<i64>,
    pub coverage_end_ms: Option<i64>,
    pub trades_stored: u64,
    pub gaps_detected: u64,
    pub gap_detection_available: bool,
    pub quote_currency: String,
    pub history_note: String,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedInfo {
    pub venue: String,
    pub instrument: String,
    pub tick_size: f64,
    pub contract_type: String,
    pub contract_multiplier: f64,
    pub quote_currency: String,
    pub history_note: String,
    pub gap_detection_available: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TradeBucketUpdate {
    venue: String,
    instrument: String,
    bar_time: i64,
    price: f64,
    bid: f64,
    ask: f64,
    bid_quote: f64,
    ask_quote: f64,
    source_event_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FootprintLevel {
    pub price: f64,
    pub bid: f64,
    pub ask: f64,
    pub bid_quote: f64,
    pub ask_quote: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FootprintBar {
    pub time: i64,
    pub levels: Vec<FootprintLevel>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketBar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FootprintHistory {
    pub venue: String,
    pub instrument: String,
    pub bars: Vec<FootprintBar>,
    pub step: f64,
    pub ticks_per_row: u32,
    pub coverage_start_ms: Option<i64>,
    pub coverage_end_ms: Option<i64>,
    pub trades: u64,
    pub source_event_ids: Vec<String>,
    pub gaps_detected: u64,
    pub history_note: String,
    pub quote_currency: String,
}

#[derive(Clone)]
struct FeedConfig {
    venue: String,
    instrument: String,
    tick_size: f64,
    row_ticks: u32,
    interval_ms: i64,
    contract_type: String,
    multiplier: f64,
    quote_currency: String,
    history_note: String,
    gap_detection_available: bool,
}

pub struct AppState {
    db: Arc<Mutex<Connection>>,
    tasks: Mutex<HashMap<String, JoinHandle<()>>>,
    configs: Mutex<HashMap<String, FeedConfig>>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Arc::new(Mutex::new(db)),
            tasks: Mutex::new(HashMap::new()),
            configs: Mutex::new(HashMap::new()),
        }
    }
}

pub fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         CREATE TABLE IF NOT EXISTS normalized_trades (
           venue TEXT NOT NULL, instrument TEXT NOT NULL, timestamp_ms INTEGER NOT NULL,
           price REAL NOT NULL, size REAL NOT NULL, aggressor_side TEXT NOT NULL,
           source_event_id TEXT NOT NULL, contract_type TEXT NOT NULL,
           contract_multiplier REAL NOT NULL, quote_currency TEXT NOT NULL,
           raw_event TEXT NOT NULL,
           PRIMARY KEY (venue, instrument, source_event_id)
         );
         CREATE INDEX IF NOT EXISTS idx_trades_market_time ON normalized_trades(venue, instrument, timestamp_ms);
         CREATE TABLE IF NOT EXISTS feed_health (
           venue TEXT NOT NULL, instrument TEXT NOT NULL, status TEXT NOT NULL,
           last_message_ms INTEGER, coverage_start_ms INTEGER, coverage_end_ms INTEGER,
           trades_stored INTEGER NOT NULL DEFAULT 0, gaps_detected INTEGER NOT NULL DEFAULT 0,
           gap_detection_available INTEGER NOT NULL DEFAULT 1, quote_currency TEXT NOT NULL DEFAULT 'USD', history_note TEXT NOT NULL DEFAULT '',
           last_error TEXT, updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY (venue, instrument)
         );"
    ).map_err(|e| e.to_string())?;
    // Safe additive migration for databases created by earlier Vela Terminal builds.
    let _ = connection.execute(
        "ALTER TABLE feed_health ADD COLUMN quote_currency TEXT NOT NULL DEFAULT 'USD'",
        [],
    );
    Ok(())
}

fn feed_key(venue: &str, instrument: &str) -> String {
    format!("{}:{}", venue.to_lowercase(), instrument.to_uppercase())
}
fn validate_market(venue: &str, instrument: &str) -> Result<(String, String), String> {
    let venue = venue.to_lowercase();
    if !["binance", "coinbase", "hyperliquid"].contains(&venue.as_str()) {
        return Err(format!("Unsupported venue: {venue}"));
    }
    let instrument = instrument.trim().to_uppercase();
    if instrument.is_empty() || instrument.len() > 40 || instrument.contains(':') {
        return Err("Instrument symbol is invalid".into());
    }
    Ok((venue, instrument))
}
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn quote_currency(venue: &str, instrument: &str) -> String {
    if venue == "coinbase" {
        return instrument.split('-').nth(1).unwrap_or("USD").to_string();
    }
    if venue == "hyperliquid" {
        return "USDC".to_string();
    }
    for suffix in ["USDT", "USDC", "FDUSD", "BUSD", "USD", "BTC", "ETH", "BNB"] {
        if instrument.ends_with(suffix) {
            return suffix.to_string();
        }
    }
    "UNKNOWN".to_string()
}
fn contract_type(venue: &str) -> String {
    if venue == "hyperliquid" {
        "perpetual"
    } else {
        "spot"
    }
    .to_string()
}
fn history_note(venue: &str) -> String {
    match venue {
        "binance" => "Recent 60-minute aggTrades backfill; request budget applies".into(),
        "coinbase" => {
            "Latest public product-trades pages; REST cursor history is venue-limited".into()
        }
        _ => "Hyperliquid recentTrades seed; earlier history is retained from service start".into(),
    }
}
fn gap_detection_available(venue: &str) -> bool {
    venue != "hyperliquid"
}

async fn get_json(client: &reqwest::Client, url: &str) -> Result<Value, String> {
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "HTTP {} from market data provider",
            response.status()
        ));
    }
    response.json::<Value>().await.map_err(|e| e.to_string())
}
async fn post_hyper_info(client: &reqwest::Client, body: Value) -> Result<Value, String> {
    let response = client
        .post("https://api.hyperliquid.xyz/info")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {} from Hyperliquid", response.status()));
    }
    response.json::<Value>().await.map_err(|e| e.to_string())
}

async fn tick_size_for(client: &reqwest::Client, venue: &str, symbol: &str) -> Result<f64, String> {
    match venue {
        "binance" => {
            let info = get_json(
                client,
                &format!("https://api.binance.com/api/v3/exchangeInfo?symbol={symbol}"),
            )
            .await?;
            info["symbols"][0]["filters"]
                .as_array()
                .and_then(|filters| filters.iter().find(|f| f["filterType"] == "PRICE_FILTER"))
                .and_then(|f| f["tickSize"].as_str())
                .and_then(|v| v.parse().ok())
                .ok_or_else(|| "Binance did not return a price tick size".into())
        }
        "coinbase" => {
            let product = get_json(
                client,
                &format!("https://api.exchange.coinbase.com/products/{symbol}"),
            )
            .await?;
            product["quote_increment"]
                .as_str()
                .and_then(|v| v.parse().ok())
                .ok_or_else(|| "Coinbase did not return a quote increment".into())
        }
        "hyperliquid" => {
            let meta = post_hyper_info(client, json!({"type":"meta"})).await?;
            let decimals = meta["universe"]
                .as_array()
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| item["name"].as_str() == Some(symbol))
                })
                .and_then(|item| item["szDecimals"].as_u64())
                .map(|sz| 6_i32.saturating_sub(sz as i32).clamp(0, 6) as u32)
                .unwrap_or(2);
            Ok(10_f64.powi(-(decimals as i32)))
        }
        _ => Err("Unsupported venue".into()),
    }
}

fn parse_timestamp(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str().and_then(|s| s.parse::<i64>().ok()))
        .or_else(|| {
            value
                .as_str()
                .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                .map(|dt| dt.timestamp_millis())
        })
}
fn normalize_trade(venue: &str, instrument: &str, value: &Value) -> Option<NormalizedTrade> {
    let (price, size, time, event_id, aggressor) = match venue {
        "binance" => {
            if value["e"].as_str().is_some_and(|v| v != "aggTrade") {
                return None;
            }
            let side = if value["m"].as_bool().unwrap_or(false) {
                "sell"
            } else {
                "buy"
            };
            (
                value["p"].as_str()?.parse::<f64>().ok()?,
                value["q"].as_str()?.parse::<f64>().ok()?,
                parse_timestamp(&value["T"])?,
                value["a"].as_i64()?.to_string(),
                side,
            )
        }
        "coinbase" => {
            let side = value["side"].as_str()?;
            // Coinbase side is the resting maker side, so reverse it to obtain aggressor direction.
            let aggressor = if side.eq_ignore_ascii_case("buy") {
                "sell"
            } else {
                "buy"
            };
            (
                value["price"].as_str()?.parse::<f64>().ok()?,
                value
                    .get("size")
                    .or_else(|| value.get("last_size"))?
                    .as_str()?
                    .parse::<f64>()
                    .ok()?,
                parse_timestamp(&value["time"])?,
                value["trade_id"].as_i64()?.to_string(),
                aggressor,
            )
        }
        "hyperliquid" => {
            let side = value["side"].as_str()?;
            let aggressor = if side.eq_ignore_ascii_case("B") || side.eq_ignore_ascii_case("buy") {
                "buy"
            } else {
                "sell"
            };
            (
                value["px"].as_str()?.parse::<f64>().ok()?,
                value["sz"].as_str()?.parse::<f64>().ok()?,
                parse_timestamp(&value["time"])?,
                value["tid"]
                    .as_u64()
                    .map(|v| v.to_string())
                    .or_else(|| value["hash"].as_str().map(str::to_string))?,
                aggressor,
            )
        }
        _ => return None,
    };
    if !price.is_finite() || !size.is_finite() || price <= 0.0 || size <= 0.0 {
        return None;
    }
    Some(NormalizedTrade {
        venue: venue.into(),
        instrument: instrument.into(),
        timestamp_ms: time,
        price,
        size,
        aggressor_side: aggressor.into(),
        source_event_id: event_id,
        contract_type: contract_type(venue),
        contract_multiplier: 1.0,
        quote_currency: quote_currency(venue, instrument),
        raw_event: value.clone(),
    })
}
fn stream_url(venue: &str, instrument: &str) -> String {
    match venue {
        "binance" => format!(
            "wss://stream.binance.com:9443/ws/{}@aggTrade",
            instrument.to_lowercase()
        ),
        "coinbase" => "wss://ws-feed.exchange.coinbase.com".into(),
        _ => "wss://api.hyperliquid.xyz/ws".into(),
    }
}
fn subscription_message(venue: &str, instrument: &str) -> Option<Value> {
    match venue {
        "coinbase" => {
            Some(json!({"type":"subscribe","product_ids":[instrument],"channels":["matches"]}))
        }
        "hyperliquid" => {
            Some(json!({"method":"subscribe","subscription":{"type":"trades","coin":instrument}}))
        }
        _ => None,
    }
}
fn parse_stream_trades(venue: &str, instrument: &str, value: &Value) -> Vec<NormalizedTrade> {
    let records: Vec<&Value> = match venue {
        "binance" => vec![value],
        "coinbase" => {
            if value["type"].as_str() == Some("match") {
                vec![value]
            } else {
                vec![]
            }
        }
        "hyperliquid" => {
            if value["channel"].as_str() == Some("trades") {
                value["data"]
                    .as_array()
                    .map(|v| v.iter().collect())
                    .unwrap_or_default()
            } else {
                vec![]
            }
        }
        _ => vec![],
    };
    records
        .into_iter()
        .filter_map(|row| normalize_trade(venue, instrument, row))
        .collect()
}

async fn backfill(
    client: &reqwest::Client,
    venue: &str,
    instrument: &str,
    from_ms: i64,
    to_ms: i64,
) -> Result<Vec<NormalizedTrade>, String> {
    match venue {
        "binance" => {
            let mut queue = VecDeque::new();
            let mut cursor = from_ms;
            while cursor < to_ms {
                queue.push_back((cursor, (cursor + 59_999).min(to_ms), 0_u8));
                cursor += 60_000;
            }
            let mut out = Vec::new();
            let mut calls = 0;
            while let Some((from, to, depth)) = queue.pop_front() {
                if calls >= MAX_BINANCE_HISTORY_REQUESTS {
                    break;
                }
                calls += 1;
                let url = format!("https://api.binance.com/api/v3/aggTrades?symbol={instrument}&startTime={from}&endTime={to}&limit=1000");
                let response = match get_json(client, &url).await {
                    Ok(v) => v,
                    Err(e) => {
                        if calls == 1 {
                            return Err(e);
                        } else {
                            continue;
                        }
                    }
                };
                let Some(rows) = response.as_array() else {
                    continue;
                };
                if rows.len() >= 1000
                    && to - from > 5_000
                    && depth < 4
                    && calls + 2 < MAX_BINANCE_HISTORY_REQUESTS
                {
                    let mid = from + (to - from) / 2;
                    queue.push_front((mid + 1, to, depth + 1));
                    queue.push_front((from, mid, depth + 1));
                    continue;
                }
                out.extend(
                    rows.iter()
                        .filter_map(|row| normalize_trade(venue, instrument, row)),
                );
            }
            Ok(out)
        }
        "coinbase" => {
            let mut out = Vec::new();
            let mut before: Option<String> = None;
            for _ in 0..10 {
                let mut url = format!(
                    "https://api.exchange.coinbase.com/products/{instrument}/trades?limit=1000"
                );
                if let Some(cursor) = before.as_ref() {
                    url.push_str(&format!("&before={cursor}"));
                }
                let response = client.get(url).send().await.map_err(|e| e.to_string())?;
                if !response.status().is_success() {
                    return Err(format!("Coinbase HTTP {}", response.status()));
                }
                let next = response
                    .headers()
                    .get("cb-before")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_string);
                let rows = response.json::<Value>().await.map_err(|e| e.to_string())?;
                let Some(rows) = rows.as_array() else {
                    break;
                };
                let count = rows.len();
                out.extend(
                    rows.iter()
                        .filter_map(|row| normalize_trade(venue, instrument, row)),
                );
                if count < 1000 || next.is_none() || next == before {
                    break;
                }
                before = next;
            }
            Ok(out)
        }
        "hyperliquid" => {
            let response =
                post_hyper_info(client, json!({"type":"recentTrades","coin":instrument})).await?;
            let Some(rows) = response.as_array() else {
                return Ok(Vec::new());
            };
            Ok(rows
                .iter()
                .filter_map(|row| normalize_trade(venue, instrument, row))
                .collect())
        }
        _ => Err("Unsupported venue".into()),
    }
}

fn store_trade(db: &Arc<Mutex<Connection>>, trade: &NormalizedTrade) -> Result<bool, String> {
    let raw = serde_json::to_string(&trade.raw_event).map_err(|e| e.to_string())?;
    let db = db.lock().map_err(|e| e.to_string())?;
    let changed = db.execute(
        "INSERT OR IGNORE INTO normalized_trades (venue,instrument,timestamp_ms,price,size,aggressor_side,source_event_id,contract_type,contract_multiplier,quote_currency,raw_event) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![trade.venue, trade.instrument, trade.timestamp_ms, trade.price, trade.size, trade.aggressor_side, trade.source_event_id, trade.contract_type, trade.contract_multiplier, trade.quote_currency, raw],
    ).map_err(|e| e.to_string())?;
    Ok(changed > 0)
}
fn save_health(db: &Arc<Mutex<Connection>>, health: &FeedHealth) {
    if let Ok(db) = db.lock() {
        let _ = db.execute(
            "INSERT INTO feed_health (venue,instrument,status,last_message_ms,coverage_start_ms,coverage_end_ms,trades_stored,gaps_detected,gap_detection_available,quote_currency,history_note,last_error,updated_at_ms) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT(venue,instrument) DO UPDATE SET status=excluded.status,last_message_ms=excluded.last_message_ms,coverage_start_ms=excluded.coverage_start_ms,coverage_end_ms=excluded.coverage_end_ms,trades_stored=excluded.trades_stored,gaps_detected=excluded.gaps_detected,gap_detection_available=excluded.gap_detection_available,quote_currency=excluded.quote_currency,history_note=excluded.history_note,last_error=excluded.last_error,updated_at_ms=excluded.updated_at_ms",
            params![health.venue, health.instrument, health.status, health.last_message_ms, health.coverage_start_ms, health.coverage_end_ms, health.trades_stored, health.gaps_detected, health.gap_detection_available, health.quote_currency, health.history_note, health.last_error, now_ms()],
        );
    }
}
fn health_snapshot(
    db: &Arc<Mutex<Connection>>,
    config: &FeedConfig,
    status: &str,
    last_message: Option<i64>,
    gaps: u64,
    error: Option<String>,
) -> FeedHealth {
    let (start, end, count) = db.lock().ok().and_then(|db| db.query_row(
        "SELECT MIN(timestamp_ms),MAX(timestamp_ms),COUNT(*) FROM normalized_trades WHERE venue=?1 AND instrument=?2",
        params![config.venue, config.instrument], |row| Ok((row.get::<_,Option<i64>>(0)?, row.get::<_,Option<i64>>(1)?, row.get::<_,i64>(2)?))
    ).optional().ok().flatten()).unwrap_or((None,None,0));
    FeedHealth {
        venue: config.venue.clone(),
        instrument: config.instrument.clone(),
        status: status.into(),
        last_message_ms: last_message,
        coverage_start_ms: start,
        coverage_end_ms: end,
        trades_stored: count.max(0) as u64,
        gaps_detected: gaps,
        gap_detection_available: config.gap_detection_available,
        quote_currency: config.quote_currency.clone(),
        history_note: config.history_note.clone(),
        last_error: error,
    }
}
fn emit_health(
    app: &AppHandle,
    db: &Arc<Mutex<Connection>>,
    config: &FeedConfig,
    status: &str,
    last_message: Option<i64>,
    gaps: u64,
    error: Option<String>,
) {
    let health = health_snapshot(db, config, status, last_message, gaps, error);
    save_health(db, &health);
    let _ = app.emit("feed-health", health);
}
fn calculate_footprint_bucket(
    trade: &NormalizedTrade,
    config: &FeedConfig,
    row_ticks: u32,
) -> (i64, i64, FootprintLevel) {
    let row_step = (config.tick_size * row_ticks.max(1) as f64).max(f64::EPSILON);
    let row_index = (trade.price / row_step).round() as i64;
    let price = row_index as f64 * row_step;
    let interval = config.interval_ms.max(1);
    let bar_time = trade.timestamp_ms.div_euclid(interval) * interval;
    let quote = trade.price * trade.size * trade.contract_multiplier;
    let (bid, ask, bid_quote, ask_quote) = if trade.aggressor_side == "sell" {
        (trade.size, 0.0, quote, 0.0)
    } else {
        (0.0, trade.size, 0.0, quote)
    };
    (
        bar_time,
        row_index,
        FootprintLevel {
            price,
            bid,
            ask,
            bid_quote,
            ask_quote,
        },
    )
}
fn make_bucket(trade: &NormalizedTrade, config: &FeedConfig) -> TradeBucketUpdate {
    let (bar_time, _, level) = calculate_footprint_bucket(trade, config, config.row_ticks);
    TradeBucketUpdate {
        venue: config.venue.clone(),
        instrument: config.instrument.clone(),
        bar_time,
        price: level.price,
        bid: level.bid,
        ask: level.ask,
        bid_quote: level.bid_quote,
        ask_quote: level.ask_quote,
        source_event_id: trade.source_event_id.clone(),
    }
}
fn emit_trade_update(app: &AppHandle, trade: &NormalizedTrade, config: &FeedConfig) {
    let _ = app.emit("normalized-trade", trade);
    let _ = app.emit("trade-bucket-update", make_bucket(trade, config));
}

async fn run_feed(
    app: AppHandle,
    db: Arc<Mutex<Connection>>,
    config: FeedConfig,
    mut last_error: Option<String>,
    mut gaps: u64,
    mut last_message: Option<i64>,
) {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("VelaTerminal/0.1 market-data")
        .build()
        .unwrap_or_default();
    let mut last_numeric_id: Option<u64> = None;
    if config.venue != "hyperliquid" {
        if let Ok(db) = db.lock() {
            last_numeric_id = db.query_row("SELECT source_event_id FROM normalized_trades WHERE venue=?1 AND instrument=?2 ORDER BY timestamp_ms DESC LIMIT 1", params![config.venue, config.instrument], |row| row.get::<_,String>(0)).optional().ok().flatten().and_then(|s| s.parse().ok());
        }
    }
    let mut backoff = 1_u64;
    loop {
        emit_health(
            &app,
            &db,
            &config,
            "connecting",
            last_message,
            gaps,
            last_error.clone(),
        );
        match connect_async(stream_url(&config.venue, &config.instrument)).await {
            Ok((mut socket, _)) => {
                if let Some(subscription) = subscription_message(&config.venue, &config.instrument)
                {
                    if socket
                        .send(Message::Text(subscription.to_string().into()))
                        .await
                        .is_err()
                    {
                        last_error = Some("Could not subscribe to venue trade stream".into());
                        continue;
                    }
                }
                backoff = 1;
                last_error = None;
                emit_health(&app, &db, &config, "live", last_message, gaps, None);
                let mut health_timer = tokio::time::interval(Duration::from_secs(5));
                loop {
                    tokio::select! {
                        _ = health_timer.tick() => emit_health(&app, &db, &config, "live", last_message, gaps, None),
                        message = socket.next() => {
                            let Some(message) = message else { break; };
                            match message {
                                Ok(Message::Text(text)) => {
                                    let Ok(value) = serde_json::from_str::<Value>(&text) else { continue; };
                                    for trade in parse_stream_trades(&config.venue, &config.instrument, &value) {
                                        if let Ok(sequence) = trade.source_event_id.parse::<u64>() {
                                            if let Some(last) = last_numeric_id {
                                                if sequence > last + 1 {
                                                    gaps += 1;
                                                    let from = last_message.unwrap_or(trade.timestamp_ms).saturating_sub(2_000);
                                                    if let Ok(recovered) = backfill(&client, &config.venue, &config.instrument, from, trade.timestamp_ms).await {
                                                        for missed in recovered {
                                                            if store_trade(&db, &missed).unwrap_or(false) { emit_trade_update(&app, &missed, &config); }
                                                        }
                                                    }
                                                }
                                            }
                                            last_numeric_id = Some(sequence.max(last_numeric_id.unwrap_or(0)));
                                        }
                                        if store_trade(&db, &trade).unwrap_or(false) {
                                            last_message = Some(trade.timestamp_ms);
                                            emit_trade_update(&app, &trade, &config);
                                        }
                                    }
                                }
                                Ok(Message::Ping(payload)) => { let _ = socket.send(Message::Pong(payload)).await; },
                                Ok(Message::Close(_)) => break,
                                Err(error) => { last_error = Some(error.to_string()); break; },
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(error) => {
                last_error = Some(error.to_string());
            }
        }
        emit_health(
            &app,
            &db,
            &config,
            "reconnecting",
            last_message,
            gaps,
            last_error.clone(),
        );
        sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(30);
    }
}

fn provider_interval(venue: &str, timeframe: &str) -> (&'static str, i64) {
    let tf = timeframe.trim();
    let (binance, millis) = match tf {
        "1" => ("1m", 60_000),
        "3" => ("3m", 180_000),
        "5" => ("5m", 300_000),
        "15" => ("15m", 900_000),
        "30" => ("30m", 1_800_000),
        "60" => ("1h", 3_600_000),
        "120" => ("2h", 7_200_000),
        "240" => ("4h", 14_400_000),
        "360" => ("6h", 21_600_000),
        "720" => ("12h", 43_200_000),
        "1D" | "D" | "1d" => ("1d", 86_400_000),
        "1W" | "W" | "1w" => ("1w", 604_800_000),
        _ => ("1h", 3_600_000),
    };
    let provider_tf = if venue == "hyperliquid" {
        match binance {
            "1d" => "1d",
            "1w" => "1w",
            value => value,
        }
    } else {
        binance
    };
    (provider_tf, millis)
}

#[tauri::command]
pub async fn get_market_bars(
    venue: String,
    instrument: String,
    timeframe: String,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<MarketBar>, String> {
    let (venue, instrument) = validate_market(&venue, &instrument)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("VelaTerminal/0.1 market-data")
        .build()
        .map_err(|e| e.to_string())?;
    let (provider_tf, interval_ms) = provider_interval(&venue, &timeframe);
    let to = to_ms.unwrap_or_else(now_ms);
    let from = from_ms.unwrap_or(to - interval_ms * limit.unwrap_or(500).min(1500) as i64);
    let requested = limit.unwrap_or(500).clamp(1, 1500);
    let mut bars = Vec::new();
    match venue.as_str() {
        "binance" => {
            let url=format!("https://api.binance.com/api/v3/klines?symbol={instrument}&interval={provider_tf}&startTime={from}&endTime={to}&limit={requested}");
            let rows = get_json(&client, &url).await?;
            for row in rows.as_array().into_iter().flatten() {
                if let Some(values) = row.as_array() {
                    if values.len() >= 6 {
                        let number = |index: usize| {
                            values[index]
                                .as_str()
                                .and_then(|v| v.parse::<f64>().ok())
                                .unwrap_or(0.0)
                        };
                        bars.push(MarketBar {
                            time: values[0].as_i64().unwrap_or(0),
                            open: number(1),
                            high: number(2),
                            low: number(3),
                            close: number(4),
                            volume: number(5),
                        });
                    }
                }
            }
        }
        "coinbase" => {
            let granularity = match provider_tf {
                "1m" => 60,
                "5m" => 300,
                "15m" => 900,
                "30m" => 1800,
                "1h" => 3600,
                "2h" => 3600,
                "4h" => 3600,
                "6h" => 21600,
                "12h" => 21600,
                "1d" => 86400,
                _ => 3600,
            };
            // Coinbase caps candle responses at 300 rows; request sequential bounded slices.
            let mut cursor = from / 1000;
            let end = to / 1000;
            let chunk = granularity * 300;
            while cursor < end {
                let chunk_end = (cursor + chunk).min(end);
                let url=format!("https://api.exchange.coinbase.com/products/{instrument}/candles?granularity={granularity}&start={cursor}&end={chunk_end}");
                let rows = get_json(&client, &url).await?;
                for row in rows.as_array().into_iter().flatten() {
                    if let Some(v) = row.as_array() {
                        if v.len() >= 6 {
                            let n = |i: usize| {
                                v[i].as_f64()
                                    .or_else(|| v[i].as_str().and_then(|s| s.parse().ok()))
                                    .unwrap_or(0.0)
                            };
                            bars.push(MarketBar {
                                time: n(0) as i64 * 1000,
                                low: n(1),
                                high: n(2),
                                open: n(3),
                                close: n(4),
                                volume: n(5),
                            });
                        }
                    }
                }
                cursor = chunk_end;
            }
            bars.sort_by_key(|bar| bar.time);
            if provider_tf == "2h" || provider_tf == "4h" || provider_tf == "12h" {
                bars = aggregate_market_bars(bars, interval_ms);
            }
        }
        "hyperliquid" => {
            let request = json!({"type":"candleSnapshot","req":{"coin":instrument,"interval":provider_tf,"startTime":from,"endTime":to}});
            let rows = post_hyper_info(&client, request).await?;
            for row in rows.as_array().into_iter().flatten() {
                let n = |key: &str| {
                    row[key]
                        .as_str()
                        .and_then(|v| v.parse::<f64>().ok())
                        .unwrap_or(0.0)
                };
                bars.push(MarketBar {
                    time: row["t"].as_i64().unwrap_or(0),
                    open: n("o"),
                    high: n("h"),
                    low: n("l"),
                    close: n("c"),
                    volume: n("v"),
                });
            }
        }
        _ => return Err("Unsupported venue".into()),
    }
    bars.sort_by_key(|bar| bar.time);
    if bars.len() > requested as usize {
        bars = bars.split_off(bars.len() - requested as usize);
    }
    Ok(bars)
}
fn aggregate_market_bars(input: Vec<MarketBar>, interval_ms: i64) -> Vec<MarketBar> {
    let mut map: std::collections::BTreeMap<i64, MarketBar> = std::collections::BTreeMap::new();
    for bar in input {
        let key = bar.time.div_euclid(interval_ms) * interval_ms;
        map.entry(key)
            .and_modify(|agg| {
                agg.high = agg.high.max(bar.high);
                agg.low = agg.low.min(bar.low);
                agg.close = bar.close;
                agg.volume += bar.volume;
            })
            .or_insert(MarketBar { time: key, ..bar });
    }
    map.into_values().collect()
}

#[tauri::command]
pub async fn subscribe_market_feed(
    app: AppHandle,
    state: State<'_, AppState>,
    venue: String,
    instrument: String,
    bar_interval_ms: i64,
    ticks_per_row: u32,
) -> Result<FeedInfo, String> {
    let (venue, instrument) = validate_market(&venue, &instrument)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("VelaTerminal/0.1 market-data")
        .build()
        .map_err(|e| e.to_string())?;
    let tick_size = tick_size_for(&client, &venue, &instrument).await?;
    let config = FeedConfig {
        venue: venue.clone(),
        instrument: instrument.clone(),
        tick_size,
        row_ticks: ticks_per_row.clamp(1, 100),
        interval_ms: bar_interval_ms.max(1),
        contract_type: contract_type(&venue),
        multiplier: 1.0,
        quote_currency: quote_currency(&venue, &instrument),
        history_note: history_note(&venue),
        gap_detection_available: gap_detection_available(&venue),
    };
    // Backfill before returning to the UI. This removes the race between history queries and async seeding.
    let seed = backfill(
        &client,
        &venue,
        &instrument,
        now_ms() - HISTORY_WINDOW_MS,
        now_ms(),
    )
    .await;
    let seed_error = match seed {
        Ok(trades) => {
            for trade in trades {
                let _ = store_trade(&state.db, &trade);
            }
            None
        }
        Err(error) => Some(error),
    };
    let prior_health = state.db.lock().ok().and_then(|db| db.query_row("SELECT gaps_detected,last_message_ms FROM feed_health WHERE venue=?1 AND instrument=?2", params![venue,instrument], |row| Ok((row.get::<_,i64>(0)?,row.get::<_,Option<i64>>(1)?))).optional().ok().flatten()).unwrap_or((0,None));
    let prior_gaps = prior_health.0.max(0) as u64;
    let prior_last_message = prior_health.1;
    emit_health(
        &app,
        &state.db,
        &config,
        "connecting",
        prior_last_message,
        prior_gaps,
        seed_error.clone(),
    );
    let key = feed_key(&venue, &instrument);
    {
        let mut configs = state.configs.lock().map_err(|e| e.to_string())?;
        configs.insert(key.clone(), config.clone());
    }
    {
        let mut tasks = state.tasks.lock().map_err(|e| e.to_string())?;
        if let Some(old) = tasks.remove(&key) {
            old.abort();
        }
        let app_handle = app.clone();
        let db = state.db.clone();
        let venue_config = config.clone();
        let handle = tokio::spawn(async move {
            run_feed(
                app_handle,
                db,
                venue_config,
                seed_error,
                prior_gaps,
                prior_last_message,
            )
            .await;
        });
        tasks.insert(key, handle);
    }
    Ok(FeedInfo {
        venue: config.venue,
        instrument: config.instrument,
        tick_size,
        contract_type: config.contract_type,
        contract_multiplier: config.multiplier,
        quote_currency: config.quote_currency,
        history_note: config.history_note,
        gap_detection_available: config.gap_detection_available,
    })
}

#[tauri::command]
pub fn unsubscribe_market_feed(
    state: State<'_, AppState>,
    venue: String,
    instrument: String,
) -> Result<(), String> {
    let key = feed_key(&venue, &instrument);
    if let Some(task) = state.tasks.lock().map_err(|e| e.to_string())?.remove(&key) {
        task.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn query_footprint_history(
    state: State<'_, AppState>,
    venue: String,
    instrument: String,
    from_ms: i64,
    to_ms: i64,
    bar_interval_ms: i64,
    ticks_per_row: u32,
) -> Result<FootprintHistory, String> {
    let (venue, instrument) = validate_market(&venue, &instrument)?;
    let key = feed_key(&venue, &instrument);
    let mut config = state
        .configs
        .lock()
        .map_err(|e| e.to_string())?
        .get(&key)
        .cloned()
        .ok_or_else(|| "Subscribe to the market before requesting footprint history".to_string())?;
    config.interval_ms = bar_interval_ms.max(1);
    let row_step = (config.tick_size * ticks_per_row.clamp(1, 100) as f64).max(f64::EPSILON);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut statement = db.prepare("SELECT timestamp_ms,price,size,aggressor_side,contract_multiplier,source_event_id FROM normalized_trades WHERE venue=?1 AND instrument=?2 AND timestamp_ms>=?3 AND timestamp_ms<=?4 ORDER BY timestamp_ms ASC").map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(params![venue, instrument, from_ms, to_ms], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut grouped: HashMap<(i64, i64), FootprintLevel> = HashMap::new();
    let mut count = 0_u64;
    let mut min_time: Option<i64> = None;
    let mut max_time: Option<i64> = None;
    let mut source_event_ids = Vec::new();
    for row in rows {
        let (time, price, size, side, multiplier, event_id) = row.map_err(|e| e.to_string())?;
        source_event_ids.push(event_id);
        count += 1;
        min_time = Some(min_time.map_or(time, |v| v.min(time)));
        max_time = Some(max_time.map_or(time, |v| v.max(time)));
        let trade = NormalizedTrade {
            venue: venue.clone(),
            instrument: instrument.clone(),
            timestamp_ms: time,
            price,
            size,
            aggressor_side: side,
            source_event_id: String::new(),
            contract_type: config.contract_type.clone(),
            contract_multiplier: multiplier,
            quote_currency: config.quote_currency.clone(),
            raw_event: Value::Null,
        };
        let (bar, index, delta) = calculate_footprint_bucket(&trade, &config, ticks_per_row);
        let level = grouped.entry((bar, index)).or_insert(FootprintLevel {
            price: delta.price,
            bid: 0.0,
            ask: 0.0,
            bid_quote: 0.0,
            ask_quote: 0.0,
        });
        level.bid += delta.bid;
        level.ask += delta.ask;
        level.bid_quote += delta.bid_quote;
        level.ask_quote += delta.ask_quote;
    }
    let mut bars: HashMap<i64, Vec<FootprintLevel>> = HashMap::new();
    for ((bar, _), level) in grouped {
        bars.entry(bar).or_default().push(level);
    }
    for levels in bars.values_mut() {
        levels.sort_by(|a, b| b.price.total_cmp(&a.price));
    }
    let mut output: Vec<FootprintBar> = bars
        .into_iter()
        .map(|(time, levels)| FootprintBar { time, levels })
        .collect();
    output.sort_by_key(|bar| bar.time);
    let gaps = db
        .query_row(
            "SELECT gaps_detected FROM feed_health WHERE venue=?1 AND instrument=?2",
            params![venue, instrument],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .unwrap_or(None)
        .unwrap_or(0)
        .max(0) as u64;
    Ok(FootprintHistory {
        venue,
        instrument,
        bars: output,
        step: row_step,
        ticks_per_row: ticks_per_row.clamp(1, 100),
        coverage_start_ms: min_time,
        coverage_end_ms: max_time,
        trades: count,
        source_event_ids,
        gaps_detected: gaps,
        history_note: config.history_note,
        quote_currency: config.quote_currency,
    })
}

#[tauri::command]
pub fn get_feed_health(
    state: State<'_, AppState>,
    venue: String,
    instrument: String,
) -> Result<Option<FeedHealth>, String> {
    let (venue, instrument) = validate_market(&venue, &instrument)?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row("SELECT venue,instrument,status,last_message_ms,coverage_start_ms,coverage_end_ms,trades_stored,gaps_detected,gap_detection_available,quote_currency,history_note,last_error FROM feed_health WHERE venue=?1 AND instrument=?2", params![venue,instrument], |row| {
        Ok(FeedHealth { venue:row.get(0)?, instrument:row.get(1)?, status:row.get(2)?, last_message_ms:row.get(3)?, coverage_start_ms:row.get(4)?, coverage_end_ms:row.get(5)?, trades_stored:row.get::<_,i64>(6)?.max(0) as u64, gaps_detected:row.get::<_,i64>(7)?.max(0) as u64, gap_detection_available:row.get::<_,i64>(8)? != 0, quote_currency:row.get(9)?, history_note:row.get(10)?, last_error:row.get(11)? })
    }).optional().map_err(|e|e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_aggressor_side_and_event_identity_for_each_venue() {
        let binance = json!({"e":"aggTrade","a":7,"p":"101.5","q":"2","T":1000,"m":true});
        assert_eq!(
            normalize_trade("binance", "BTCUSDT", &binance)
                .unwrap()
                .aggressor_side,
            "sell"
        );
        let coinbase = json!({"type":"match","trade_id":8,"price":"101.5","size":"2","time":"1970-01-01T00:00:01Z","side":"buy"});
        assert_eq!(
            normalize_trade("coinbase", "BTC-USD", &coinbase)
                .unwrap()
                .aggressor_side,
            "sell"
        );
        let hyper = json!({"coin":"BTC","tid":9,"px":"101.5","sz":"2","time":1000,"side":"B"});
        assert_eq!(
            normalize_trade("hyperliquid", "BTC", &hyper)
                .unwrap()
                .aggressor_side,
            "buy"
        );
        assert_eq!(
            normalize_trade("hyperliquid", "BTC", &hyper)
                .unwrap()
                .source_event_id,
            "9"
        );
    }
    #[test]
    fn footprint_uses_consistent_aggressor_side_tick_grouping_and_quote_math() {
        let config = FeedConfig {
            venue: "binance".into(),
            instrument: "BTCUSDT".into(),
            tick_size: 0.5,
            row_ticks: 2,
            interval_ms: 60_000,
            contract_type: "spot".into(),
            multiplier: 1.0,
            quote_currency: "USDT".into(),
            history_note: String::new(),
            gap_detection_available: true,
        };
        let buyer = NormalizedTrade {
            venue: "binance".into(),
            instrument: "BTCUSDT".into(),
            timestamp_ms: 61_234,
            price: 100.2,
            size: 2.0,
            aggressor_side: "buy".into(),
            source_event_id: "1".into(),
            contract_type: "spot".into(),
            contract_multiplier: 1.0,
            quote_currency: "USDT".into(),
            raw_event: Value::Null,
        };
        let (bar, index, level) = calculate_footprint_bucket(&buyer, &config, 2);
        assert_eq!(bar, 60_000);
        assert_eq!(index, 100);
        assert_eq!(level.price, 100.0);
        assert_eq!(level.ask, 2.0);
        assert_eq!(level.bid, 0.0);
        assert!((level.ask_quote - 200.4).abs() < 1e-9);
        let mut seller = buyer.clone();
        seller.aggressor_side = "sell".into();
        let (_, _, level) = calculate_footprint_bucket(&seller, &config, 2);
        assert_eq!(level.bid, 2.0);
        assert_eq!(level.ask, 0.0);
        assert!((level.bid_quote - 200.4).abs() < 1e-9);
    }
    #[test]
    fn duplicate_source_events_are_stored_only_once() {
        let connection = Connection::open_in_memory().unwrap();
        initialize_database(&connection).unwrap();
        let db = Arc::new(Mutex::new(connection));
        let trade = NormalizedTrade {
            venue: "binance".into(),
            instrument: "BTCUSDT".into(),
            timestamp_ms: 1_000,
            price: 100.0,
            size: 1.0,
            aggressor_side: "buy".into(),
            source_event_id: "event-1".into(),
            contract_type: "spot".into(),
            contract_multiplier: 1.0,
            quote_currency: "USDT".into(),
            raw_event: json!({"source":"test"}),
        };
        assert!(store_trade(&db, &trade).unwrap());
        assert!(!store_trade(&db, &trade).unwrap());
        let count = db
            .lock()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM normalized_trades", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }
    #[test]
    fn ohlcv_resampling_preserves_first_open_last_close_and_extremes() {
        let input = vec![
            MarketBar {
                time: 0,
                open: 10.0,
                high: 12.0,
                low: 9.0,
                close: 11.0,
                volume: 2.0,
            },
            MarketBar {
                time: 3_600_000,
                open: 11.0,
                high: 15.0,
                low: 10.0,
                close: 14.0,
                volume: 3.0,
            },
            MarketBar {
                time: 7_200_000,
                open: 14.0,
                high: 14.5,
                low: 8.0,
                close: 9.0,
                volume: 4.0,
            },
        ];
        let result = aggregate_market_bars(input, 14_400_000);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].open, 10.0);
        assert_eq!(result[0].close, 9.0);
        assert_eq!(result[0].high, 15.0);
        assert_eq!(result[0].low, 8.0);
        assert_eq!(result[0].volume, 9.0);
    }
}
