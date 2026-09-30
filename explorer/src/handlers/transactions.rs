use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::model::{
    AddressResponse, AddressUtxo, TransactionDetail, TxInput, TxOutput, TxQuery, TxSummary,
};
use crate::rpc::RpcClient;

use super::{
    btc_to_sat, btc_to_signed_sat, get_string, is_hex_hash, optional_string, tx_output_from_json,
    tx_outputs,
};

pub async fn transaction(
    State(state): State<AppState>,
    Path(txid): Path<String>,
    Query(query): Query<TxQuery>,
) -> Result<Json<TransactionDetail>, AppError> {
    if !is_hex_hash(&txid) {
        return Err(AppError::BadRequest(
            "transaction id must be 64 hex characters".into(),
        ));
    }

    let params = match query.block_hash {
        Some(block_hash) if is_hex_hash(&block_hash) => json!([txid, true, block_hash]),
        Some(_) => {
            return Err(AppError::BadRequest(
                "block_hash must be 64 hex characters".into(),
            ));
        }
        None => json!([txid, true]),
    };

    let tx = state
        .rpc
        .call("getrawtransaction", params)
        .await
        .map_err(|_| {
            AppError::NotFound(
                "transaction was not found; provide block_hash when using a provider without txindex"
                    .into(),
            )
        })?;

    Ok(Json(tx_detail(&state.rpc, &tx).await?))
}

pub async fn address(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<AddressResponse>, AppError> {
    let validation = state
        .rpc
        .call("validateaddress", json!([address.clone()]))
        .await?;

    if !validation
        .get("isvalid")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Err(AppError::BadRequest(
            "address is not valid for this node network".into(),
        ));
    }

    let scan = state
        .rpc
        .call(
            "scantxoutset",
            json!(["start", [format!("addr({address})")]]),
        )
        .await?;

    let utxos = scan
        .get("unspents")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|item| AddressUtxo {
                    txid: item
                        .get("txid")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    vout: item.get("vout").and_then(Value::as_u64).unwrap_or_default(),
                    height: item.get("height").and_then(Value::as_u64),
                    value_sat: btc_to_sat(
                        item.get("amount").and_then(Value::as_f64).unwrap_or(0.0),
                    ),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let balance_sat = utxos.iter().map(|utxo| utxo.value_sat).sum();

    Ok(Json(AddressResponse {
        address,
        is_valid: true,
        script_pub_key: optional_string(&validation, "scriptPubKey"),
        balance_sat,
        utxo_count: utxos.len(),
        utxos,
    }))
}

pub async fn tx_detail(rpc: &RpcClient, tx: &Value) -> Result<TransactionDetail, AppError> {
    let outputs = tx_outputs(tx);
    let inputs = tx
        .get("vin")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|vin| tx_input_from_json(rpc, vin))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut resolved_inputs = Vec::with_capacity(inputs.len());
    for input in inputs {
        resolved_inputs.push(input.await?);
    }

    let input_total: Option<u64> = if resolved_inputs.iter().any(|input| input.coinbase.is_some()) {
        None
    } else {
        Some(
            resolved_inputs
                .iter()
                .filter_map(|input| input.previous_output.as_ref())
                .map(|output| output.value_sat)
                .sum(),
        )
    };
    let output_total: u64 = outputs.iter().map(|output| output.value_sat).sum();

    Ok(TransactionDetail {
        txid: get_string(tx, "txid")?,
        hash: get_string(tx, "hash").unwrap_or_else(|_| get_string(tx, "txid").unwrap_or_default()),
        size: tx.get("size").and_then(Value::as_u64),
        vsize: tx.get("vsize").and_then(Value::as_u64),
        weight: tx.get("weight").and_then(Value::as_u64),
        version: tx.get("version").and_then(Value::as_i64),
      locktime: tx.get("locktime").and_then(Value::as_u64),
        blockhash: optional_string(tx, "blockhash"),
        confirmations: tx.get("confirmations").and_then(Value::as_u64),
        fee_sat: input_total.map(|total| total as i64 - output_total as i64),
        inputs: resolved_inputs,
        outputs,
    })
}

async fn tx_input_from_json(rpc: &RpcClient, vin: &Value) -> Result<TxInput, AppError> {
    let prev_txid = optional_string(vin, "txid");
    let prev_vout = vin.get("vout").and_then(Value::as_u64);
    let previous_output = match (&prev_txid, prev_vout) {
        (Some(txid), Some(vout)) => previous_output(rpc, txid, vout).await.ok(),
        _ => None,
    };

    Ok(TxInput {
        txid: prev_txid,
        vout: prev_vout,
        coinbase: optional_string(vin, "coinbase"),
        sequence: vin.get("sequence").and_then(Value::as_u64),
        previous_output,
    })
}

async fn previous_output(rpc: &RpcClient, txid: &str, vout: u64) -> Result<TxOutput, AppError> {
    let previous = rpc.call("getrawtransaction", json!([txid, true])).await?;
    previous
        .get("vout")
        .and_then(Value::as_array)
        .and_then(|outputs| {
            outputs
                .iter()
                .find(|output| output.get("n").and_then(Value::as_u64) == Some(vout))
        })
        .map(tx_output_from_json)
        .ok_or_else(|| AppError::NotFound("previous output was not found".into()))
}

pub fn tx_summary(tx: &Value) -> Result<TxSummary, AppError> {
    let outputs = tx_outputs(tx);
    Ok(TxSummary {
        txid: get_string(tx, "txid")?,
        fee_sat: tx.get("fee").and_then(Value::as_f64).map(btc_to_signed_sat),
        input_count: tx
            .get("vin")
            .and_then(Value::as_array)
            .map(Vec::len)
            .unwrap_or_default(),
        output_count: outputs.len(),
        output_value_sat: outputs.iter().map(|output| output.value_sat).sum(),
    })
}
