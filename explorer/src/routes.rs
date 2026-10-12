use axum::{
    Router,
    routing::{get, post},
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::AppState;
use crate::error::AppError;
use crate::handlers;

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handlers::health::health))
        .route("/api/tip", get(handlers::blocks::tip))
        .route("/api/mempool", get(handlers::blocks::mempool))
        .route("/api/news", get(handlers::news::news))
        .route("/api/ai/chat", post(handlers::ai::chat))
        .route("/api/ai/resources", get(handlers::ai::resources))
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
        // Without this an unmatched path gets axum's bare 404 with an empty
        // body, so a client parsing `{ "error": ... }` sees a JSON failure
        // instead of the actual problem.
        .fallback(not_found)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn not_found(uri: axum::http::Uri) -> AppError {
    AppError::NotFound(format!("no route for {uri}"))
}
