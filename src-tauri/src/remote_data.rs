//! Credential boundary: the desktop knows only its own application token.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::Manager;

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayConfig {
    url: Option<String>,
    #[serde(alias = "app_token", alias = "applicationToken")]
    app_token: Option<String>,
}

fn nonempty(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn read_config(path: &Path) -> Result<GatewayConfig, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(GatewayConfig::default()),
        Err(_) => {
            return Err(format!(
                "Cannot read application authorization at {}",
                path.display()
            ))
        }
    };
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    serde_json::from_slice(bytes).map_err(|_| {
        format!(
            "Invalid application authorization file at {}",
            path.display()
        )
    })
}

fn resolve_config(
    paths: &[PathBuf],
    env_url: Option<String>,
    env_token: Option<String>,
    compiled_url: Option<String>,
) -> Result<GatewayConfig, String> {
    let mut saved = GatewayConfig::default();
    for path in paths {
        let candidate = read_config(path)?;
        if nonempty(candidate.app_token.clone()).is_some() {
            saved = candidate;
            break;
        }
        if saved.url.is_none() {
            saved.url = candidate.url;
        }
    }
    let url = nonempty(env_url)
        .or(nonempty(saved.url))
        .or(nonempty(compiled_url))
        .ok_or("Market-data gateway URL is not configured")?;
    validate_url(&url)?;
    let token = nonempty(env_token).or(nonempty(saved.app_token))
        .ok_or("Application access is not configured for this Windows user. Run npm run desktop:configure on the development PC, then restart DeplyzeView.")?;
    Ok(GatewayConfig {
        url: Some(url),
        app_token: Some(token),
    })
}

fn config_paths(app: &tauri::AppHandle) -> Result<Vec<PathBuf>, String> {
    let mut paths = vec![app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("gateway.json")];
    #[cfg(target_os = "windows")]
    for name in ["APPDATA", "LOCALAPPDATA"] {
        if let Some(root) = std::env::var_os(name) {
            let path = PathBuf::from(root)
                .join(app.config().identifier.clone())
                .join("gateway.json");
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    // This is an external, ignored development file, never compiled/bundled.
    #[cfg(debug_assertions)]
    paths.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target/development-gateway.json"));
    Ok(paths)
}

fn effective_config(app: &tauri::AppHandle) -> Result<GatewayConfig, String> {
    let result = resolve_config(
        &config_paths(app)?,
        std::env::var("DEPLYZEVIEW_GATEWAY_URL").ok(),
        std::env::var("DEPLYZEVIEW_APP_TOKEN").ok(),
        option_env!("DEPLYZEVIEW_GATEWAY_URL").map(str::to_string),
    );
    if result.is_ok() {
        return result;
    }
    if let Some(bytes) = crate::gateway_vault::read() {
        if let Ok(config) = serde_json::from_slice::<GatewayConfig>(&bytes) {
            if nonempty(config.app_token.clone()).is_some()
                && config
                    .url
                    .as_deref()
                    .is_some_and(|url| validate_url(url).is_ok())
            {
                return Ok(config);
            }
        }
    }
    result
}

fn persist_config(path: &Path, config: &GatewayConfig) -> Result<(), String> {
    if config.app_token.as_deref().unwrap_or("").trim().len() < 32 {
        return Err("Application access token must contain at least 32 characters".into());
    }
    validate_url(config.url.as_deref().ok_or("Gateway URL is required")?)?;
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|_| "Cannot serialize application configuration")?;
    let vault_saved = crate::gateway_vault::write(&bytes).is_ok();
    let file_result = (|| {
        std::fs::create_dir_all(path.parent().ok_or("Invalid app configuration directory")?)
            .map_err(|_| "Cannot create application configuration directory")?;
        let temporary = path.with_extension("json.pending");
        std::fs::write(&temporary, bytes).map_err(|_| "Cannot write application authorization")?;
        std::fs::rename(&temporary, path).map_err(|_| "Cannot save application authorization")
    })();
    if vault_saved {
        Ok(())
    } else {
        file_result.map_err(str::to_string)
    }
}

/// Handles secure stdin provisioning before opening any window. No credential
/// is accepted on the command line or written to diagnostic output.
pub fn startup(app: &tauri::AppHandle) -> bool {
    let configure = std::env::args().any(|arg| arg == "--configure-gateway");
    let check = std::env::args().any(|arg| arg == "--gateway-status");
    let path = match config_paths(app) {
        Ok(paths) => paths[0].clone(),
        Err(_) => return false,
    };
    let result = if configure {
        use std::io::Read;
        let mut input = String::new();
        std::io::stdin()
            .take(16_384)
            .read_to_string(&mut input)
            .map_err(|_| "Cannot read application authorization".to_string())
            .and_then(|_| {
                serde_json::from_str::<GatewayConfig>(&input)
                    .map_err(|_| "Invalid authorization input".into())
            })
            .and_then(|config| persist_config(&path, &config))
    } else {
        effective_config(app).and_then(|config| persist_config(&path, &config))
    };
    let status = serde_json::json!({"configured": result.is_ok(), "configPath":path, "error":result.as_ref().err()});
    // Safe diagnostics distinguish the actual native configuration directory
    // from a guessed Node/shell path; never include the token or its hash.
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
        let _ = std::fs::write(parent.join("gateway-status.json"), status.to_string());
    }
    if configure || check {
        println!("{status}");
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    }
    false
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
    let config = effective_config(&app)?;
    let url = config.url.ok_or("Gateway URL is not configured")?;
    let token = config
        .app_token
        .ok_or("Application access is not configured")?;
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
    fn cold_launch_uses_saved_application_access_without_environment_variables() {
        let root =
            std::env::temp_dir().join(format!("deplyzeview-cold-auth-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("gateway.json");
        std::fs::write(&path, br#"{"url":"https://gateway.example","appToken":"test-application-credential-at-least-32-chars"}"#).unwrap();
        let result = resolve_config(&[path.clone()], None, None, None).unwrap();
        assert_eq!(result.url.as_deref(), Some("https://gateway.example"));
        assert!(result.app_token.is_some());
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn missing_primary_file_falls_back_to_development_or_migrated_access() {
        let root =
            std::env::temp_dir().join(format!("deplyzeview-fallback-auth-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let fallback = root.join("development.json");
        std::fs::write(&fallback, br#"{"url":"https://gateway.example","appToken":"test-application-credential-at-least-32-chars"}"#).unwrap();
        let result = resolve_config(
            &[root.join("absent.json"), fallback.clone()],
            None,
            Some("  ".into()),
            None,
        )
        .unwrap();
        assert_eq!(result.url.as_deref(), Some("https://gateway.example"));
        std::fs::remove_file(fallback).unwrap();
        std::fs::remove_dir(root).unwrap();
    }

    #[test]
    fn utf8_bom_and_legacy_field_names_do_not_drop_application_access() {
        let root =
            std::env::temp_dir().join(format!("deplyzeview-legacy-auth-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("gateway.json");
        let mut bytes = vec![0xef, 0xbb, 0xbf];
        bytes.extend_from_slice(br#"{"url":"https://gateway.example","app_token":"test-application-credential-at-least-32-chars"}"#);
        std::fs::write(&path, bytes).unwrap();
        assert!(resolve_config(&[path.clone()], None, None, None)
            .unwrap()
            .app_token
            .is_some());
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
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
