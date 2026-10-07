//! Address-indexing client.
//!
//! Bitcoin Core cannot answer "what has this address received?" — there is no
//! address index in the node, and `scantxoutset` only sees currently-unspent
//! outputs (and is blocked by most hosted RPC providers anyway). Balances and
//! history therefore come from a separate indexing API.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cache::PersistentCache;
use crate::error::AppError;

pub struct TatumClient {
    client: Client,
    network: String,
    base_url: String,
    api_key: String,
    cache_ttl: Duration,
    balance_cache: TimedCache<TatumBalance>,
    address_txs_cache: TimedCache<Vec<Value>>,
    tx_cache: TimedCache<Value>,
    persistent_cache: Option<Arc<PersistentCache>>,
}

/// `/v3/bitcoin/address/balance/{address}` — every field is a decimal BTC string.
#[derive(Clone, Deserialize, Serialize)]
pub struct TatumBalance {
    pub balance: String,
    pub incoming: String,
    pub outgoing: String,
    #[serde(rename = "incomingPending")]
    pub incoming_pending: String,
    #[serde(rename = "outgoingPending")]
    pub outgoing_pending: String,
}

struct TimedCache<T> {
    items: Mutex<HashMap<String, CacheEntry<T>>>,
}

struct CacheEntry<T> {
    value: T,
    stored_at: Instant,
}

impl<T: Clone> TimedCache<T> {
    fn new() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }

    fn fresh(&self, key: &str, ttl: Duration) -> Option<T> {
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

    fn stale(&self, key: &str) -> Option<T> {
        self.items
            .lock()
            .ok()
            .and_then(|items| items.get(key).cloned())
            .map(|entry| entry.value)
    }

    fn insert(&self, key: String, value: T) {
        if let Ok(mut items) = self.items.lock() {
            items.insert(
                key,
                CacheEntry {
                    value,
                    stored_at: Instant::now(),
                },
            );
        }
    }
}

impl<T: Clone> Clone for CacheEntry<T> {
    fn clone(&self) -> Self {
        Self {
            value: self.value.clone(),
            stored_at: self.stored_at,
        }
    }
}

impl TatumClient {
    pub fn new(
        network: impl Into<String>,
        base_url: String,
        api_key: String,
        cache_ttl_seconds: u64,
        persistent_cache: Option<Arc<PersistentCache>>,
    ) -> Self {
        Self {
            client: Client::new(),
            network: network.into(),
            base_url: base_url.trim_end_matches('/').to_owned(),
            api_key,
            cache_ttl: Duration::from_secs(cache_ttl_seconds),
            balance_cache: TimedCache::new(),
            address_txs_cache: TimedCache::new(),
            tx_cache: TimedCache::new(),
            persistent_cache,
        }
    }

    pub async fn address_balance(&self, address: &str) -> Result<TatumBalance, AppError> {
        let cache_key = format!("tatum:{}:address_balance:{address}", self.network);
        if let Some(balance) = self.balance_cache.fresh(&cache_key, self.cache_ttl) {
            return Ok(balance);
        }
        if let Some(cache) = &self.persistent_cache {
            if let Some(balance) = cache.fresh::<TatumBalance>(&cache_key).await {
                self.balance_cache
                    .insert(cache_key.clone(), balance.clone());
                return Ok(balance);
            }
        }

        let path = format!("/v3/bitcoin/address/balance/{address}");
        match self.get(&path, &[]).await {
            Ok(response) => {
                let balance: TatumBalance = response.json().await?;
                self.balance_cache
                    .insert(cache_key.clone(), balance.clone());
                if let Some(cache) = &self.persistent_cache {
                    cache
                        .insert(&cache_key, "tatum", self.cache_ttl, &balance)
                        .await;
                }
                Ok(balance)
            }
            Err(error) => {
                if let Some(balance) = self.balance_cache.stale(&cache_key) {
                    return Ok(balance);
                }
                if let Some(cache) = &self.persistent_cache {
                    if let Some(balance) = cache.stale::<TatumBalance>(&cache_key).await {
                        self.balance_cache
                            .insert(cache_key.clone(), balance.clone());
                        return Ok(balance);
                    }
                }
                Err(error)
            }
        }
    }

    /// Transactions touching `address`, newest first. Each item is a decoded
    /// transaction whose `outputs[].value` and `fee` are already in satoshis.
    pub async fn address_transactions(
        &self,
        address: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Value>, AppError> {
        let cache_key = format!(
            "tatum:{}:address_txs:{address}:{limit}:{offset}",
            self.network
        );
        if let Some(transactions) = self.address_txs_cache.fresh(&cache_key, self.cache_ttl) {
            return Ok(transactions);
        }
        if let Some(cache) = &self.persistent_cache {
            if let Some(transactions) = cache.fresh::<Vec<Value>>(&cache_key).await {
                self.address_txs_cache
                    .insert(cache_key.clone(), transactions.clone());
                return Ok(transactions);
            }
        }

        let path = format!("/v3/bitcoin/transaction/address/{address}");
        match self
            .get(
                &path,
                &[
                    ("pageSize", limit.to_string()),
                    ("offset", offset.to_string()),
                ],
            )
            .await
        {
            Ok(response) => {
                let transactions: Vec<Value> = response.json().await?;
                self.address_txs_cache
                    .insert(cache_key.clone(), transactions.clone());
                if let Some(cache) = &self.persistent_cache {
                    cache
                        .insert(&cache_key, "tatum", self.cache_ttl, &transactions)
                        .await;
                }
                Ok(transactions)
            }
            Err(error) => {
                if let Some(transactions) = self.address_txs_cache.stale(&cache_key) {
                    return Ok(transactions);
                }
                if let Some(cache) = &self.persistent_cache {
                    if let Some(transactions) = cache.stale::<Vec<Value>>(&cache_key).await {
                        self.address_txs_cache
                            .insert(cache_key.clone(), transactions.clone());
                        return Ok(transactions);
                    }
                }
                Err(error)
            }
        }
    }

    /// A single transaction, resolvable without `txindex` on the node.
    pub async fn transaction(&self, txid: &str) -> Result<Value, AppError> {
        let cache_key = format!("tatum:{}:tx:{txid}", self.network);
        if let Some(tx) = self.tx_cache.fresh(&cache_key, self.cache_ttl) {
            return Ok(tx);
        }
        if let Some(cache) = &self.persistent_cache {
            if let Some(tx) = cache.fresh::<Value>(&cache_key).await {
                self.tx_cache.insert(cache_key.clone(), tx.clone());
                return Ok(tx);
            }
        }

        let path = format!("/v3/bitcoin/transaction/{txid}");
        match self.get(&path, &[]).await {
            Ok(response) => {
                let tx: Value = response.json().await?;
                self.tx_cache.insert(cache_key.clone(), tx.clone());
                if let Some(cache) = &self.persistent_cache {
                    cache.insert(&cache_key, "tatum", self.cache_ttl, &tx).await;
                }
                Ok(tx)
            }
            Err(error) => {
                if let Some(tx) = self.tx_cache.stale(&cache_key) {
                    return Ok(tx);
                }
                if let Some(cache) = &self.persistent_cache {
                    if let Some(tx) = cache.stale::<Value>(&cache_key).await {
                        self.tx_cache.insert(cache_key.clone(), tx.clone());
                        return Ok(tx);
                    }
                }
                Err(error)
            }
        }
    }

    async fn get(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<reqwest::Response, AppError> {
        let response = self
            .client
            .get(format!("{}{path}", self.base_url))
            .header("x-api-key", &self.api_key)
            .query(query)
            .send()
            .await?;

        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }

        // Surface the provider's own message rather than a bare status code —
        // a rejected key and an unknown address are very different problems.
        let detail = response
            .json::<Value>()
            .await
            .ok()
            .and_then(|body| {
                body.get("message")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| format!("indexer returned {status}"));

        Err(match status {
            StatusCode::NOT_FOUND => AppError::NotFound(detail),
            StatusCode::BAD_REQUEST => AppError::BadRequest(detail),
            StatusCode::TOO_MANY_REQUESTS => AppError::RateLimited(detail),
            _ => AppError::Rpc(format!("address indexer: {detail}")),
        })
    }
}

/// Decimal BTC string (`"0.02440643"`) to satoshis.
///
/// 21e6 BTC is 2.1e15 satoshis, well inside f64's exact-integer range, so the
/// multiply-and-round is lossless for every valid amount.
pub fn btc_string_to_sat(value: &str) -> u64 {
    value
        .trim()
        .parse::<f64>()
        .map(|btc| (btc * 100_000_000.0).round().max(0.0) as u64)
        .unwrap_or_default()
}
