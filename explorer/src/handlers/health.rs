use axum::{Json, extract::State};
use serde_json::json;

use crate::AppState;
use crate::model::HealthResponse;

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let rpc_ok = state.rpc.call("getblockchaininfo", json!([])).await.is_ok();
    Json(HealthResponse {
        ok: true,
        api: "bitscan",
        rpc: rpc_ok,
        message: if rpc_ok {
            "api and bitcoin core are reachable".into()
        } else {
            "api is running, but bitcoin core rpc is not reachable".into()
        },
    })
}
