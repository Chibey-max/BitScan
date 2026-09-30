pub mod blocks;
pub mod health;
pub mod search;
pub mod transactions;

use serde_json::Value;

use crate::error::AppError;
use crate::model::{BlockSummary, TxOutput};

pub(super) fn block_summary_from_json(block: &Value) -> Result<BlockSummary, AppError> {
    Ok(BlockSummary {
        height: get_u64(block, "height")?,
        hash: get_string(block, "hash")?,
        timestamp: get_u64(block, "time")?,
        tx_count: block
            .get("tx")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or_default(),
        size: block.get("size").and_then(Value::as_u64),
        weight: block.get("weight").and_then(Value::as_u64),
        total_fees_sat: None,
    })
}

pub(super) fn tx_outputs(tx: &Value) -> Vec<TxOutput> {
    tx.get("vout")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(tx_output_from_json).collect())
        .unwrap_or_default()
}

pub(super) fn tx_output_from_json(output: &Value) -> TxOutput {
    let script = output.get("scriptPubKey").unwrap_or(&Value::Null);
    TxOutput {
        n: output.get("n").and_then(Value::as_u64).unwrap_or_default(),
        value_sat: btc_to_sat(output.get("value").and_then(Value::as_f64).unwrap_or(0.0)),
        script_type: optional_string(script, "type"),
        address: optional_string(script, "address").or_else(|| {
            script
                .get("addresses")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        }),
    }
}

pub(super) fn get_string(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Rpc(format!("missing string field `{key}`")))
}

pub(super) fn optional_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

pub(super) fn get_u64(value: &Value, key: &str) -> Result<u64, AppError> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| AppError::Rpc(format!("missing numeric field `{key}`")))
}

pub(super) fn btc_to_sat(value: f64) -> u64 {
    (value * 100_000_000.0).round() as u64
}

pub(super) fn btc_to_signed_sat(value: f64) -> i64 {
    (value * 100_000_000.0).round() as i64
}

pub(super) fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && hex::decode(value).is_ok()
}
