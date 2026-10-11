use std::{net::SocketAddr, str::FromStr, sync::Arc, time::Duration};

use bitcoin::Network;
use dotenvy::dotenv;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod cache;
mod config;
mod error;
mod handlers;
mod indexer;
mod model;
mod routes;
mod rpc;
mod tatum;

use cache::PersistentCache;
use config::Config;
use indexer::{Indexer, IndexerChain};
use rpc::RpcClient;
use tatum::TatumClient;

#[derive(Clone)]
pub struct AppState {
    pub mainnet: ChainState,
    pub testnet: Option<ChainState>,
    pub indexer: Option<Arc<Indexer>>,
}

#[derive(Clone)]
pub struct ChainState {
    pub key: &'static str,
    pub label: &'static str,
    pub bitcoin_network: Network,
    pub rpc: Arc<RpcClient>,
    pub tatum: Option<Arc<TatumClient>>,
}

impl AppState {
    pub fn chain(&self, requested: Option<&str>) -> Result<ChainState, error::AppError> {
        match requested.unwrap_or("mainnet").to_ascii_lowercase().as_str() {
            "" | "mainnet" | "bitcoin" => Ok(self.mainnet.clone()),
            "testnet" | "bitcoin-testnet" => self.testnet.clone().ok_or_else(|| {
                error::AppError::BadRequest(
                    "testnet is not configured on this BitScan deployment".into(),
                )
            }),
            other => Err(error::AppError::BadRequest(format!(
                "unsupported network `{other}`; use mainnet or testnet"
            ))),
        }
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "explorer=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let persistent_cache = match config.database_url.as_deref() {
        Some(database_url) => match PersistentCache::connect(database_url).await {
            Ok(cache) => {
                tracing::info!("Postgres provider cache is enabled");
                let cache = Arc::new(cache);
                // Expired rows are kept briefly so the stale-fallback path can
                // still use them, then swept so the table cannot grow forever.
                cache.clone().spawn_eviction(
                    Duration::from_secs(60 * 60 * 24),
                    Duration::from_secs(60 * 60),
                );
                Some(cache)
            }
            Err(error) => {
                tracing::warn!(
                    %error,
                    "Postgres provider cache is unavailable; falling back to in-memory cache"
                );
                None
            }
        },
        None => {
            tracing::warn!("DATABASE_URL is not set; provider cache is in-memory only");
            None
        }
    };
    let indexer = if config.indexer_enabled {
        match persistent_cache.as_ref() {
            Some(cache) => match Indexer::connect(cache.pool()).await {
                Ok(indexer) => {
                    tracing::info!("Postgres block/address indexer is enabled");
                    Some(Arc::new(indexer))
                }
                Err(error) => {
                    tracing::warn!(%error, "Postgres indexer is unavailable");
                    None
                }
            },
            None => {
                tracing::warn!("DATABASE_URL is not set; block/address indexer is disabled");
                None
            }
        }
    } else {
        tracing::info!("block/address indexer is disabled by INDEXER_ENABLED");
        None
    };

    let mainnet_tatum = config.tatum_api_key.map(|api_key| {
        Arc::new(TatumClient::new(
            "mainnet",
            config.tatum_base_url,
            api_key,
            config.tatum_cache_ttl_seconds,
            persistent_cache.clone(),
        ))
    });
    if mainnet_tatum.is_none() {
        tracing::warn!(
            "TATUM_API_KEY is not set; mainnet address balances and history are disabled"
        );
    }

    let testnet_tatum = config.tatum_testnet_api_key.map(|api_key| {
        Arc::new(TatumClient::new(
            "testnet",
            config.tatum_testnet_base_url,
            api_key,
            config.tatum_cache_ttl_seconds,
            persistent_cache.clone(),
        ))
    });
    let testnet = config.testnet_rpc_url.map(|rpc_url| ChainState {
        key: "testnet",
        label: "Testnet",
        bitcoin_network: Network::Testnet,
        rpc: Arc::new(RpcClient::new(
            rpc_url,
            config.testnet_rpc_user,
            config.testnet_rpc_password,
            config.testnet_rpc_api_key,
            persistent_cache.clone(),
        )),
        tatum: testnet_tatum,
    });
    if testnet.is_none() {
        tracing::warn!(
            "BITCOIN_TESTNET_RPC_URL is not set; testnet switch will report unavailable"
        );
    }

    let state = AppState {
        mainnet: ChainState {
            key: "mainnet",
            label: "Mainnet",
            bitcoin_network: Network::Bitcoin,
            rpc: Arc::new(RpcClient::new(
                config.rpc_url,
                config.rpc_user,
                config.rpc_password,
                config.rpc_api_key,
                persistent_cache.clone(),
            )),
            tatum: mainnet_tatum,
        },
        testnet,
        indexer: indexer.clone(),
    };

    if let Some(indexer) = indexer {
        let mut chains = vec![IndexerChain {
            key: state.mainnet.key,
            rpc: state.mainnet.rpc.clone(),
        }];
        if let Some(testnet) = &state.testnet {
            chains.push(IndexerChain {
                key: testnet.key,
                rpc: testnet.rpc.clone(),
            });
        }
        indexer.spawn_recent_sync(
            chains,
            config.indexer_lookback_blocks,
            config.indexer_poll_seconds,
        );
    }

    let app = routes::app(state);
    let addr = SocketAddr::from_str(&config.bind_addr)?;
    tracing::info!("BitScan API listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("BitScan API stopped");
    Ok(())
}

/// Resolve on SIGINT or SIGTERM so in-flight requests finish instead of being
/// cut off mid-response when a deploy or Ctrl-C arrives.
async fn shutdown_signal() {
    let interrupt = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to listen for ctrl-c");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to listen for SIGTERM")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = interrupt => {}
        _ = terminate => {}
    }

    tracing::info!("shutdown signal received; draining in-flight requests");
}
