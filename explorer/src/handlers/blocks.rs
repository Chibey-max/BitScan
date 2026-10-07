use axum::{
    Json,
    extract::{Path, Query, State},
};
use futures::future::try_join_all;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::model::{
    BlockDetail, BlockTransactionsResponse, BlocksQuery, BlocksResponse, FeeBands, MempoolResponse,
    NetworkQuery, PageQuery, TipResponse,
};
use crate::rpc::RpcClient;

use super::transactions::tx_summary;
use super::{block_summary_from_json, get_string, get_u64, is_hex_hash, optional_string};

pub async fn tip(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<TipResponse>, AppError> {
    let chain = state.chain(query.network.as_deref())?;
    let info = chain.rpc.call("getblockchaininfo", json!([])).await?;
    Ok(Json(TipResponse {
        network: chain.key.into(),
        height: get_u64(&info, "blocks")?,
        hash: get_string(&info, "bestblockhash")?,
        chain: get_string(&info, "chain")?,
        verification_progress: info
            .get("verificationprogress")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    }))
}

pub async fn mempool(
    State(state): State<AppState>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<MempoolResponse>, AppError> {
    let chain = state.chain(query.network.as_deref())?;
    let info = chain.rpc.call("getmempoolinfo", json!([])).await?;
    let fee_bands = fee_bands(&chain.rpc).await;
    Ok(Json(MempoolResponse {
        network: chain.key.into(),
        size: get_u64(&info, "size")?,
        bytes: get_u64(&info, "bytes")?,
        usage: get_u64(&info, "usage")?,
        min_fee_rate: info.get("mempoolminfee").and_then(Value::as_f64),
        pressure: mempool_pressure(get_u64(&info, "size")?, get_u64(&info, "bytes")?),
        fee_bands,
    }))
}

pub async fn blocks(
    State(state): State<AppState>,
    Query(query): Query<BlocksQuery>,
) -> Result<Json<BlocksResponse>, AppError> {
    let chain = state.chain(query.network.as_deref())?;
    let chain_info = chain.rpc.call("getblockchaininfo", json!([])).await?;
    let tip_height = get_u64(&chain_info, "blocks")?;
    let limit = query.limit.unwrap_or(10).clamp(1, 50);
    let start = query.from_height.unwrap_or(tip_height).min(tip_height);
    let heights = (0..=start).rev().take(limit as usize);
    let rows =
        try_join_all(heights.map(|height| block_summary_at_height(&chain.rpc, height))).await?;

    let next_from_height = rows.last().and_then(|block| block.height.checked_sub(1));

    Ok(Json(BlocksResponse {
        network: chain.key.into(),
        blocks: rows,
        next_from_height,
    }))
}

pub async fn block_detail(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<NetworkQuery>,
) -> Result<Json<BlockDetail>, AppError> {
    let chain = state.chain(query.network.as_deref())?;
    let block = get_block_by_id(&chain.rpc, &id, 1).await?;
    let txids = block
        .get("tx")
        .and_then(Value::as_array)
        .map(|txs| {
            txs.iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(Json(BlockDetail {
        network: chain.key.into(),
        height: get_u64(&block, "height")?,
        hash: get_string(&block, "hash")?,
        previous_block_hash: optional_string(&block, "previousblockhash"),
        next_block_hash: optional_string(&block, "nextblockhash"),
        timestamp: get_u64(&block, "time")?,
        confirmations: block.get("confirmations").and_then(Value::as_u64),
        merkleroot: get_string(&block, "merkleroot")?,
        nonce: get_u64(&block, "nonce")?,
        bits: get_string(&block, "bits")?,
        difficulty: block
            .get("difficulty")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
        size: block.get("size").and_then(Value::as_u64),
        weight: block.get("weight").and_then(Value::as_u64),
        tx_count: txids.len(),
        txids,
    }))
}

pub async fn block_transactions(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(query): Query<PageQuery>,
) -> Result<Json<BlockTransactionsResponse>, AppError> {
    let chain = state.chain(query.network.as_deref())?;
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let offset = query.offset.unwrap_or(0);
    let block = get_block_by_id(&chain.rpc, &id, 1).await?;
    let block_hash = get_string(&block, "hash")?;
    let txids = block
        .get("tx")
        .and_then(Value::as_array)
        .ok_or_else(|| AppError::Rpc("getblock returned no tx array".into()))?;

    let visible_txids = txids
        .iter()
        .skip(offset)
        .take(limit)
        .filter_map(Value::as_str)
        .map(|txid| txid.to_owned())
        .collect::<Vec<_>>();

    let transactions = try_join_all(visible_txids.iter().map(|txid| {
        chain
            .rpc
            .call("getrawtransaction", json!([txid, true, block_hash.clone()]))
    }))
    .await?
    .iter()
    .map(tx_summary)
    .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(BlockTransactionsResponse {
        network: chain.key.into(),
        block: block_summary_from_json(&block)?,
        total: txids.len(),
        offset,
        limit,
        transactions,
    }))
}

async fn fee_bands(rpc: &RpcClient) -> FeeBands {
    async fn estimate(rpc: &RpcClient, target: u64) -> Option<f64> {
        rpc.call("estimatesmartfee", json!([target]))
            .await
            .ok()
            .and_then(|value| value.get("feerate").and_then(Value::as_f64))
            .map(|btc_per_kvb| (btc_per_kvb * 100_000_000.0) / 1000.0)
    }

    FeeBands {
        low_sat_vb: estimate(rpc, 6).await,
        medium_sat_vb: estimate(rpc, 3).await,
        high_sat_vb: estimate(rpc, 1).await,
    }
}

fn mempool_pressure(size: u64, bytes: u64) -> String {
    match (size, bytes) {
        (_, bytes) if bytes >= 250_000_000 => "very high".into(),
        (_, bytes) if bytes >= 100_000_000 => "high".into(),
        (size, _) if size >= 25_000 => "busy".into(),
        (size, _) if size >= 5_000 => "normal".into(),
        _ => "quiet".into(),
    }
}

pub async fn block_hash(rpc: &RpcClient, height: u64) -> Result<String, AppError> {
    rpc.call("getblockhash", json!([height]))
        .await?
        .as_str()
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Rpc("getblockhash returned a non-string value".into()))
}

pub async fn get_block_by_id(rpc: &RpcClient, id: &str, verbosity: u8) -> Result<Value, AppError> {
    let hash = if let Ok(height) = id.parse::<u64>() {
        block_hash(rpc, height).await?
    } else if is_hex_hash(id) {
        id.to_owned()
    } else {
        return Err(AppError::BadRequest(
            "block id must be a height or 64-character hash".into(),
        ));
    };

    rpc.call("getblock", json!([hash, verbosity])).await
}

async fn block_summary_at_height(
    rpc: &RpcClient,
    height: u64,
) -> Result<crate::model::BlockSummary, AppError> {
    let hash = block_hash(rpc, height).await?;
    let block = rpc.call("getblock", json!([hash, 1])).await?;
    block_summary_from_json(&block)
}
