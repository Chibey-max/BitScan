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
pub struct SearchQuery {
    pub q: String,
}

#[derive(Deserialize)]
pub struct TxQuery {
    pub block_hash: Option<String>,
}

#[derive(Deserialize)]
pub struct ReceiptQuery {
    pub txid: String,
    pub address: String,
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
    pub hex: Option<String>,
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
    pub story: Story,
    pub fee_report: Option<FeeReport>,
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
    pub op_return_text: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum TxKind {
    Coinbase,
    Payment,
    SelfTransfer,
    Consolidation,
    BatchPayout,
    CoinJoinLike,
    DataCarrier,
    Unknown,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Serialize, Clone)]
pub struct Story {
    pub kind: TxKind,
    pub headline: String,
    pub sentences: Vec<String>,
    pub change_output: Option<u64>,
    pub confidence: Confidence,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct FeeReport {
    pub grade: String,
    pub fee_rate_sat_vb: f64,
    pub percentile: Option<f64>,
    pub verdict: String,
    pub savings_vs_median_sat: Option<u64>,
    pub savings_vs_min_sat: Option<u64>,
    pub min_fee_rate_sat_vb: Option<f64>,
    pub avg_fee_rate_sat_vb: Option<f64>,
    pub max_fee_rate_sat_vb: Option<f64>,
    pub percentiles_sat_vb: Vec<f64>,
}

#[derive(Serialize)]
pub struct ReceiptResponse {
    pub txid: String,
    pub address: String,
    pub amount_sat: u64,
    pub output_indices: Vec<u64>,
    pub status: String,
    pub confirmations: Option<u64>,
    pub block_hash: Option<String>,
    pub block_time: Option<u64>,
    pub generated_at: u64,
}

#[derive(Serialize)]
pub struct BlockMessagesResponse {
    pub block_hash: String,
    pub height: u64,
    pub coinbase_tag: Option<String>,
    pub messages: Vec<ChainMessage>,
}

#[derive(Serialize)]
pub struct ChainMessage {
    pub txid: String,
    pub output_index: Option<u64>,
    pub kind: String,
    pub text: String,
}

#[derive(Serialize)]
pub struct AddressResponse {
    pub address: String,
    pub is_valid: bool,
    pub script_pub_key: Option<String>,
    pub balance_sat: u64,
    pub received_sat: u64,
    pub sent_sat: u64,
    pub pending_balance_sat: i64,
    pub tx_count: usize,
    pub utxo_count: usize,
    pub utxos: Vec<AddressUtxo>,
    pub transactions: Vec<AddressTransaction>,
    pub source: String,
}

#[derive(Serialize)]
pub struct AddressUtxo {
    pub txid: String,
    pub vout: u64,
    pub height: Option<u64>,
    pub value_sat: u64,
}

#[derive(Serialize)]
pub struct AddressTransaction {
    pub txid: String,
    pub block_height: Option<u64>,
    pub timestamp: Option<u64>,
    pub fee_sat: Option<u64>,
    pub received_sat: u64,
    pub sent_sat: u64,
    pub net_sat: i64,
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SearchResponse {
    Block { hash: String, height: Option<u64> },
    Tx { txid: String },
    Address { address: String },
}
