use std::{net::SocketAddr, str::FromStr, sync::Arc};

use dotenvy::dotenv;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod features;
mod handlers;
mod model;
mod routes;
mod rpc;
mod tatum;

use config::Config;
use rpc::RpcClient;
use tatum::TatumClient;

#[derive(Clone)]
pub struct AppState {
    pub rpc: Arc<RpcClient>,
    pub tatum: Arc<TatumClient>,
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
    let state = AppState {
        rpc: Arc::new(RpcClient::new(
            config.rpc_url,
            config.rpc_user,
            config.rpc_password,
            config.rpc_api_key,
        )),
        tatum: Arc::new(TatumClient::new(
            config.tatum_api_key,
            config.tatum_api_base,
        )),
    };

    let app = routes::app(state);
    let addr = SocketAddr::from_str(&config.bind_addr)?;
    tracing::info!("BitScan API listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
