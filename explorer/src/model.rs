use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct BlocksQuery {
    pub limit: Option<u64>,
    pub from_height: Option<u64>,
}

#[derive(Deserialize)]
pub struct PageQuery {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
pub struct AddressQuery {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize)]
pub struct TxQuery {
    pub block_hash: Option<String>,
}

#[derive(Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub api: &'static str,
    pub rpc: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct TipResponse {
    pub height: u64,
    pub hash: String,
    pub chain: String,
    pub verification_progress: f64,
}

#[derive(Serialize)]
pub struct MempoolResponse {
    pub size: u64,
    pub bytes: u64,
    pub usage: u64,
    pub min_fee_rate: Option<f64>,
}

#[derive(Serialize)]
pub struct BlocksResponse {
    pub blocks: Vec<BlockSummary>,
    pub next_from_height: Option<u64>,
}

#[derive(Serialize)]
pub struct BlockSummary {
    pub height: u64,
    pub hash: String,
    pub timestamp: u64,
    pub tx_count: usize,
    pub size: Option<u64>,
    pub weight: Option<u64>,
    pub total_fees_sat: Option<u64>,
}

#[derive(Serialize)]
pub struct BlockDetail {
    pub height: u64,
    pub hash: String,
    pub previous_block_hash: Option<String>,
    pub next_block_hash: Option<String>,
    pub timestamp: u64,
    pub confirmations: Option<u64>,
    pub merkleroot: String,
    pub nonce: u64,
    pub bits: String,
    pub difficulty: f64,
    pub size: Option<u64>,
    pub weight: Option<u64>,
    pub tx_count: usize,
    pub txids: Vec<String>,
}

#[derive(Serialize)]
pub struct BlockTransactionsResponse {
    pub block: BlockSummary,
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub transactions: Vec<TxSummary>,
}

#[derive(Serialize)]
pub struct TxSummary {
    pub txid: String,
    pub fee_sat: Option<i64>,
    pub input_count: usize,
    pub output_count: usize,
    pub output_value_sat: u64,
}

#[derive(Serialize)]
pub struct TransactionDetail {
    pub txid: String,
    pub hash: String,
    pub size: Option<u64>,
    pub vsize: Option<u64>,
    pub weight: Option<u64>,
    pub version: Option<i64>,
    pub locktime: Option<u64>,
    pub blockhash: Option<String>,
    pub confirmations: Option<u64>,
    pub fee_sat: Option<i64>,
    pub inputs: Vec<TxInput>,
    pub outputs: Vec<TxOutput>,
}

#[derive(Serialize)]
pub struct TxInput {
    pub txid: Option<String>,
    pub vout: Option<u64>,
    pub coinbase: Option<String>,
    pub sequence: Option<u64>,
    pub previous_output: Option<TxOutput>,
}

#[derive(Serialize, Clone)]
pub struct TxOutput {
    pub n: u64,
    pub value_sat: u64,
    pub script_type: Option<String>,
    pub address: Option<String>,
}

#[derive(Serialize)]
pub struct AddressResponse {
    pub address: String,
    pub is_valid: bool,
    pub balance_sat: u64,
    pub received_sat: u64,
    pub sent_sat: u64,
    pub pending_balance_sat: i64,
    pub offset: usize,
    pub limit: usize,
    pub transactions: Vec<AddressTransaction>,
    /// Which upstream answered, so the UI can be honest about provenance.
    pub source: String,
}

#[derive(Serialize)]
pub struct AddressTransaction {
    pub txid: String,
    pub block_height: Option<u64>,
    pub timestamp: Option<u64>,
    pub fee_sat: Option<u64>,
    /// Sum of this transaction's outputs paying the address. Exact.
    pub received_sat: u64,
    /// Whether the address appears among the inputs. The amount it spent is not
    /// derivable without resolving every previous output, so it is not reported.
    pub spends_from_address: bool,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SearchResponse {
    Block { hash: String, height: Option<u64> },
    Tx { txid: String },
    Address { address: String },
}
