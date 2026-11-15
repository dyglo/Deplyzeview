//! Secure backend integration for AI Quant using the official OpenAI-compatible DeepSeek API.
//! Credentials remain strictly in the backend runtime and are never exposed to the WebView,
//! browser storage, logs, or distributed binaries.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Emitter, Manager};
use tokio::sync::{Semaphore, watch};

pub const DEFAULT_DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
pub const DEFAULT_DEEPSEEK_MODEL: &str = "deepseek-flash";
const MAX_IMAGE_DATA_URL_LEN: usize = 15 * 1024 * 1024; // ~10MB binary in base64
const MAX_IMAGES_PER_MESSAGE: usize = 4;
const MAX_CONCURRENT_REQUESTS: usize = 16;

pub struct AiQuantState {
    active_streams: Mutex<HashMap<String, watch::Sender<bool>>>,
    http_client: reqwest::Client,
    concurrency_limiter: Arc<Semaphore>,
}

impl AiQuantState {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(16)
            .tcp_keepalive(Duration::from_secs(30))
            .http1_only()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            active_streams: Mutex::new(HashMap::new()),
            http_client,
            concurrency_limiter: Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS)),
        }
    }

    pub fn register(&self, request_id: &str) -> watch::Receiver<bool> {
        let (tx, rx) = watch::channel(false);
        if let Ok(mut map) = self.active_streams.lock() {
            if let Some(prev) = map.insert(request_id.to_string(), tx) {
                let _ = prev.send(true);
            }
        }
        rx
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        if let Ok(mut map) = self.active_streams.lock() {
            if let Some(tx) = map.remove(request_id) {
                let _ = tx.send(true);
                return true;
            }
        }
        false
    }

    pub fn remove(&self, request_id: &str) {
        if let Ok(mut map) = self.active_streams.lock() {
            map.remove(request_id);
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepSeekConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

fn nonempty(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn parse_dotenv_bytes(bytes: &[u8]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    let text = String::from_utf8_lossy(bytes);
    for raw_line in text.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").map(str::trim).unwrap_or(line);
        if let Some((k, v)) = line.split_once('=') {
            let key = k.trim().to_string();
            let mut val = v.trim().to_string();
            if (val.starts_with('"') && val.ends_with('"') && val.len() >= 2)
                || (val.starts_with('\'') && val.ends_with('\'') && val.len() >= 2)
            {
                val = val[1..val.len() - 1].to_string();
            }
            map.insert(key, val);
        }
    }
    map
}

fn worktree_main_env_path(dir: &std::path::Path) -> Option<PathBuf> {
    let git_file = dir.join(".git");
    let raw = std::fs::read_to_string(git_file).ok()?;
    let gitdir_str = raw.trim().strip_prefix("gitdir:")?.trim();
    let gitdir = PathBuf::from(gitdir_str);
    let worktrees_dir = gitdir.parent()?;
    if worktrees_dir.file_name().and_then(|s| s.to_str()) != Some("worktrees") {
        return None;
    }
    let dot_git = worktrees_dir.parent()?;
    if dot_git.file_name().and_then(|s| s.to_str()) != Some(".git") {
        return None;
    }
    let main_repo = dot_git.parent()?;
    Some(main_repo.join(".env"))
}

fn candidate_dotenv_paths(app: Option<&tauri::AppHandle>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env"));
        if let Some(wt_env) = worktree_main_env_path(&cwd) {
            if !paths.contains(&wt_env) {
                paths.push(wt_env);
            }
        }
        if let Some(parent) = cwd.parent() {
            paths.push(parent.join(".env"));
            if let Some(wt_env) = worktree_main_env_path(parent) {
                if !paths.contains(&wt_env) {
                    paths.push(wt_env);
                }
            }
        }
    }
    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        if let Some(root) = manifest_dir.parent() {
            let root_env = root.join(".env");
            if !paths.contains(&root_env) {
                paths.push(root_env);
            }
            if let Some(wt_env) = worktree_main_env_path(root) {
                if !paths.contains(&wt_env) {
                    paths.push(wt_env);
                }
            }
        }
    }
    if let Some(handle) = app {
        if let Ok(cfg_dir) = handle.path().app_config_dir() {
            paths.push(cfg_dir.join(".env"));
        }
    }
    paths
}

pub fn validate_deepseek_url(value: &str) -> Result<reqwest::Url, String> {
    let trimmed = value.trim().trim_end_matches('/');
    let url = reqwest::Url::parse(trimmed).map_err(|_| "Invalid DEEPSEEK_BASE_URL".to_string())?;
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && loopback))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "DEEPSEEK_BASE_URL requires HTTPS (or loopback HTTP for local testing) without embedded credentials, query, or fragment".into(),
        );
    }
    Ok(url)
}

pub fn validate_deepseek_model(model: &str) -> Result<String, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Ok(DEFAULT_DEEPSEEK_MODEL.to_string());
    }
    if trimmed != "deepseek-flash" && !trimmed.starts_with("deepseek-flash") {
        return Err(format!(
            "Unsupported model '{}'. AI Quant exclusively uses deepseek-flash.",
            trimmed
        ));
    }
    Ok(trimmed.to_string())
}

pub fn resolve_deepseek_config(
    env_vars: &HashMap<String, String>,
    dotenv_files: &[PathBuf],
) -> Result<DeepSeekConfig, String> {
    let mut file_vars: HashMap<String, String> = HashMap::new();
    for path in dotenv_files {
        if let Ok(bytes) = std::fs::read(path) {
            for (k, v) in parse_dotenv_bytes(&bytes) {
                let existing_nonempty = file_vars
                    .get(&k)
                    .map(|existing| !existing.trim().is_empty())
                    .unwrap_or(false);
                if !existing_nonempty && !v.trim().is_empty() {
                    file_vars.insert(k, v);
                } else {
                    file_vars.entry(k).or_insert(v);
                }
            }
        }
    }

    let get_var = |key: &str| -> Option<String> {
        nonempty(env_vars.get(key).cloned()).or_else(|| nonempty(file_vars.get(key).cloned()))
    };

    let base_url_raw =
        get_var("DEEPSEEK_BASE_URL").unwrap_or_else(|| DEFAULT_DEEPSEEK_BASE_URL.to_string());
    let validated_url = validate_deepseek_url(&base_url_raw)?;
    let base_url = validated_url.as_str().trim_end_matches('/').to_string();

    let model_raw = get_var("DEEPSEEK_MODEL").unwrap_or_else(|| DEFAULT_DEEPSEEK_MODEL.to_string());
    let model = validate_deepseek_model(&model_raw)?;

    let api_key = get_var("DEEPSEEK_API_KEY").ok_or_else(|| {
        "DeepSeek API key is not configured. Add DEEPSEEK_API_KEY to your local .env file.".to_string()
    })?;

    Ok(DeepSeekConfig {
        api_key,
        base_url,
        model,
    })
}

fn current_env_map() -> HashMap<String, String> {
    let mut map = HashMap::new();
    for key in ["DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"] {
        if let Ok(val) = std::env::var(key) {
            map.insert(key.to_string(), val);
        }
    }
    map
}

pub fn validate_image_data_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.len() > MAX_IMAGE_DATA_URL_LEN {
        return Err("Attached image exceeds the maximum supported size (10 MB).".into());
    }
    let allowed_prefixes = [
        "data:image/jpeg;base64,",
        "data:image/png;base64,",
        "data:image/gif;base64,",
        "data:image/webp;base64,",
    ];
    if allowed_prefixes.iter().any(|prefix| trimmed.starts_with(prefix)) {
        let (_, b64) = trimmed.split_once(";base64,").unwrap_or(("", ""));
        if b64.trim().is_empty() {
            return Err("Attached image payload is empty.".into());
        }
        return Ok(());
    }
    if trimmed.starts_with("file-") || trimmed.starts_with("https://") {
        return Ok(());
    }
    Err("Unsupported image format. Only JPEG, PNG, GIF, and WebP images are supported.".into())
}

pub fn validate_messages(messages: &[Value]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("Request must contain at least one message.".into());
    }
    for msg in messages {
        let role = msg
            .get("role")
            .and_then(Value::as_str)
            .ok_or("Each message must specify a valid role.")?;
        if !["system", "user", "assistant", "tool"].contains(&role) {
            return Err(format!("Unsupported message role '{}'.", role));
        }
        let content = msg.get("content");
        match content {
            Some(Value::String(_)) => {}
            Some(Value::Array(parts)) => {
                if role != "user" {
                    return Err("Multimodal content arrays with images are only supported in 'user' role messages.".into());
                }
                if parts.is_empty() {
                    return Err("User message content array cannot be empty.".into());
                }
                let mut image_count = 0usize;
                for part in parts {
                    let part_type = part
                        .get("type")
                        .and_then(Value::as_str)
                        .ok_or("Message content part is missing 'type'.")?;
                    match part_type {
                        "text" => {
                            if part.get("text").and_then(Value::as_str).is_none() {
                                return Err("Text content part is missing 'text' string.".into());
                            }
                        }
                        "image_url" => {
                            image_count += 1;
                            if image_count > MAX_IMAGES_PER_MESSAGE {
                                return Err(format!(
                                    "A single message can include at most {} reference images.",
                                    MAX_IMAGES_PER_MESSAGE
                                ));
                            }
                            let url = part
                                .get("image_url")
                                .and_then(|v| v.get("url"))
                                .and_then(Value::as_str)
                                .ok_or("image_url part is missing 'image_url.url'.")?;
                            validate_image_data_url(url)?;
                        }
                        other => {
                            return Err(format!("Unsupported message content part type '{}'.", other));
                        }
                    }
                }
            }
            Some(Value::Null) if role == "assistant" => {}
            _ => return Err("Message content must be a string or valid user content array.".into()),
        }
    }
    Ok(())
}

pub fn sanitize_error_message(message: &str, api_key: &str) -> String {
    let mut out = message.to_string();
    if !api_key.trim().is_empty() {
        out = out.replace(api_key.trim(), "[REDACTED]");
    }
    out
}

#[tauri::command]
pub async fn get_ai_quant_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiQuantState>,
) -> Result<Value, String> {
    let dotenv_paths = candidate_dotenv_paths(Some(&app));
    let env_map = current_env_map();
    let direct_cfg = resolve_deepseek_config(&env_map, &dotenv_paths);

    if let Ok((gateway_url, app_token)) = crate::remote_data::gateway_access(&app) {
        let status_url = format!("{}/v1/ai-quant/status", gateway_url.trim_end_matches('/'));
        if let Ok(resp) = state
            .http_client
            .get(&status_url)
            .bearer_auth(&app_token)
            .timeout(Duration::from_secs(8))
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(body) = resp.json::<Value>().await {
                    if body.get("configured").and_then(Value::as_bool) == Some(true) {
                        return Ok(json!({
                            "configured": true,
                            "model": body.get("model").and_then(Value::as_str).unwrap_or(DEFAULT_DEEPSEEK_MODEL),
                            "baseUrl": gateway_url,
                            "mode": "gateway",
                        }));
                    }
                }
            }
        }
        if direct_cfg.is_err() {
            return Ok(json!({
                "configured": true,
                "model": DEFAULT_DEEPSEEK_MODEL,
                "baseUrl": gateway_url,
                "mode": "gateway",
            }));
        }
    }

    match direct_cfg {
        Ok(cfg) => Ok(json!({
            "configured": true,
            "model": cfg.model,
            "baseUrl": cfg.base_url,
            "mode": "direct",
        })),
        Err(err) => Ok(json!({
            "configured": false,
            "model": DEFAULT_DEEPSEEK_MODEL,
            "baseUrl": DEFAULT_DEEPSEEK_BASE_URL,
            "error": err,
        })),
    }
}

#[tauri::command]
pub async fn cancel_ai_quant_stream(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiQuantState>,
    request_id: String,
) -> Result<bool, String> {
    let cancelled = state.cancel(&request_id);
    if let Ok((gateway_url, app_token)) = crate::remote_data::gateway_access(&app) {
        let cancel_url = format!("{}/v1/ai-quant/cancel", gateway_url.trim_end_matches('/'));
        let client = state.http_client.clone();
        let req_id = request_id.clone();
        tokio::spawn(async move {
            let _ = client
                .post(&cancel_url)
                .bearer_auth(&app_token)
                .json(&json!({ "requestId": req_id }))
                .timeout(Duration::from_secs(5))
                .send()
                .await;
        });
    }
    Ok(cancelled)
}

#[tauri::command]
pub async fn stream_ai_quant_completion(
    app: tauri::AppHandle,
    state: tauri::State<'_, AiQuantState>,
    request_id: String,
    messages: Vec<Value>,
    tools: Option<Vec<Value>>,
    temperature: Option<f64>,
) -> Result<Value, String> {
    validate_messages(&messages)?;
    let dotenv_paths = candidate_dotenv_paths(Some(&app));
    let env_map = current_env_map();
    let gateway_creds = crate::remote_data::gateway_access(&app).ok();
    let direct_cfg = resolve_deepseek_config(&env_map, &dotenv_paths).ok();

    if gateway_creds.is_none() && direct_cfg.is_none() {
        return Err(
            "AI Quant is not configured. Ensure the Render gateway is provisioned or add DEEPSEEK_API_KEY to .env.".into(),
        );
    }

    let mut cancel_rx = state.register(&request_id);
    let model_name = direct_cfg
        .as_ref()
        .map(|c| c.model.clone())
        .unwrap_or_else(|| DEFAULT_DEEPSEEK_MODEL.to_string());

    let mut payload = json!({
        "requestId": request_id,
        "model": model_name,
        "messages": messages,
        "stream": true,
        "thinking": { "type": "disabled" },
        "max_tokens": 8192,
        "temperature": temperature.unwrap_or(0.2),
    });
    if let Some(tool_defs) = tools {
        if !tool_defs.is_empty() {
            payload["tools"] = Value::Array(tool_defs);
        }
    }

    let _permit = state
        .concurrency_limiter
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "AI Quant concurrency limiter closed".to_string())?;

    // Prefer the deployed Render gateway when available; fall back to direct DeepSeek API if gateway isn't ready.
    let mut use_gateway = gateway_creds.is_some();
    let redact_token = |via_gateway: bool| -> String {
        if via_gateway {
            gateway_creds
                .as_ref()
                .map(|(_, tok)| tok.clone())
                .unwrap_or_default()
        } else {
            direct_cfg
                .as_ref()
                .map(|c| c.api_key.clone())
                .unwrap_or_default()
        }
    };

    let build_target = |via_gateway: bool| -> Option<(String, String)> {
        if via_gateway {
            let (gw_url, gw_token) = gateway_creds.as_ref()?;
            Some((
                format!("{}/v1/ai-quant/chat", gw_url.trim_end_matches('/')),
                gw_token.clone(),
            ))
        } else {
            let cfg = direct_cfg.as_ref()?;
            Some((
                format!("{}/chat/completions", cfg.base_url.trim_end_matches('/')),
                cfg.api_key.clone(),
            ))
        }
    };

    let send_upstream = |via_gateway: bool, stream_flag: bool, body_override: Option<Value>| {
        let (endpoint, bearer) = build_target(via_gateway).expect("valid upstream target");
        let mut req_body = body_override.unwrap_or_else(|| payload.clone());
        req_body["stream"] = Value::Bool(stream_flag);
        if !via_gateway {
            if let Some(obj) = req_body.as_object_mut() {
                obj.remove("requestId");
            }
        }
        let accept_hdr = if stream_flag {
            "text/event-stream"
        } else {
            "application/json"
        };
        state
            .http_client
            .post(&endpoint)
            .bearer_auth(&bearer)
            .header("Content-Type", "application/json")
            .header("Accept", accept_hdr)
            .header("Accept-Encoding", "identity")
            .json(&req_body)
            .send()
    };

    let mut response_opt = None;
    for retry_idx in 0..=2u8 {
        let send_fut = send_upstream(use_gateway, true, None);

        let candidate = tokio::select! {
            res = send_fut => res,
            _ = cancel_rx.changed() => {
                state.remove(&request_id);
                return Err("Generation cancelled by user.".into());
            }
        };

        match candidate {
            Ok(resp) => {
                let code = resp.status().as_u16();
                if use_gateway && matches!(code, 404 | 501 | 502 | 503) && direct_cfg.is_some() {
                    use_gateway = false;
                    continue;
                }
                if matches!(code, 429 | 502 | 503 | 504) && retry_idx < 2 {
                    tokio::time::sleep(Duration::from_millis(350 * u64::from(retry_idx + 1))).await;
                    continue;
                }
                response_opt = Some(resp);
                break;
            }
            Err(e) => {
                if use_gateway && direct_cfg.is_some() {
                    use_gateway = false;
                    continue;
                }
                if retry_idx < 2 && (e.is_connect() || e.is_request()) {
                    tokio::time::sleep(Duration::from_millis(300 * u64::from(retry_idx + 1))).await;
                    continue;
                }
                state.remove(&request_id);
                if e.is_timeout() {
                    return Err("DeepSeek API request timed out. Please try again.".to_string());
                }
                return Err(sanitize_error_message(
                    &format!("DeepSeek API connection failed: {}", e),
                    &redact_token(use_gateway),
                ));
            }
        }
    }

    let mut response = response_opt.ok_or_else(|| {
        state.remove(&request_id);
        "DeepSeek API did not return a response.".to_string()
    })?;

    let status = response.status();
    if !status.is_success() {
        let body_text = response.text().await.unwrap_or_default();
        state.remove(&request_id);
        let parsed_msg = serde_json::from_str::<Value>(&body_text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| match status.as_u16() {
                401 | 403 => "DeepSeek API authentication failed. Verify gateway or API credentials.".to_string(),
                429 => "DeepSeek API rate limit reached. Please wait a moment and try again.".to_string(),
                _ => format!("DeepSeek API returned HTTP {}", status.as_u16()),
            });
        return Err(sanitize_error_message(&parsed_msg, &redact_token(use_gateway)));
    }

    let mut full_content = String::new();
    let mut full_reasoning = String::new();
    let mut tool_calls: Vec<Value> = Vec::new();
    let mut raw_bytes: Vec<u8> = Vec::new();
    let mut saw_done_marker = false;
    let mut stream_decode_err: Option<reqwest::Error> = None;

    'stream_loop: loop {
        let next_chunk = tokio::select! {
            chunk = tokio::time::timeout(Duration::from_secs(90), response.chunk()) => {
                match chunk {
                    Ok(res) => res,
                    Err(_) => {
                        state.remove(&request_id);
                        return Err("DeepSeek stream timed out while waiting for next token.".into());
                    }
                }
            },
            _ = cancel_rx.changed() => {
                state.remove(&request_id);
                return Err("Generation cancelled by user.".into());
            }
        };

        let chunk = match next_chunk {
            Ok(Some(bytes)) => bytes,
            Ok(None) => break,
            Err(e) => {
                stream_decode_err = Some(e);
                break;
            }
        };

        raw_bytes.extend_from_slice(&chunk);
        while let Some(newline_idx) = raw_bytes.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = raw_bytes.drain(..=newline_idx).collect();
            let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let Some(data_str) = line.strip_prefix("data:") else {
                continue;
            };
            let data_trimmed = data_str.trim();
            if data_trimmed == "[DONE]" {
                saw_done_marker = true;
                break 'stream_loop;
            }
            if let Ok(frame) = serde_json::from_str::<Value>(data_trimmed) {
                if let Some(choice) = frame
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|c| c.first())
                {
                    if let Some(delta) = choice.get("delta") {
                        let content_delta = delta
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let reasoning_delta = delta
                            .get("reasoning_content")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        if !content_delta.is_empty() {
                            full_content.push_str(content_delta);
                        }
                        if !reasoning_delta.is_empty() {
                            full_reasoning.push_str(reasoning_delta);
                        }
                        if let Some(tc_array) = delta.get("tool_calls").and_then(Value::as_array) {
                            for tc in tc_array {
                                let idx = tc.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
                                while tool_calls.len() <= idx {
                                    tool_calls.push(json!({
                                        "id": "",
                                        "type": "function",
                                        "function": { "name": "", "arguments": "" }
                                    }));
                                }
                                if let Some(id) = tc.get("id").and_then(Value::as_str) {
                                    if !id.is_empty() {
                                        tool_calls[idx]["id"] = Value::String(id.to_string());
                                    }
                                }
                                if let Some(func) = tc.get("function") {
                                    if let Some(name) = func.get("name").and_then(Value::as_str) {
                                        let prev = tool_calls[idx]["function"]["name"]
                                            .as_str()
                                            .unwrap_or("");
                                        tool_calls[idx]["function"]["name"] =
                                            Value::String(format!("{}{}", prev, name));
                                    }
                                    if let Some(args) = func.get("arguments").and_then(Value::as_str) {
                                        let prev = tool_calls[idx]["function"]["arguments"]
                                            .as_str()
                                            .unwrap_or("");
                                        tool_calls[idx]["function"]["arguments"] =
                                            Value::String(format!("{}{}", prev, args));
                                    }
                                }
                            }
                        }
                        if !content_delta.is_empty() || !reasoning_delta.is_empty() {
                            let _ = app.emit(
                                "ai-quant-stream",
                                json!({
                                    "requestId": request_id,
                                    "delta": content_delta,
                                    "reasoningDelta": reasoning_delta,
                                    "done": false,
                                }),
                            );
                        }
                    }
                }
            }
        }
    }

    // Flush any trailing line in raw_bytes that arrived before EOF without a trailing '\n'
    if !raw_bytes.is_empty() && !saw_done_marker {
        let trailing = String::from_utf8_lossy(&raw_bytes).trim().to_string();
        if let Some(data_str) = trailing.strip_prefix("data:") {
            let data_trimmed = data_str.trim();
            if data_trimmed == "[DONE]" {
                saw_done_marker = true;
            } else if let Ok(frame) = serde_json::from_str::<Value>(data_trimmed) {
                if let Some(delta) = frame
                    .get("choices")
                    .and_then(Value::as_array)
                    .and_then(|c| c.first())
                    .and_then(|c| c.get("delta"))
                {
                    let content_delta = delta.get("content").and_then(Value::as_str).unwrap_or("");
                    if !content_delta.is_empty() {
                        full_content.push_str(content_delta);
                        let _ = app.emit(
                            "ai-quant-stream",
                            json!({
                                "requestId": request_id,
                                "delta": content_delta,
                                "reasoningDelta": "",
                                "done": false,
                            }),
                        );
                    }
                }
            }
        }
    }

    // If the chunked SSE body encountered a mid-stream transport/decode error before [DONE]:
    // 1. Check if full_content already contains a complete fenced Pine block (`indicator(` and closing ```).
    // 2. Otherwise seamlessly recover by completing the generation via a non-streaming request.
    if let Some(err) = stream_decode_err {
        let trimmed_check = full_content.trim();
        let fence_count = trimmed_check.matches("```").count();
        let has_complete_code_fence =
            saw_done_marker || (fence_count >= 2 && trimmed_check.contains("indicator("));

        if !has_complete_code_fence {
            let fallback_fut = send_upstream(use_gateway, false, None);
            let fallback_res = tokio::select! {
                res = fallback_fut => res,
                _ = cancel_rx.changed() => {
                    state.remove(&request_id);
                    return Err("Generation cancelled by user.".into());
                }
            };

            let mut recovered = false;
            if let Ok(fb_resp) = fallback_res {
                if fb_resp.status().is_success() {
                    if let Ok(fb_json) = fb_resp.json::<Value>().await {
                        if let Some(msg_obj) = fb_json
                            .get("choices")
                            .and_then(Value::as_array)
                            .and_then(|c| c.first())
                            .and_then(|c| c.get("message"))
                        {
                            let fb_content = msg_obj
                                .get("content")
                                .and_then(Value::as_str)
                                .unwrap_or("");
                            if !fb_content.is_empty() {
                                full_content = fb_content.to_string();
                                let _ = app.emit(
                                    "ai-quant-stream",
                                    json!({
                                        "requestId": request_id,
                                        "delta": fb_content,
                                        "reasoningDelta": "",
                                        "done": false,
                                    }),
                                );
                                recovered = true;
                            }
                        }
                    }
                }
            }

            if !recovered {
                state.remove(&request_id);
                return Err(sanitize_error_message(
                    &format!("DeepSeek stream interrupted: {}", err),
                    &redact_token(use_gateway),
                ));
            }
        }
    }

    state.remove(&request_id);
    let _ = app.emit(
        "ai-quant-stream",
        json!({
            "requestId": request_id,
            "delta": "",
            "done": true,
        }),
    );

    if let Some(idx) = full_content.find("<ds_safety>") {
        full_content.truncate(idx);
    }

    Ok(json!({
        "content": full_content.trim(),
        "reasoning": full_reasoning,
        "toolCalls": tool_calls,
        "model": model_name,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_api_key_fails_gracefully_with_actionable_message() {
        let env_map = HashMap::new();
        let err = resolve_deepseek_config(&env_map, &[]).unwrap_err();
        assert!(err.contains("DEEPSEEK_API_KEY"));
    }

    #[test]
    fn resolves_default_deepseek_flash_and_base_url() {
        let mut env_map = HashMap::new();
        env_map.insert("DEEPSEEK_API_KEY".into(), "sk-test-secret-123".into());
        let cfg = resolve_deepseek_config(&env_map, &[]).unwrap();
        assert_eq!(cfg.base_url, "https://api.deepseek.com");
        assert_eq!(cfg.model, "deepseek-flash");
        assert_eq!(cfg.api_key, "sk-test-secret-123");
    }

    #[test]
    fn rejects_non_deepseek_flash_models_and_insecure_urls() {
        let mut env_map = HashMap::new();
        env_map.insert("DEEPSEEK_API_KEY".into(), "sk-test-secret-123".into());
        env_map.insert("DEEPSEEK_MODEL".into(), "gpt-4o".into());
        assert!(resolve_deepseek_config(&env_map, &[]).is_err());

        env_map.insert("DEEPSEEK_MODEL".into(), "deepseek-flash".into());
        env_map.insert("DEEPSEEK_BASE_URL".into(), "http://api.deepseek.com".into());
        assert!(resolve_deepseek_config(&env_map, &[]).is_err());

        env_map.insert("DEEPSEEK_BASE_URL".into(), "http://127.0.0.1:19876".into());
        assert!(resolve_deepseek_config(&env_map, &[]).is_ok());
    }

    #[test]
    fn validates_multimodal_messages_and_supported_image_formats() {
        let valid = vec![
            json!({"role": "system", "content": "You are AI Quant."}),
            json!({
                "role": "user",
                "content": [
                    {"type": "text", "text": "Build this indicator"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgo="}},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ"}},
                    {"type": "image_url", "image_url": {"url": "data:image/gif;base64,R0lGODlh"}},
                    {"type": "image_url", "image_url": {"url": "data:image/webp;base64,UklGRg=="}}
                ]
            }),
        ];
        assert!(validate_messages(&valid).is_ok());

        let bad_role = vec![json!({
            "role": "assistant",
            "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgo="}}]
        })];
        assert!(validate_messages(&bad_role).is_err());

        let bad_mime = vec![json!({
            "role": "user",
            "content": [{"type": "image_url", "image_url": {"url": "data:image/svg+xml;base64,PHN2Zz4="}}]
        })];
        assert!(validate_messages(&bad_mime).is_err());
    }

    #[test]
    fn redacts_api_key_from_any_error_string() {
        let scrubbed = sanitize_error_message("Failed with token sk-secret-xyz", "sk-secret-xyz");
        assert!(!scrubbed.contains("sk-secret-xyz"));
        assert!(scrubbed.contains("[REDACTED]"));
    }
}
