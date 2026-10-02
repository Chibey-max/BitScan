use axum::{
    Json,
    extract::{Query, State},
};
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::model::{SearchQuery, SearchResponse};

use super::blocks::block_hash;
use super::is_hex_hash;

pub async fn search(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, AppError> {
    let q = query.q.trim();
    if q.is_empty() {
        return Err(AppError::BadRequest("search query cannot be empty".into()));
    }

    if let Ok(height) = q.parse::<u64>() {
        let hash = block_hash(&state.rpc, height).await?;
        return Ok(Json(SearchResponse::Block {
            hash,
            height: Some(height),
        }));
    }

    if is_hex_hash(q) {
        if let Ok(block) = state.rpc.call("getblock", json!([q, 1])).await {
            return Ok(Json(SearchResponse::Block {
                hash: q.to_owned(),
                height: block.get("height").and_then(Value::as_u64),
            }));
        }

        if state
            .rpc
            .call("getrawtransaction", json!([q, true]))
            .await
            .is_ok()
        {
            return Ok(Json(SearchResponse::Tx { txid: q.to_owned() }));
        }
    }

    if looks_like_bitcoin_address(q) {
        return Ok(Json(SearchResponse::Address {
            address: q.to_owned(),
        }));
    }

    let validation = state.rpc.call("validateaddress", json!([q])).await?;
    if validation
        .get("isvalid")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Ok(Json(SearchResponse::Address {
            address: q.to_owned(),
        }));
    }

    Err(AppError::NotFound(
        "no matching block, transaction, or address".into(),
    ))
}

fn looks_like_bitcoin_address(value: &str) -> bool {
    let len = value.len();
    (value.starts_with("bc1") && (42..=90).contains(&len))
        || ((value.starts_with('1') || value.starts_with('3')) && (26..=35).contains(&len))
}
