//! Credential boundary: the desktop knows only its own application token.
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tauri::Manager;

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayConfig {
    url: Option<String>,
    app_token: Option<String>,
}

fn validate_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid market-data gateway URL")?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && loopback))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Gateway URL requires HTTPS (HTTP allowed only on loopback), without credentials/query/fragment".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn get_remote_market_data(
    app: tauri::AppHandle,
    provider: String,
    action: String,
    instrument: Option<String>,
    timeframe: Option<String>,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    limit: Option<u32>,
) -> Result<Value, String> {
    if !["oanda", "narwhal", "finzdata"].contains(&provider.as_str())
        || !["instruments", "instrument", "contracts", "bars", "quote"].contains(&action.as_str())
    {
        return Err("Unsupported gateway market-data request".into());
    }
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("gateway.json");
    let config: GatewayConfig = match std::fs::read(&path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| "Invalid gateway.json configuration")?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => GatewayConfig::default(),
        Err(_) => return Err("Cannot read gateway.json configuration".into()),
    };
    let url = std::env::var("DEPLYZEVIEW_GATEWAY_URL").ok().filter(|s| !s.is_empty())
        .or(config.url)
        .or(option_env!("DEPLYZEVIEW_GATEWAY_URL").filter(|s| !s.is_empty()).map(str::to_string))
        .ok_or("Market-data gateway URL is not configured. Set DEPLYZEVIEW_GATEWAY_URL before building or provision gateway.json.")?;
    // Deliberately no option_env! for tokens: secrets never enter the executable.
    let token = std::env::var("DEPLYZEVIEW_APP_TOKEN").ok().filter(|s| !s.is_empty())
        .or(config.app_token).ok_or("Application authentication is not provisioned. Set DEPLYZEVIEW_APP_TOKEN at runtime or provision gateway.json; never use provider API keys here.")?;
    let mut url = validate_url(&url)?;
    let path = format!(
        "{}/v1/{provider}/{action}",
        url.path().trim_end_matches('/')
    );
    url.set_path(&path);
    {
        let mut query = url.query_pairs_mut();
        if let Some(symbol) = instrument {
            query.append_pair("symbol", &symbol);
        }
        if let Some(tf) = timeframe {
            query.append_pair("timeframe", &tf);
        }
        if let Some(from) = from_ms {
            query.append_pair("from", &from.to_string());
        }
        if let Some(to) = to_ms {
            query.append_pair("to", &to.to_string());
        }
        if let Some(count) = limit {
            query.append_pair("limit", &count.clamp(1, 1500).to_string());
        }
    }
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Cannot initialize gateway client")?
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Market-data gateway connection failed or timed out")?;
    let status = response.status();
    let data: Value = response
        .json()
        .await
        .map_err(|_| "Gateway returned an invalid JSON response")?;
    if !status.is_success() {
        return Err(format!(
            "Gateway HTTP {}: {}",
            status.as_u16(),
            data["error"]["message"]
                .as_str()
                .unwrap_or("Market-data request failed")
        ));
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn transport_rejects_plaintext_and_embedded_credentials() {
        for url in [
            "http://example.com",
            "https://user:secret@example.com",
            "https://example.com?token=abc",
            "file:///secrets",
        ] {
            assert!(validate_url(url).is_err(), "{url}");
        }
        assert!(validate_url("http://127.0.0.1:8787").is_ok());
        assert!(validate_url("https://data.example.com").is_ok());
    }
}
