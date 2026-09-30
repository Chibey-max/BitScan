use axum::{Router, routing::get};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::AppState;
use crate::handlers;

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handlers::health::health))
        .route("/api/tip", get(handlers::blocks::tip))
        .route("/api/mempool", get(handlers::blocks::mempool))
        .route("/api/blocks", get(handlers::blocks::blocks))
        .route("/api/block/{id}", get(handlers::blocks::block_detail))
        .route(
            "/api/block/{id}/txs",
            get(handlers::blocks::block_transactions),
        )
        .route("/api/tx/{txid}", get(handlers::transactions::transaction))
        .route(
            "/api/address/{address}",
            get(handlers::transactions::address),
        )
        .route("/api/search", get(handlers::search::search))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
