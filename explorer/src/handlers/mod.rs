pub mod ai;
pub mod blocks;
pub mod health;
pub mod news;
pub mod search;
pub mod transactions;

use std::str::FromStr;

use bitcoin::{Address, address::NetworkUnchecked};
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
        script_asm: optional_string(script, "asm"),
        script_hex: optional_string(script, "hex"),
        decoded_op_return: optional_string(script, "asm").and_then(|asm| decode_op_return(&asm)),
        address: optional_string(script, "address").or_else(|| {
            script
                .get("addresses")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        }),
        spent: None,
    }
}

pub(super) fn get_string(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Rpc(format!("missing string field `{key}`")))
}

pub(crate) fn optional_string(value: &Value, key: &str) -> Option<String> {
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

pub(crate) fn btc_to_sat(value: f64) -> u64 {
    (value * 100_000_000.0).round() as u64
}

pub(super) fn btc_to_signed_sat(value: f64) -> i64 {
    (value * 100_000_000.0).round() as i64
}

pub(super) fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && hex::decode(value).is_ok()
}

/// Address validity is a pure property of the string — base58check or bech32
/// checksum plus a network prefix — so it is decided locally. Asking the node
/// (`validateaddress`) costs a round-trip and is refused outright by hosted RPC
/// providers that allowlist methods.
pub(super) fn parse_address(value: &str) -> Option<Address<NetworkUnchecked>> {
    Address::from_str(value).ok()
}

pub(super) fn is_bitcoin_address(value: &str) -> bool {
    parse_address(value).is_some()
}

pub(super) fn decode_op_return(asm: &str) -> Option<String> {
    let payload = asm
        .strip_prefix("OP_RETURN ")
        .or_else(|| asm.strip_prefix("OP_FALSE OP_RETURN "))?;

    let decoded = payload
        .split_whitespace()
        .filter_map(|part| hex::decode(part).ok())
        .flatten()
        .collect::<Vec<_>>();

    if decoded.is_empty() {
        return None;
    }

    String::from_utf8(decoded)
        .ok()
        .map(|text| text.chars().filter(|ch| !ch.is_control()).collect())
        .filter(|text: &String| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn btc_to_sat_is_exact_at_eight_decimals() {
        assert_eq!(btc_to_sat(0.0), 0);
        assert_eq!(btc_to_sat(1.0), 100_000_000);
        assert_eq!(btc_to_sat(0.00000001), 1);
        assert_eq!(btc_to_sat(0.00000546), 546);
        // Naive f64 truncation yields 2099999999999999 here; rounding must win.
        assert_eq!(btc_to_sat(20999999.9769), 2_099_999_997_690_000);
    }

    #[test]
    fn btc_to_signed_sat_keeps_sign() {
        assert_eq!(btc_to_signed_sat(-0.00000546), -546);
        assert_eq!(btc_to_signed_sat(0.00001), 1_000);
    }

    #[test]
    fn is_hex_hash_requires_exactly_64_hex_chars() {
        let hash = "0000000000000000000020c7b2d4de83448127e6cd073090d1d21c72a80535bc";
        assert!(is_hex_hash(hash));
        assert!(!is_hex_hash(&hash[..63]), "63 chars must be rejected");
        assert!(
            !is_hex_hash(&format!("{hash}0")),
            "65 chars must be rejected"
        );
        assert!(!is_hex_hash(&"z".repeat(64)), "non-hex must be rejected");
        assert!(!is_hex_hash(""));
    }

    #[test]
    fn accepts_every_mainnet_address_form() {
        for address in [
            "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", // P2PKH
            "3K9KZZPB8NRwZVP5wNKX4VYhnswrJxpgZ4", // P2SH
            "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", // P2WSH
            "bc1pfeessrawgf",                     // P2A anchor
        ] {
            assert!(is_bitcoin_address(address), "should accept {address}");
        }
    }

    #[test]
    fn rejects_tampered_checksums() {
        // Each of these is a valid address with its final character changed.
        for address in [
            "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3",
            "3K9KZZPB8NRwZVP5wNKX4VYhnswrJxpgZ5",
            "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw98",
            "notanaddress",
            "",
        ] {
            assert!(!is_bitcoin_address(address), "should reject {address}");
        }
    }

    #[test]
    fn network_is_checked_separately_from_validity() {
        // Well-formed, but testnet — the address endpoint must not treat this
        // as a mainnet address with an empty balance.
        let parsed = parse_address("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx")
            .expect("testnet address should parse");
        assert!(!parsed.is_valid_for_network(bitcoin::Network::Bitcoin));
        assert!(parsed.is_valid_for_network(bitcoin::Network::Testnet));
    }
}
