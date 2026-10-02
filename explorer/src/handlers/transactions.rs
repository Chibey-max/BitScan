use axum::{
    Json,
    extract::{Path, Query, State},
    response::Response,
};
use serde_json::{Value, json};

use crate::AppState;
use crate::error::AppError;
use crate::features;
use crate::model::{
    AddressResponse, AddressUtxo, ReceiptQuery, TransactionDetail, TxInput, TxOutput, TxQuery,
    TxSummary,
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
    let tx = load_verbose_tx(&state.rpc, &txid, query.block_hash).await?;
    Ok(Json(tx_detail_with_fallbacks(&state, &tx).await?))
}

pub async fn fee_card_svg(
    State(state): State<AppState>,
    Path(txid): Path<String>,
    Query(query): Query<TxQuery>,
) -> Result<Response<String>, AppError> {
    let tx = load_verbose_tx(&state.rpc, &txid, query.block_hash).await?;
    let detail = tx_detail_with_fallbacks(&state, &tx).await?;
    Ok(Response::builder()
        .header("content-type", "image/svg+xml; charset=utf-8")
        .body(features::fee_card_svg(&detail))
        .expect("valid svg response"))
}

pub async fn receipt(
    State(state): State<AppState>,
    Query(query): Query<ReceiptQuery>,
) -> Result<Json<crate::model::ReceiptResponse>, AppError> {
    let tx = load_verbose_tx(&state.rpc, &query.txid, query.block_hash).await?;
    let detail = tx_detail_with_fallbacks(&state, &tx).await?;
    Ok(Json(
        features::receipt(&state.rpc, &detail, &query.address).await?,
    ))
}

pub async fn address(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<AddressResponse>, AppError> {
    if state.tatum.is_configured() {
        return Ok(Json(state.tatum.address(&address).await?));
    }

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
        received_sat: balance_sat,
        sent_sat: 0,
        pending_balance_sat: 0,
        tx_count: 0,
        utxo_count: utxos.len(),
        utxos,
        transactions: Vec::new(),
        source: "Bitcoin RPC".into(),
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
    } else if resolved_inputs
        .iter()
        .any(|input| input.previous_output.is_none())
    {
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
    let fee_sat = input_total
        .map(|total| total as i64 - output_total as i64)
        .or_else(|| tx.get("fee").and_then(Value::as_f64).map(btc_to_signed_sat));

    let mut detail = TransactionDetail {
        txid: get_string(tx, "txid")?,
        hash: get_string(tx, "hash").unwrap_or_else(|_| get_string(tx, "txid").unwrap_or_default()),
        hex: optional_string(tx, "hex"),
        size: tx.get("size").and_then(Value::as_u64),
        vsize: tx.get("vsize").and_then(Value::as_u64),
        weight: tx.get("weight").and_then(Value::as_u64),
        version: tx.get("version").and_then(Value::as_i64),
        locktime: tx.get("locktime").and_then(Value::as_u64),
        blockhash: optional_string(tx, "blockhash"),
        confirmations: tx.get("confirmations").and_then(Value::as_u64),
        fee_sat,
        inputs: resolved_inputs,
        outputs,
        story: crate::model::Story {
            kind: crate::model::TxKind::Unknown,
            headline: String::new(),
            sentences: Vec::new(),
            change_output: None,
            confidence: crate::model::Confidence::Low,
            tags: Vec::new(),
        },
        fee_report: None,
    };

    detail.fee_report = features::fee_report(rpc, &detail).await.or_else(|| {
        detail
            .fee_sat
            .zip(detail.vsize)
            .and_then(|(fee, vsize)| (fee > 0 && vsize > 0).then_some(fee as f64 / vsize as f64))
            .and_then(features::simple_fee_report)
    });
    detail.story = features::story(&detail);

    Ok(detail)
}

async fn tx_detail_with_fallbacks(
    state: &AppState,
    tx: &Value,
) -> Result<TransactionDetail, AppError> {
    let mut detail = tx_detail(&state.rpc, tx).await?;
    if detail.fee_sat.is_none() && state.tatum.is_configured() {
        if let Ok(Some(fee_sat)) = state.tatum.transaction_fee_sat(&detail.txid).await {
            detail.fee_sat = Some(fee_sat);
            detail.fee_report = features::fee_report(&state.rpc, &detail).await.or_else(|| {
                detail
                    .vsize
                    .filter(|vsize| *vsize > 0)
                    .map(|vsize| fee_sat as f64 / vsize as f64)
                    .and_then(features::simple_fee_report)
            });
            detail.story = features::story(&detail);
        }
    }
    Ok(detail)
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

async fn load_verbose_tx(
    rpc: &RpcClient,
    txid: &str,
    block_hash: Option<String>,
) -> Result<Value, AppError> {
    if !is_hex_hash(txid) {
        return Err(AppError::BadRequest(
            "transaction id must be 64 hex characters".into(),
        ));
    }

    let params = match block_hash {
        Some(block_hash) if is_hex_hash(&block_hash) => json!([txid, true, block_hash]),
        Some(_) => {
            return Err(AppError::BadRequest(
                "block_hash must be 64 hex characters".into(),
            ));
        }
        None => json!([txid, true]),
    };

    rpc.call("getrawtransaction", params).await.map_err(|_| {
        AppError::NotFound(
            "transaction was not found; provide block_hash when using a provider without txindex"
                .into(),
        )
    })
}
