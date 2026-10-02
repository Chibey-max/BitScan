use serde_json::{Value, json};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppError;
use crate::model::{
    BlockMessagesResponse, ChainMessage, Confidence, FeeReport, ReceiptResponse, Story,
    TransactionDetail, TxKind, TxOutput,
};
use crate::rpc::RpcClient;

pub async fn fee_report(rpc: &RpcClient, tx: &TransactionDetail) -> Option<FeeReport> {
    let fee_sat = tx.fee_sat?;
    if fee_sat <= 0 {
        return None;
    }

    let vsize = tx.vsize?;
    if vsize == 0 {
        return None;
    }

    let fee_rate = fee_sat as f64 / vsize as f64;
    let height = match tx.blockhash.as_deref() {
        Some(hash) => rpc
            .call("getblock", json!([hash, 1]))
            .await
            .ok()
            .and_then(|block| block.get("height").and_then(Value::as_u64))?,
        None => return None,
    };

    let stats = rpc
        .call(
            "getblockstats",
            json!([
                height,
                [
                    "feerate_percentiles",
                    "minfeerate",
                    "maxfeerate",
                    "avgfeerate"
                ]
            ]),
        )
        .await
        .ok()?;

    let percentiles = stats
        .get("feerate_percentiles")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_f64).collect::<Vec<_>>())
        .unwrap_or_default();
    if percentiles.len() < 5 {
        return simple_fee_report(fee_rate);
    }

    let min = stats.get("minfeerate").and_then(Value::as_f64);
    let avg = stats.get("avgfeerate").and_then(Value::as_f64);
    let max = stats.get("maxfeerate").and_then(Value::as_f64);
    let median = percentiles[2];
    let grade = if fee_rate <= percentiles[1] {
        "A"
    } else if fee_rate <= median {
        "B"
    } else if fee_rate <= percentiles[3] {
        "C"
    } else if fee_rate <= percentiles[4] {
        "D"
    } else {
        "F"
    };

    let savings_vs_median = ((fee_rate - median).max(0.0) * vsize as f64).round() as u64;
    let savings_vs_min =
        min.map(|min_rate| ((fee_rate - min_rate).max(0.0) * vsize as f64).round() as u64);
    let percentile = interpolate_percentile(fee_rate, min, max, &percentiles);

    Some(FeeReport {
        grade: grade.into(),
        fee_rate_sat_vb: round2(fee_rate),
        percentile,
        verdict: fee_verdict(grade, savings_vs_median),
        savings_vs_median_sat: Some(savings_vs_median),
        savings_vs_min_sat: savings_vs_min,
        min_fee_rate_sat_vb: min.map(round2),
        avg_fee_rate_sat_vb: avg.map(round2),
        max_fee_rate_sat_vb: max.map(round2),
        percentiles_sat_vb: percentiles.into_iter().map(round2).collect(),
    })
}

pub fn simple_fee_report(fee_rate: f64) -> Option<FeeReport> {
    let grade = if fee_rate <= 2.0 {
        "A"
    } else if fee_rate <= 5.0 {
        "B"
    } else if fee_rate <= 12.0 {
        "C"
    } else if fee_rate <= 30.0 {
        "D"
    } else {
        "F"
    };

    Some(FeeReport {
        grade: grade.into(),
        fee_rate_sat_vb: round2(fee_rate),
        percentile: None,
        verdict:
            "Block fee percentiles were not available, so this grade uses a fallback fee-rate band."
                .into(),
        savings_vs_median_sat: None,
        savings_vs_min_sat: None,
        min_fee_rate_sat_vb: None,
        avg_fee_rate_sat_vb: None,
        max_fee_rate_sat_vb: None,
        percentiles_sat_vb: Vec::new(),
    })
}

pub fn story(tx: &TransactionDetail) -> Story {
    let non_data_outputs = tx
        .outputs
        .iter()
        .filter(|output| output.op_return_text.is_none())
        .collect::<Vec<_>>();
    let has_data = tx
        .outputs
        .iter()
        .any(|output| output.op_return_text.is_some());
    let is_coinbase = tx.inputs.iter().any(|input| input.coinbase.is_some());
    let has_prevouts = tx
        .inputs
        .iter()
        .filter(|input| input.coinbase.is_none())
        .all(|input| input.previous_output.is_some());

    let kind = if is_coinbase {
        TxKind::Coinbase
    } else if equal_output_group(&non_data_outputs).0 >= 3 && tx.inputs.len() >= 3 {
        TxKind::CoinJoinLike
    } else if tx.inputs.len() >= 5 && non_data_outputs.len() <= 2 {
        TxKind::Consolidation
    } else if tx.inputs.len() <= 3 && non_data_outputs.len() >= 5 {
        TxKind::BatchPayout
    } else if non_data_outputs.len() == 1 && same_script_family(tx) {
        TxKind::SelfTransfer
    } else if (1..=2).contains(&non_data_outputs.len()) {
        TxKind::Payment
    } else if has_data {
        TxKind::DataCarrier
    } else {
        TxKind::Unknown
    };

    let change_output = detect_change(tx);
    let mut tags = Vec::new();
    if has_data {
        tags.push("OP_RETURN".into());
    }
    if tx
        .inputs
        .iter()
        .any(|input| input.sequence.unwrap_or(u64::MAX) < 0xffff_fffe)
    {
        tags.push("RBF".into());
    }
    if tx.outputs.iter().any(|output| {
        output
            .script_type
            .as_deref()
            .is_some_and(|kind| kind.contains("witness_v1") || kind.contains("taproot"))
    }) {
        tags.push("Taproot".into());
    }

    let headline = match kind {
        TxKind::Coinbase => "New bitcoin minted in a coinbase transaction".into(),
        TxKind::Consolidation => format!("A wallet consolidated {} inputs", tx.inputs.len()),
        TxKind::BatchPayout => format!("A batch payout to {} recipients", non_data_outputs.len()),
        TxKind::CoinJoinLike => "A CoinJoin-like privacy transaction".into(),
        TxKind::SelfTransfer => "A likely self-transfer".into(),
        TxKind::Payment => payment_headline(&non_data_outputs, change_output),
        TxKind::DataCarrier => "A transaction carrying on-chain data".into(),
        TxKind::Unknown => "A Bitcoin transaction with an uncommon shape".into(),
    };

    let mut sentences = Vec::new();
    sentences.push(match kind {
        TxKind::Coinbase => "This is the block reward transaction, created by the miner instead of spending previous coins.".into(),
        TxKind::Consolidation => format!("It spends {} coins and creates {} spendable output(s), a pattern wallets often use to tidy UTXOs.", tx.inputs.len(), non_data_outputs.len()),
        TxKind::BatchPayout => format!("It uses {} input(s) and pays {} outputs, typical of services paying many users at once.", tx.inputs.len(), non_data_outputs.len()),
        TxKind::CoinJoinLike => {
            let (_, value) = equal_output_group(&non_data_outputs);
            format!("Several outputs have the exact same value of {} sats, a common CoinJoin privacy pattern.", value.unwrap_or_default())
        }
        TxKind::SelfTransfer => "It has one spendable output with a script type similar to the inputs, so it looks like coins moving within one wallet.".into(),
        TxKind::Payment => format!("It spends {} input(s) and creates {} spendable output(s).", tx.inputs.len(), non_data_outputs.len()),
        TxKind::DataCarrier => "It includes OP_RETURN data, which stores bytes on-chain without creating a spendable coin.".into(),
        TxKind::Unknown => "Its input and output pattern does not match the common wallet shapes BitScan recognizes yet.".into(),
    });

    if let Some(index) = change_output {
        sentences.push(format!(
            "Output {index} is likely change because its script type and amount pattern look wallet-generated."
        ));
    } else if matches!(kind, TxKind::Payment) {
        sentences.push("Change could not be identified confidently, so the payment amount may be one of the non-data outputs.".into());
    }

    if let Some(text) = tx
        .outputs
        .iter()
        .find_map(|output| output.op_return_text.as_deref())
    {
        sentences.push(format!("It also stores this text on-chain: \"{}\".", text));
    }

    if let Some(report) = &tx.fee_report {
        sentences.push(format!(
            "It paid {} sat/vB and received a fee grade of {}.",
            report.fee_rate_sat_vb, report.grade
        ));
    }

    Story {
        kind,
        headline,
        sentences,
        change_output,
        confidence: if is_coinbase || has_prevouts {
            Confidence::High
        } else if change_output.is_some() {
            Confidence::Medium
        } else {
            Confidence::Low
        },
        tags,
    }
}

pub async fn receipt(
    rpc: &RpcClient,
    tx: &TransactionDetail,
    address: &str,
) -> Result<ReceiptResponse, AppError> {
    let matching = tx
        .outputs
        .iter()
        .filter(|output| output.address.as_deref() == Some(address))
        .collect::<Vec<_>>();

    if matching.is_empty() {
        return Err(AppError::NotFound(
            "this transaction did not pay that address".into(),
        ));
    }

    let amount_sat = matching.iter().map(|output| output.value_sat).sum();
    let output_indices = matching.iter().map(|output| output.n).collect();
    let block_time = match &tx.blockhash {
        Some(hash) => rpc
            .call("getblock", json!([hash, 1]))
            .await
            .ok()
            .and_then(|block| block.get("time").and_then(Value::as_u64)),
        None => None,
    };

    Ok(ReceiptResponse {
        txid: tx.txid.clone(),
        address: address.into(),
        amount_sat,
        output_indices,
        status: if tx.confirmations.unwrap_or(0) > 0 {
            "confirmed".into()
        } else {
            "waiting_for_confirmation".into()
        },
        confirmations: tx.confirmations,
        block_hash: tx.blockhash.clone(),
        block_time,
        generated_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    })
}

pub fn messages_from_block(block: &Value) -> Result<BlockMessagesResponse, AppError> {
    let block_hash = string_field(block, "hash")?;
    let height = block
        .get("height")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let mut coinbase_tag = None;
    let mut messages = Vec::new();

    for (tx_index, tx) in block
        .get("tx")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .enumerate()
    {
        let txid = string_field(tx, "txid").unwrap_or_default();
        if tx_index == 0 {
            coinbase_tag = tx
                .get("vin")
                .and_then(Value::as_array)
                .and_then(|inputs| inputs.first())
                .and_then(|input| input.get("coinbase"))
                .and_then(Value::as_str)
                .and_then(hex_printable_text);
            if let Some(text) = &coinbase_tag {
                messages.push(ChainMessage {
                    txid: txid.clone(),
                    output_index: None,
                    kind: "coinbase".into(),
                    text: text.clone(),
                });
            }
        }

        for output in tx
            .get("vout")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(text) = op_return_text(output) {
                messages.push(ChainMessage {
                    txid: txid.clone(),
                    output_index: output.get("n").and_then(Value::as_u64),
                    kind: "op_return".into(),
                    text,
                });
            }
        }
    }

    Ok(BlockMessagesResponse {
        block_hash,
        height,
        coinbase_tag,
        messages,
    })
}

pub fn op_return_text(output: &Value) -> Option<String> {
    let script = output.get("scriptPubKey")?;
    let script_type = script
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if script_type != "nulldata" && script_type != "op_return" {
        return None;
    }
    script
        .get("asm")
        .and_then(Value::as_str)
        .and_then(|asm| asm.split_whitespace().skip(1).find_map(hex_printable_text))
        .or_else(|| {
            script
                .get("hex")
                .and_then(Value::as_str)
                .and_then(decode_op_return_hex)
        })
}

pub fn fee_card_svg(tx: &TransactionDetail) -> String {
    let report = tx.fee_report.as_ref();
    let grade = report.map(|r| r.grade.as_str()).unwrap_or("?");
    let rate = report
        .map(|r| format!("{} sat/vB", r.fee_rate_sat_vb))
        .unwrap_or_else(|| "fee unavailable".into());
    let verdict = report
        .map(|r| r.verdict.as_str())
        .unwrap_or("No fee report is available for this transaction.");
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0A0F1C"/>
<circle cx="960" cy="145" r="180" fill="#F7931A" opacity=".13"/>
<text x="80" y="120" font-family="Space Grotesk, Arial, sans-serif" font-size="44" fill="#F7931A" font-weight="700">BitScan</text>
<text x="80" y="190" font-family="JetBrains Mono, monospace" font-size="18" fill="#A2ADC0" letter-spacing="5">FEE REPORT CARD</text>
<text x="80" y="335" font-family="Space Grotesk, Arial, sans-serif" font-size="150" fill="#E6EAF2" font-weight="700">Grade {grade}</text>
<text x="80" y="415" font-family="JetBrains Mono, monospace" font-size="36" fill="#F7931A">{rate}</text>
<text x="80" y="485" font-family="Space Grotesk, Arial, sans-serif" font-size="30" fill="#E6EAF2">{}</text>
<text x="80" y="555" font-family="JetBrains Mono, monospace" font-size="22" fill="#758196">{}</text>
</svg>"##,
        escape_xml(verdict),
        escape_xml(&tx.txid)
    )
}

fn payment_headline(outputs: &[&TxOutput], change_output: Option<u64>) -> String {
    let amount = outputs
        .iter()
        .filter(|output| Some(output.n) != change_output)
        .map(|output| output.value_sat)
        .max()
        .unwrap_or_default();
    format!("A likely payment of {amount} sats")
}

fn same_script_family(tx: &TransactionDetail) -> bool {
    let input_type = tx
        .inputs
        .iter()
        .filter_map(|input| input.previous_output.as_ref())
        .filter_map(|output| output.script_type.as_deref())
        .next();
    let output_type = tx
        .outputs
        .iter()
        .filter(|output| output.op_return_text.is_none())
        .filter_map(|output| output.script_type.as_deref())
        .next();
    input_type.zip(output_type).is_some_and(|(a, b)| a == b)
}

fn detect_change(tx: &TransactionDetail) -> Option<u64> {
    let outputs = tx
        .outputs
        .iter()
        .filter(|output| output.op_return_text.is_none())
        .collect::<Vec<_>>();
    if outputs.len() != 2 {
        return None;
    }

    let input_types = tx
        .inputs
        .iter()
        .filter_map(|input| input.previous_output.as_ref())
        .filter_map(|output| output.script_type.as_deref())
        .collect::<Vec<_>>();

    let mut scored = outputs
        .iter()
        .map(|output| {
            let mut score = 0;
            if output
                .script_type
                .as_deref()
                .is_some_and(|kind| input_types.iter().any(|input| input == &kind))
            {
                score += 2;
            }
            if output.value_sat % 10_000 != 0 {
                score += 1;
            }
            (output.n, score)
        })
        .collect::<Vec<_>>();
    scored.sort_by_key(|(_, score)| *score);
    scored.reverse();
    let [best, next] = scored.as_slice() else {
        return None;
    };
    (best.1 >= next.1 + 2).then_some(best.0)
}

fn equal_output_group(outputs: &[&TxOutput]) -> (usize, Option<u64>) {
    let mut best = (0, None);
    for output in outputs {
        let count = outputs
            .iter()
            .filter(|candidate| candidate.value_sat == output.value_sat)
            .count();
        if count > best.0 {
            best = (count, Some(output.value_sat));
        }
    }
    best
}

fn interpolate_percentile(
    fee_rate: f64,
    min: Option<f64>,
    max: Option<f64>,
    p: &[f64],
) -> Option<f64> {
    let points = [
        (0.0, min?),
        (10.0, p[0]),
        (25.0, p[1]),
        (50.0, p[2]),
        (75.0, p[3]),
        (90.0, p[4]),
        (100.0, max?),
    ];
    for window in points.windows(2) {
        let (left_pct, left_rate) = window[0];
        let (right_pct, right_rate) = window[1];
        if fee_rate >= left_rate && fee_rate <= right_rate {
            let span = (right_rate - left_rate).max(0.0001);
            let position = (fee_rate - left_rate) / span;
            return Some(round2(left_pct + (right_pct - left_pct) * position));
        }
    }
    Some(if fee_rate < points[0].1 { 0.0 } else { 100.0 })
}

fn fee_verdict(grade: &str, savings: u64) -> String {
    match grade {
        "A" => {
            "Well priced. It paid less than most transactions in this block and still confirmed."
                .into()
        }
        "B" => "Fairly priced. It landed near the cheaper half of its block.".into(),
        "C" => "Middle of the block. It paid around the going rate for this confirmation.".into(),
        "D" => format!(
            "Pricier than most. Paying closer to the median may have saved about {savings} sats."
        ),
        _ => format!(
            "Very high for this block. Fine if speed mattered; otherwise fee estimates may have saved about {savings} sats."
        ),
    }
}

fn decode_op_return_hex(hex_value: &str) -> Option<String> {
    let bytes = hex::decode(hex_value).ok()?;
    let payload = bytes.strip_prefix(&[0x6a]).unwrap_or(&bytes);
    printable_text(payload)
}

fn hex_printable_text(value: &str) -> Option<String> {
    hex::decode(value)
        .ok()
        .and_then(|bytes| printable_text(&bytes))
}

fn printable_text(bytes: &[u8]) -> Option<String> {
    let mut runs = Vec::new();
    let mut current = Vec::new();

    for byte in bytes {
        if byte.is_ascii_graphic() || *byte == b' ' {
            current.push(*byte);
        } else {
            if current.len() >= 4 {
                runs.push(String::from_utf8_lossy(&current).trim().to_owned());
            }
            current.clear();
        }
    }

    if current.len() >= 4 {
        runs.push(String::from_utf8_lossy(&current).trim().to_owned());
    }

    let text = runs
        .into_iter()
        .filter(|run| run.chars().filter(|ch| ch.is_ascii_alphanumeric()).count() >= 3)
        .collect::<Vec<_>>()
        .join(" ");
    (!text.is_empty()).then(|| text.chars().take(160).collect())
}

fn string_field(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Rpc(format!("missing string field `{key}`")))
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
