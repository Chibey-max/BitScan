use axum::{
    Json,
    extract::{Path, Query, State},
};
use bitcoin::Network;
use futures::future::try_join;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::model::{
    AddressQuery, AddressResponse, AddressTransaction, TransactionDetail, TxInput, TxOutput,
    TxQuery, TxSummary,
};
use crate::rpc::RpcClient;
use crate::tatum::btc_string_to_sat;

use super::{
    btc_to_signed_sat, get_string, is_hex_hash, optional_string, parse_address,
    tx_output_from_json, tx_outputs,
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

    // The node is preferred: it resolves previous outputs, so inputs carry real
    // amounts. Without txindex it can only answer when given the block hash, so
    // fall back to the address indexer, which needs no block context.
    if let Ok(tx) = state.rpc.call("getrawtransaction", params).await {
        return Ok(Json(tx_detail(&state.rpc, &tx).await?));
    }

    let indexer = state.tatum.as_ref().ok_or_else(|| {
        AppError::NotFound(
            "transaction was not found; this node has no txindex, so either supply block_hash or set TATUM_API_KEY"
                .into(),
        )
    })?;

    let tx = indexer.transaction(&txid).await?;
    let tip_height = state
        .rpc
        .call("getblockchaininfo", json!([]))
        .await
        .ok()
        .and_then(|info| info.get("blocks").and_then(Value::as_u64));

    Ok(Json(indexed_tx_detail(&tx, tip_height)))
}

/// Map an indexer transaction onto the same shape the node path produces.
///
/// `fee` arrives precomputed in satoshis, which is strictly better than the
/// node path's inputs-minus-outputs arithmetic. The trade-off is that inputs
/// carry no amounts, so `previous_output` stays empty and the UI says so.
fn indexed_tx_detail(tx: &Value, tip_height: Option<u64>) -> TransactionDetail {
    let outputs = tx
        .get("outputs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .enumerate()
                .map(|(index, output)| {
                    let script = output.get("scriptPubKey").unwrap_or(&Value::Null);
                    TxOutput {
                        n: index as u64,
                        value_sat: output
                            .get("value")
                            .and_then(Value::as_u64)
                            .unwrap_or_default(),
                        script_type: optional_string(script, "type"),
                        address: optional_string(output, "address"),
                    }
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let inputs = tx
        .get("inputs")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(indexed_tx_input).collect::<Vec<_>>())
        .unwrap_or_default();

    let block_height = tx.get("blockNumber").and_then(Value::as_u64);

    TransactionDetail {
        txid: optional_string(tx, "hash").unwrap_or_default(),
        hash: optional_string(tx, "witnessHash")
            .or_else(|| optional_string(tx, "hash"))
            .unwrap_or_default(),
        size: tx.get("size").and_then(Value::as_u64),
        vsize: tx.get("vsize").and_then(Value::as_u64),
        weight: tx.get("weight").and_then(Value::as_u64),
        version: tx.get("version").and_then(Value::as_i64),
        locktime: tx.get("locktime").and_then(Value::as_u64),
        blockhash: optional_string(tx, "block"),
        confirmations: match (tip_height, block_height) {
            (Some(tip), Some(height)) if tip >= height => Some(tip - height + 1),
            _ => None,
        },
        fee_sat: tx.get("fee").and_then(Value::as_u64).map(|fee| fee as i64),
        inputs,
        outputs,
    }
}

fn indexed_tx_input(input: &Value) -> TxInput {
    let prevout = input.get("prevout").unwrap_or(&Value::Null);
    let prev_txid = optional_string(prevout, "hash");
    let prev_vout = prevout.get("index").and_then(Value::as_u64);

    // A coinbase input points at the null outpoint: all-zero hash, index u32::MAX.
    let is_coinbase =
        prev_txid.as_deref() == Some(&"0".repeat(64)) && prev_vout == Some(u32::MAX as u64);

    TxInput {
        txid: if is_coinbase { None } else { prev_txid },
        vout: if is_coinbase { None } else { prev_vout },
        coinbase: if is_coinbase {
            optional_string(input, "script")
        } else {
            None
        },
        sequence: input.get("sequence").and_then(Value::as_u64),
        previous_output: None,
    }
}

pub async fn address(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Query(query): Query<AddressQuery>,
) -> Result<Json<AddressResponse>, AppError> {
    let parsed = parse_address(&address)
        .ok_or_else(|| AppError::BadRequest("that is not a valid bitcoin address".into()))?;

    // The indexer below serves mainnet, so reject an otherwise well-formed
    // address from another network instead of reporting an empty balance.
    if !parsed.is_valid_for_network(Network::Bitcoin) {
        return Err(AppError::BadRequest(
            "that address is valid, but not on mainnet".into(),
        ));
    }

    let indexer = state.tatum.as_ref().ok_or_else(|| {
        AppError::NotFound(
            "address balances need an address-indexing provider; set TATUM_API_KEY to enable them"
                .into(),
        )
    })?;

    let limit = query.limit.unwrap_or(25).clamp(1, 50);
    let offset = query.offset.unwrap_or(0);

    let (balance, txs) = try_join(
        indexer.address_balance(&address),
        indexer.address_transactions(&address, limit, offset),
    )
    .await?;

    let transactions = txs
        .iter()
        .map(|tx| address_transaction(tx, &address))
        .collect::<Vec<_>>();

    Ok(Json(AddressResponse {
        is_valid: true,
        balance_sat: btc_string_to_sat(&balance.balance),
        received_sat: btc_string_to_sat(&balance.incoming),
        sent_sat: btc_string_to_sat(&balance.outgoing),
        pending_balance_sat: btc_string_to_sat(&balance.incoming_pending) as i64
            - btc_string_to_sat(&balance.outgoing_pending) as i64,
        offset,
        limit,
        transactions,
        source: "tatum".into(),
        address,
    }))
}

/// Tatum returns a fully decoded transaction whose `fee` and `outputs[].value`
/// are already satoshis. Inputs carry an address but no amount, so how much the
/// address spent cannot be derived here without resolving every previous output.
fn address_transaction(tx: &Value, address: &str) -> AddressTransaction {
    let outputs = tx.get("outputs").and_then(Value::as_array);
    let received_sat = outputs
        .map(|items| {
            items
                .iter()
                .filter(|output| output.get("address").and_then(Value::as_str) == Some(address))
                .filter_map(|output| output.get("value").and_then(Value::as_u64))
                .sum()
        })
        .unwrap_or_default();

    let spends_from_address = tx
        .get("inputs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .any(|input| input.get("address").and_then(Value::as_str) == Some(address))
        })
        .unwrap_or(false);

    AddressTransaction {
        txid: optional_string(tx, "hash").unwrap_or_default(),
        block_height: tx.get("blockNumber").and_then(Value::as_u64),
        timestamp: tx.get("time").and_then(Value::as_u64),
        fee_sat: tx.get("fee").and_then(Value::as_u64),
        received_sat,
        spends_from_address,
    }
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
