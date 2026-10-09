use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::time::sleep;

use crate::cache::PersistentCache;
use crate::error::AppError;

#[derive(Clone)]
pub struct RpcClient {
    client: Client,
    url: String,
    user: String,
    password: String,
    api_key: Option<String>,
    cache: Arc<RpcMemoryCache>,
    persistent_cache: Option<Arc<PersistentCache>>,
}

#[derive(Deserialize)]
struct RpcEnvelope {
    result: Option<Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize)]
struct RpcError {
    message: String,
}

struct RpcMemoryCache {
    items: Mutex<HashMap<String, RpcCacheEntry>>,
}

#[derive(Clone)]
struct RpcCacheEntry {
    value: Value,
    stored_at: Instant,
}

impl RpcMemoryCache {
    fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }

    fn fresh(&self, key: &str, ttl: Duration) -> Option<Value> {
        self.items
            .lock()
            .ok()
            .and_then(|items| {
                items
                    .get(key)
                    .filter(|entry| entry.stored_at.elapsed() <= ttl)
                    .cloned()
            })
            .map(|entry| entry.value)
    }

    fn stale(&self, key: &str) -> Option<Value> {
        self.items
            .lock()
            .ok()
            .and_then(|items| items.get(key).cloned())
            .map(|entry| entry.value)
    }

    fn insert(&self, key: String, value: Value) {
        if let Ok(mut items) = self.items.lock() {
            items.insert(
                key,
                RpcCacheEntry {
                    value,
                    stored_at: Instant::now(),
                },
            );
        }
    }
}

impl RpcClient {
    pub fn new(
        url: String,
        user: String,
        password: String,
        api_key: Option<String>,
        persistent_cache: Option<Arc<PersistentCache>>,
    ) -> Self {
        Self {
            client: Client::new(),
            url,
            user,
            password,
            api_key,
            cache: Arc::new(RpcMemoryCache::new()),
            persistent_cache,
        }
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value, AppError> {
        let cache_policy = rpc_cache_policy(method);
        let cache_key = cache_policy.map(|ttl| {
            (
                ttl,
                format!(
                    "rpc:{}:{}:{}",
                    provider_key(&self.url),
                    method,
                    serde_json::to_string(&params).unwrap_or_default()
                ),
            )
        });

        if let Some((ttl, key)) = &cache_key {
            if let Some(value) = self.cache.fresh(key, *ttl) {
                return Ok(value);
            }
            if let Some(cache) = &self.persistent_cache {
                if let Some(value) = cache.fresh::<Value>(key).await {
                    self.cache.insert(key.clone(), value.clone());
                    return Ok(value);
                }
            }
        }

        let body = json!({
            "jsonrpc": "1.0",
            "id": "bitscan",
            "method": method,
            "params": params,
        });

        let mut last_rate_limit = None;
        for attempt in 0..3 {
            let mut request = self.client.post(&self.url).json(&body);

            request = if let Some(api_key) = &self.api_key {
                request.header("X-API-Key", api_key)
            } else {
                request.basic_auth(&self.user, Some(&self.password))
            };

            let response = request.send().await?;
            if response.status() == StatusCode::TOO_MANY_REQUESTS {
                last_rate_limit = Some(response.error_for_status().unwrap_err());
                sleep(Duration::from_millis(350 * (attempt + 1))).await;
                continue;
            }

            let envelope = response.error_for_status()?.json::<RpcEnvelope>().await?;

            if let Some(error) = envelope.error {
                return Err(AppError::Rpc(error.message));
            }

            let result = envelope
                .result
                .ok_or_else(|| AppError::Rpc(format!("{method} returned no result")))?;

            if let Some((ttl, key)) = &cache_key {
                self.cache.insert(key.clone(), result.clone());
                if let Some(cache) = &self.persistent_cache {
                    cache.insert(key, "bitcoin-rpc", *ttl, &result).await;
                }
            }

            return Ok(result);
        }

        let error = last_rate_limit
            .map(AppError::from)
            .unwrap_or_else(|| AppError::Rpc(format!("{method} was rate limited")));

        if let Some((_, key)) = &cache_key {
            if let Some(value) = self.cache.stale(key) {
                return Ok(value);
            }
            if let Some(cache) = &self.persistent_cache {
                if let Some(value) = cache.stale::<Value>(key).await {
                    self.cache.insert(key.clone(), value.clone());
                    return Ok(value);
                }
            }
        }

        Err(error)
    }
}

fn rpc_cache_policy(method: &str) -> Option<Duration> {
    match method {
        "getblock" | "getblockhash" | "getrawtransaction" => Some(Duration::from_secs(60 * 60)),
        _ => None,
    }
}

fn provider_key(url: &str) -> String {
    let mut value = url
        .trim()
        .trim_end_matches('/')
        .replace("https://", "")
        .replace("http://", "");
    if let Some((host, _)) = value.split_once('/') {
        value = host.to_owned();
    }
    value
}
