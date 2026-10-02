use reqwest::Client;
use serde::Deserialize;

use crate::error::AppError;
use crate::model::{AddressResponse, AddressTransaction};

#[derive(Clone)]
pub struct TatumClient {
    client: Client,
    api_key: Option<String>,
    api_base: String,
}

#[derive(Deserialize)]
struct TatumBalance {
    balance: Option<String>,
    incoming: String,
    outgoing: String,
    #[serde(rename = "incomingPending")]
    incoming_pending: Option<String>,
    #[serde(rename = "outgoingPending")]
    outgoing_pending: Option<String>,
}

#[derive(Deserialize)]
struct TatumAddressTx {
    hash: String,
    #[serde(rename = "blockNumber")]
    block_number: Option<u64>,
    fee: Option<u64>,
    time: Option<u64>,
    inputs: Option<Vec<TatumInput>>,
    outputs: Option<Vec<TatumOutput>>,
}

#[derive(Deserialize)]
struct TatumInput {
    coin: Option<TatumCoin>,
}

#[derive(Deserialize)]
struct TatumCoin {
    value: Option<u64>,
    address: Option<String>,
}

#[derive(Deserialize)]
struct TatumOutput {
    value: Option<u64>,
    address: Option<String>,
}

impl TatumClient {
    pub fn new(api_key: Option<String>, api_base: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            api_base: api_base.trim_end_matches('/').to_owned(),
        }
    }

    pub fn is_configured(&self) -> bool {
        self.api_key.is_some()
    }

    pub async fn address(&self, address: &str) -> Result<AddressResponse, AppError> {
        let balance = self.balance(address).await?;
        let transactions = self.address_transactions(address, 25).await?;
        let balance_sat = balance
            .balance
            .as_deref()
            .map(btc_decimal_to_sat)
            .unwrap_or_else(|| {
                btc_decimal_to_sat(&balance.incoming) - btc_decimal_to_sat(&balance.outgoing)
            });
        let pending_balance_sat =
            btc_decimal_to_sat(balance.incoming_pending.as_deref().unwrap_or("0"))
                - btc_decimal_to_sat(balance.outgoing_pending.as_deref().unwrap_or("0"));

        Ok(AddressResponse {
            address: address.to_owned(),
            is_valid: true,
            script_pub_key: None,
            balance_sat: balance_sat.max(0) as u64,
            received_sat: btc_decimal_to_sat(&balance.incoming).max(0) as u64,
            sent_sat: btc_decimal_to_sat(&balance.outgoing).max(0) as u64,
            pending_balance_sat,
            tx_count: transactions.len(),
            utxo_count: 0,
            utxos: Vec::new(),
            transactions,
            source: "Tatum".into(),
        })
    }

    pub async fn transaction_fee_sat(&self, txid: &str) -> Result<Option<i64>, AppError> {
        let tx = self
            .get::<TatumAddressTx>(&format!("/v3/bitcoin/transaction/{txid}"))
            .await?;
        Ok(tx.fee.map(|fee| fee as i64))
    }

    async fn balance(&self, address: &str) -> Result<TatumBalance, AppError> {
        self.get(&format!("/v3/bitcoin/address/balance/{address}"))
            .await
    }

    async fn address_transactions(
        &self,
        address: &str,
        page_size: usize,
    ) -> Result<Vec<AddressTransaction>, AppError> {
        let rows = self
            .get::<Vec<TatumAddressTx>>(&format!(
                "/v3/bitcoin/transaction/address/{address}?pageSize={}",
                page_size.clamp(1, 50)
            ))
            .await?;

        Ok(rows
            .into_iter()
            .map(|tx| {
                let received_sat = tx
                    .outputs
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .filter(|output| output.address.as_deref() == Some(address))
                    .filter_map(|output| output.value)
                    .sum::<u64>();
                let sent_sat = tx
                    .inputs
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .filter_map(|input| input.coin.as_ref())
                    .filter(|coin| coin.address.as_deref() == Some(address))
                    .filter_map(|coin| coin.value)
                    .sum::<u64>();

                AddressTransaction {
                    txid: tx.hash,
                    block_height: tx.block_number,
                    timestamp: tx.time.map(timestamp_to_seconds),
                    fee_sat: tx.fee,
                    received_sat,
                    sent_sat,
                    net_sat: received_sat as i64 - sent_sat as i64,
                }
            })
            .collect())
    }

    async fn get<T>(&self, path: &str) -> Result<T, AppError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| AppError::BadRequest("TATUM_API_KEY is not configured".into()))?;

        Ok(self
            .client
            .get(format!("{}{}", self.api_base, path))
            .header("x-api-key", api_key)
            .header("accept", "application/json")
            .send()
            .await?
            .error_for_status()?
            .json::<T>()
            .await?)
    }
}

fn btc_decimal_to_sat(value: &str) -> i64 {
    let trimmed = value.trim();
    let sign = if trimmed.starts_with('-') { -1 } else { 1 };
    let unsigned = trimmed.trim_start_matches('-');
    let (whole, fractional) = unsigned.split_once('.').unwrap_or((unsigned, ""));
    let whole_sat = whole.parse::<i64>().unwrap_or(0) * 100_000_000;
    let mut frac = fractional.chars().take(8).collect::<String>();
    while frac.len() < 8 {
        frac.push('0');
    }
    sign * (whole_sat + frac.parse::<i64>().unwrap_or(0))
}

fn timestamp_to_seconds(value: u64) -> u64 {
    if value > 10_000_000_000 {
        value / 1000
    } else {
        value
    }
}
