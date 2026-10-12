use std::{
    collections::{HashMap, HashSet},
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
    /// Methods this provider has refused with "not permitted". Hosted RPC
    /// providers allowlist methods, and a refusal still costs a full round
    /// trip, so we only pay it once per method per process.
    unsupported: Arc<Mutex<HashSet<String>>>,
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

/// Upper bound on cached RPC results held in memory.
///
/// A verbosity-2 mainnet block is several megabytes of JSON, and the parsed
/// `Value` is larger still. Entries are deliberately kept past their TTL so the
/// stale-fallback path can serve them when a provider is down, which means
/// nothing ever removes them on its own — the tip advances, new keys arrive,
/// and the map grows for the lifetime of the process. This caps it and evicts
/// whatever was used least recently.
const MAX_MEMORY_ENTRIES: usize = 256;

struct RpcMemoryCache {
    items: Mutex<HashMap<String, RpcCacheEntry>>,
}

#[derive(Clone)]
struct RpcCacheEntry {
    value: Value,
    stored_at: Instant,
    last_used: Instant,
}

impl RpcMemoryCache {
    fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }

    /// Evict least-recently-used entries until the map is back under the cap.
    /// Called with the lock held.
    fn evict(items: &mut HashMap<String, RpcCacheEntry>) {
        while items.len() > MAX_MEMORY_ENTRIES {
            let oldest = items
                .iter()
                .min_by_key(|(_, entry)| entry.last_used)
                .map(|(key, _)| key.clone());
            match oldest {
                Some(key) => {
                    items.remove(&key);
                }
                None => break,
            }
        }
    }

    fn fresh(&self, key: &str, ttl: Duration) -> Option<Value> {
        let mut items = self.items.lock().ok()?;
        let entry = items.get_mut(key)?;
        if entry.stored_at.elapsed() > ttl {
            return None;
        }
        entry.last_used = Instant::now();
        Some(entry.value.clone())
    }

    fn stale(&self, key: &str) -> Option<Value> {
        let mut items = self.items.lock().ok()?;
        let entry = items.get_mut(key)?;
        entry.last_used = Instant::now();
        Some(entry.value.clone())
    }

    fn insert(&self, key: String, value: Value) {
        if let Ok(mut items) = self.items.lock() {
            let now = Instant::now();
            items.insert(
                key,
                RpcCacheEntry {
                    value,
                    stored_at: now,
                    last_used: now,
                },
            );
            Self::evict(&mut items);
        }
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.items.lock().map(|items| items.len()).unwrap_or(0)
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
            unsupported: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    fn is_unsupported(&self, method: &str) -> bool {
        self.unsupported
            .lock()
            .map(|methods| methods.contains(method))
            .unwrap_or(false)
    }

    fn mark_unsupported(&self, method: &str) {
        if let Ok(mut methods) = self.unsupported.lock() {
            if methods.insert(method.to_owned()) {
                tracing::info!(
                    method,
                    "provider refused this method; skipping it from now on"
                );
            }
        }
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value, AppError> {
        if self.is_unsupported(method) {
            return Err(AppError::Rpc(format!(
                "method `{method}` is not permitted by this provider"
            )));
        }

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
            if response.status() == StatusCode::BAD_REQUEST {
                let detail = response.text().await.unwrap_or_default();
                if detail.contains("not permitted") {
                    self.mark_unsupported(method);
                    return Err(AppError::Rpc(format!(
                        "method `{method}` is not permitted by this provider"
                    )));
                }
                return Err(AppError::Rpc(format!("{method} was rejected: {detail}")));
            }
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
        // Immutable once buried: a confirmed block or transaction never changes.
        "getblock" | "getblockhash" | "getrawtransaction" => Some(Duration::from_secs(60 * 60)),
        // Chain tip and mempool are hit by every page load. Blocks arrive every
        // ~10 minutes, so a few seconds of staleness is invisible to a user but
        // removes a ~1s provider round trip from each request.
        "getblockchaininfo" => Some(Duration::from_secs(10)),
        "getmempoolinfo" => Some(Duration::from_secs(10)),
        "estimatesmartfee" => Some(Duration::from_secs(60)),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hot_methods_are_cached_and_the_rest_are_not() {
        // Confirmed data never changes, so it is held for an hour.
        assert_eq!(
            rpc_cache_policy("getblock"),
            Some(Duration::from_secs(3600))
        );
        // Tip and mempool are on every page load, so they get a short TTL
        // rather than a provider round trip each time.
        assert_eq!(
            rpc_cache_policy("getblockchaininfo"),
            Some(Duration::from_secs(10))
        );
        assert_eq!(
            rpc_cache_policy("getmempoolinfo"),
            Some(Duration::from_secs(10))
        );
        assert_eq!(rpc_cache_policy("sendrawtransaction"), None);
    }

    #[test]
    fn memory_cache_is_bounded() {
        let cache = RpcMemoryCache::new();
        for i in 0..(MAX_MEMORY_ENTRIES * 2) {
            cache.insert(format!("key:{i}"), Value::from(i));
        }
        assert_eq!(
            cache.len(),
            MAX_MEMORY_ENTRIES,
            "cache must not grow past its cap"
        );
    }

    #[test]
    fn eviction_keeps_recently_used_entries() {
        let cache = RpcMemoryCache::new();
        cache.insert("keep".into(), Value::from("keep"));

        // Touch it, then push the cache well past its cap.
        for i in 0..MAX_MEMORY_ENTRIES {
            assert!(cache.stale("keep").is_some(), "should survive round {i}");
            cache.insert(format!("filler:{i}"), Value::from(i));
        }

        assert!(
            cache.stale("keep").is_some(),
            "a continuously used entry must not be evicted"
        );
        assert_eq!(cache.len(), MAX_MEMORY_ENTRIES);
    }

    #[test]
    fn cache_keys_are_namespaced_per_provider() {
        // Two networks on different hosts must not collide in the shared cache.
        assert_eq!(
            provider_key("https://bitrpc.thebuidl.xyz/bitcoin"),
            "bitrpc.thebuidl.xyz"
        );
        assert_eq!(provider_key("http://127.0.0.1:8332/"), "127.0.0.1:8332");
        assert_ne!(
            provider_key("https://bitcoin-mainnet.gateway.tatum.io"),
            provider_key("https://bitcoin-testnet.gateway.tatum.io"),
        );
    }
}
