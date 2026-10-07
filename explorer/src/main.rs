use std::{net::SocketAddr, str::FromStr, sync::Arc};

use dotenvy::dotenv;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod cache;
mod config;
mod error;
mod handlers;
mod model;
mod routes;
mod rpc;
mod tatum;

use cache::PersistentCache;
use config::Config;
use rpc::RpcClient;
use tatum::TatumClient;

#[derive(Clone)]
pub struct AppState {
    pub rpc: Arc<RpcClient>,
    pub tatum: Option<Arc<TatumClient>>,
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
                Some(Arc::new(cache))
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

    let tatum = config.tatum_api_key.map(|api_key| {
        Arc::new(TatumClient::new(
            config.tatum_base_url,
            api_key,
            config.tatum_cache_ttl_seconds,
            persistent_cache,
        ))
    });
    if tatum.is_none() {
        tracing::warn!("TATUM_API_KEY is not set; address balances and history are disabled");
    }

    let state = AppState {
        rpc: Arc::new(RpcClient::new(
            config.rpc_url,
            config.rpc_user,
            config.rpc_password,
            config.rpc_api_key,
        )),
        tatum,
    };

    let app = routes::app(state);
    let addr = SocketAddr::from_str(&config.bind_addr)?;
    tracing::info!("BitScan API listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
