use axum::{
    Json,
    extract::{Query, State},
};
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::model::{SearchQuery, SearchResponse};

use super::blocks::block_hash;
use super::{is_bitcoin_address, is_hex_hash};

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
        // A 64-hex string is either a block hash or a txid. `getblock` settles
        // the first case cheaply; anything else is a transaction. We deliberately
        // do not confirm it with `getrawtransaction`, because that needs txindex
        // (or a block hash) and would turn every txid search into a dead end on
        // providers without it. The transaction page handles that limitation.
        if let Ok(block) = state.rpc.call("getblock", json!([q, 1])).await {
            return Ok(Json(SearchResponse::Block {
                hash: q.to_owned(),
                height: block.get("height").and_then(Value::as_u64),
            }));
        }

        return Ok(Json(SearchResponse::Tx { txid: q.to_owned() }));
    }

    if is_bitcoin_address(q) {
        return Ok(Json(SearchResponse::Address {
            address: q.to_owned(),
        }));
    }

    Err(AppError::NotFound(
        "no matching block, transaction, or address".into(),
    ))
}
