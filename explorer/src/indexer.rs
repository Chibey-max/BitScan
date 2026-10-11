use std::{collections::HashMap, sync::Arc, time::Duration};

use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use tokio::time::sleep;

use crate::error::AppError;
use crate::model::{AddressResponse, AddressTransaction};
use crate::rpc::RpcClient;

use crate::handlers::{btc_to_sat, optional_string};

#[derive(Clone)]
pub struct Indexer {
    pool: PgPool,
}

#[derive(Clone)]
pub struct IndexerChain {
    pub key: &'static str,
    pub rpc: Arc<RpcClient>,
}

impl Indexer {
    pub async fn connect(pool: PgPool) -> Result<Self, sqlx::Error> {
        let indexer = Self { pool };
        indexer.migrate().await?;
        Ok(indexer)
    }

    async fn migrate(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            create table if not exists indexed_blocks (
                network text not null,
                height bigint not null,
                hash text not null,
                timestamp bigint not null,
                previous_hash text,
                next_hash text,
                size bigint,
                weight bigint,
                tx_count bigint not null,
                synced_at timestamptz not null default now(),
                primary key (network, height),
                unique (network, hash)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create table if not exists indexed_transactions (
                network text not null,
                txid text not null,
                block_hash text not null,
                block_height bigint not null,
                timestamp bigint not null,
                fee_sat bigint,
                vsize bigint,
                input_count bigint not null,
                output_count bigint not null,
                output_value_sat bigint not null,
                raw jsonb not null,
                synced_at timestamptz not null default now(),
                primary key (network, txid)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create index if not exists indexed_transactions_block_idx
            on indexed_transactions (network, block_height desc)
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create table if not exists indexed_outputs (
                network text not null,
                txid text not null,
                vout bigint not null,
                address text,
                value_sat bigint not null,
                script_type text,
                spent_by_txid text,
                synced_at timestamptz not null default now(),
                primary key (network, txid, vout)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create index if not exists indexed_outputs_address_idx
            on indexed_outputs (network, address)
            where address is not null
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create table if not exists indexed_address_txs (
                network text not null,
                address text not null,
                txid text not null,
                block_height bigint not null,
                timestamp bigint not null,
                received_sat bigint not null default 0,
                spent_sat bigint not null default 0,
                fee_sat bigint,
                synced_at timestamptz not null default now(),
                primary key (network, address, txid)
            )
            "#,
        )
        .execute(&self.pool)
        .await?;

        sqlx::query(
            r#"
            create index if not exists indexed_address_txs_address_height_idx
            on indexed_address_txs (network, address, block_height desc)
            "#,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub fn spawn_recent_sync(
        self: Arc<Self>,
        chains: Vec<IndexerChain>,
        lookback_blocks: u64,
        poll_seconds: u64,
    ) {
        let poll = Duration::from_secs(poll_seconds.max(5));
        for chain in chains {
            let indexer = self.clone();
            tokio::spawn(async move {
                indexer
                    .sync_chain_forever(chain, lookback_blocks, poll)
                    .await;
            });
        }
    }

    async fn sync_chain_forever(&self, chain: IndexerChain, lookback_blocks: u64, poll: Duration) {
        loop {
            if let Err(error) = self.sync_recent_chain(&chain, lookback_blocks).await {
                tracing::warn!(
                    network = chain.key,
                    %error,
                    "recent indexer sync failed"
                );
            }
            sleep(poll).await;
        }
    }

    pub async fn sync_recent_chain(
        &self,
        chain: &IndexerChain,
        lookback_blocks: u64,
    ) -> Result<(), AppError> {
        let info = chain.rpc.call("getblockchaininfo", json!([])).await?;
        let Some(tip) = info.get("blocks").and_then(Value::as_u64) else {
            return Err(AppError::Rpc("getblockchaininfo returned no blocks".into()));
        };
        let start = tip.saturating_sub(lookback_blocks.saturating_sub(1));
        for height in (start..=tip).rev() {
            if let Err(error) = self.sync_block_at_height(chain, height).await {
                tracing::warn!(
                    network = chain.key,
                    height,
                    %error,
                    "recent indexer skipped block"
                );
            }
        }
        Ok(())
    }

    async fn sync_block_at_height(
        &self,
        chain: &IndexerChain,
        height: u64,
    ) -> Result<(), AppError> {
        let hash = chain.rpc.call("getblockhash", json!([height])).await?;
        let Some(hash) = hash.as_str() else {
            return Err(AppError::Rpc("getblockhash returned non-string".into()));
        };

        // A buried block never changes, so re-ingesting one is pure waste: the
        // poll loop revisits the same window every cycle, and a mainnet block
        // is ~3,500 transactions and ~10,000 outputs of redundant upserts. If
        // the stored hash still matches, the block is done. A differing hash
        // means this height was reorged, so fall through and re-ingest it.
        if self.has_block(chain.key, height, hash).await? {
            return Ok(());
        }

        let block = chain.rpc.call("getblock", json!([hash, 2])).await?;
        self.upsert_block(chain.key, &block).await
    }

    async fn has_block(&self, network: &str, height: u64, hash: &str) -> Result<bool, AppError> {
        let stored: Option<String> = sqlx::query_scalar(
            r#"
            select hash
            from indexed_blocks
            where network = $1 and height = $2
            "#,
        )
        .bind(network)
        .bind(height as i64)
        .fetch_optional(&self.pool)
        .await
        .map_err(sqlx_error)?;

        Ok(stored.as_deref() == Some(hash))
    }

    async fn upsert_block(&self, network: &str, block: &Value) -> Result<(), AppError> {
        let height = u64_field(block, "height")?;
        let hash = string_field(block, "hash")?;
        let timestamp = u64_field(block, "time")?;
        let previous_hash = optional_string(block, "previousblockhash");
        let next_hash = optional_string(block, "nextblockhash");
        let size = block.get("size").and_then(Value::as_u64);
        let weight = block.get("weight").and_then(Value::as_u64);
        let txs = block
            .get("tx")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        sqlx::query(
            r#"
            insert into indexed_blocks
                (network, height, hash, timestamp, previous_hash, next_hash, size, weight, tx_count, synced_at)
            values
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
            on conflict (network, height) do update set
                hash = excluded.hash,
                timestamp = excluded.timestamp,
                previous_hash = excluded.previous_hash,
                next_hash = excluded.next_hash,
                size = excluded.size,
                weight = excluded.weight,
                tx_count = excluded.tx_count,
                synced_at = now()
            "#,
        )
        .bind(network)
        .bind(height as i64)
        .bind(&hash)
        .bind(timestamp as i64)
        .bind(previous_hash)
        .bind(next_hash)
        .bind(size.map(|value| value as i64))
        .bind(weight.map(|value| value as i64))
        .bind(txs.len() as i64)
        .execute(&self.pool)
        .await
        .map_err(sqlx_error)?;

        for tx in txs {
            self.upsert_transaction(network, &hash, height, timestamp, &tx)
                .await?;
        }

        Ok(())
    }

    async fn upsert_transaction(
        &self,
        network: &str,
        block_hash: &str,
        block_height: u64,
        timestamp: u64,
        tx: &Value,
    ) -> Result<(), AppError> {
        let txid = string_field(tx, "txid")?;
        let vins = tx
            .get("vin")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let vouts = tx
            .get("vout")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let output_value_sat = vouts
            .iter()
            .map(|output| {
                btc_to_sat(
                    output
                        .get("value")
                        .and_then(Value::as_f64)
                        .unwrap_or_default(),
                )
            })
            .sum::<u64>();
        let fee_sat = tx.get("fee").and_then(Value::as_f64).map(|fee| {
            let sats = fee * 100_000_000.0;
            sats.round() as i64
        });

        sqlx::query(
            r#"
            delete from indexed_address_txs
            where network = $1 and txid = $2
            "#,
        )
        .bind(network)
        .bind(&txid)
        .execute(&self.pool)
        .await
        .map_err(sqlx_error)?;

        sqlx::query(
            r#"
            insert into indexed_transactions
                (network, txid, block_hash, block_height, timestamp, fee_sat, vsize,
                 input_count, output_count, output_value_sat, raw, synced_at)
            values
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
            on conflict (network, txid) do update set
                block_hash = excluded.block_hash,
                block_height = excluded.block_height,
                timestamp = excluded.timestamp,
                fee_sat = excluded.fee_sat,
                vsize = excluded.vsize,
                input_count = excluded.input_count,
                output_count = excluded.output_count,
                output_value_sat = excluded.output_value_sat,
                raw = excluded.raw,
                synced_at = now()
            "#,
        )
        .bind(network)
        .bind(&txid)
        .bind(block_hash)
        .bind(block_height as i64)
        .bind(timestamp as i64)
        .bind(fee_sat)
        .bind(
            tx.get("vsize")
                .and_then(Value::as_u64)
                .map(|value| value as i64),
        )
        .bind(vins.len() as i64)
        .bind(vouts.len() as i64)
        .bind(output_value_sat as i64)
        .bind(tx)
        .execute(&self.pool)
        .await
        .map_err(sqlx_error)?;

        for output in &vouts {
            self.upsert_output(network, &txid, output).await?;
        }

        for input in &vins {
            self.mark_spent_output(network, &txid, input, fee_sat)
                .await?;
        }

        Ok(())
    }

    async fn upsert_output(
        &self,
        network: &str,
        txid: &str,
        output: &Value,
    ) -> Result<(), AppError> {
        let n = output.get("n").and_then(Value::as_u64).unwrap_or_default();
        let script = output.get("scriptPubKey").unwrap_or(&Value::Null);
        let address = optional_string(script, "address").or_else(|| {
            script
                .get("addresses")
                .and_then(Value::as_array)
                .and_then(|items| items.first())
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
        });
        let value_sat = btc_to_sat(
            output
                .get("value")
                .and_then(Value::as_f64)
                .unwrap_or_default(),
        );
        let script_type = optional_string(script, "type");

        sqlx::query(
            r#"
            insert into indexed_outputs
                (network, txid, vout, address, value_sat, script_type, synced_at)
            values
                ($1, $2, $3, $4, $5, $6, now())
            on conflict (network, txid, vout) do update set
                address = excluded.address,
                value_sat = excluded.value_sat,
                script_type = excluded.script_type,
                synced_at = now()
            "#,
        )
        .bind(network)
        .bind(txid)
        .bind(n as i64)
        .bind(&address)
        .bind(value_sat as i64)
        .bind(script_type)
        .execute(&self.pool)
        .await
        .map_err(sqlx_error)?;

        if let Some(address) = address {
            sqlx::query(
                r#"
                insert into indexed_address_txs
                    (network, address, txid, block_height, timestamp, received_sat, spent_sat, synced_at)
                select $1, $2, t.txid, t.block_height, t.timestamp, $3, 0, now()
                from indexed_transactions t
                where t.network = $1 and t.txid = $4
                on conflict (network, address, txid) do update set
                    received_sat = indexed_address_txs.received_sat + excluded.received_sat,
                    block_height = excluded.block_height,
                    timestamp = excluded.timestamp,
                    synced_at = now()
                "#,
            )
            .bind(network)
            .bind(address)
            .bind(value_sat as i64)
            .bind(txid)
            .execute(&self.pool)
            .await
            .map_err(sqlx_error)?;
        }

        Ok(())
    }

    async fn mark_spent_output(
        &self,
        network: &str,
        spending_txid: &str,
        input: &Value,
        fee_sat: Option<i64>,
    ) -> Result<(), AppError> {
        let Some(prev_txid) = optional_string(input, "txid") else {
            return Ok(());
        };
        let Some(prev_vout) = input.get("vout").and_then(Value::as_u64) else {
            return Ok(());
        };

        let previous = sqlx::query(
            r#"
            update indexed_outputs
            set spent_by_txid = $1,
                synced_at = now()
            where network = $2 and txid = $3 and vout = $4
            returning address, value_sat
            "#,
        )
        .bind(spending_txid)
        .bind(network)
        .bind(prev_txid)
        .bind(prev_vout as i64)
        .fetch_optional(&self.pool)
        .await
        .map_err(sqlx_error)?;

        let Some(previous) = previous else {
            return Ok(());
        };
        let address: Option<String> = previous.try_get("address").ok();
        let value_sat: i64 = previous.try_get("value_sat").unwrap_or_default();
        let Some(address) = address else {
            return Ok(());
        };

        sqlx::query(
            r#"
            insert into indexed_address_txs
                (network, address, txid, block_height, timestamp, received_sat, spent_sat, fee_sat, synced_at)
            select $1, $2, t.txid, t.block_height, t.timestamp, 0, $3, $4, now()
            from indexed_transactions t
            where t.network = $1 and t.txid = $5
            on conflict (network, address, txid) do update set
                spent_sat = indexed_address_txs.spent_sat + excluded.spent_sat,
                fee_sat = excluded.fee_sat,
                block_height = excluded.block_height,
                timestamp = excluded.timestamp,
                synced_at = now()
            "#,
        )
        .bind(network)
        .bind(address)
        .bind(value_sat)
        .bind(fee_sat)
        .bind(spending_txid)
        .execute(&self.pool)
        .await
        .map_err(sqlx_error)?;

        Ok(())
    }

    /// Total fees for each of `hashes`, from the indexed transactions.
    ///
    /// `getblockstats` would answer this in one call but hosted providers
    /// allowlist it away, and summing `getblock` verbosity-2 per request is far
    /// too expensive. Blocks outside the indexed window simply have no entry,
    /// and the field stays `None` rather than reporting a wrong total.
    pub async fn block_fees(
        &self,
        network: &str,
        hashes: &[String],
    ) -> Result<HashMap<String, u64>, AppError> {
        if hashes.is_empty() {
            return Ok(HashMap::new());
        }

        let rows = sqlx::query(
            r#"
            select block_hash, coalesce(sum(fee_sat), 0)::bigint as fees
            from indexed_transactions
            where network = $1 and block_hash = any($2)
            group by block_hash
            "#,
        )
        .bind(network)
        .bind(hashes)
        .fetch_all(&self.pool)
        .await
        .map_err(sqlx_error)?;

        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let hash: String = row.try_get("block_hash").ok()?;
                let fees: i64 = row.try_get("fees").ok()?;
                Some((hash, fees.max(0) as u64))
            })
            .collect())
    }

    /// How much `address` spent in each of `txids`, where the index knows.
    ///
    /// The address-indexing provider returns input addresses as null, so a
    /// transaction's spent amount cannot be derived from its response at all.
    /// The local index already resolves every outpoint it ingests, so for
    /// transactions inside the indexed window this is exact and costs one
    /// query instead of one provider lookup per input.
    pub async fn address_sent_by_txid(
        &self,
        network: &str,
        address: &str,
        txids: &[String],
    ) -> Result<HashMap<String, u64>, AppError> {
        if txids.is_empty() {
            return Ok(HashMap::new());
        }

        let rows = sqlx::query(
            r#"
            select txid, spent_sat
            from indexed_address_txs
            where network = $1 and address = $2 and txid = any($3) and spent_sat > 0
            "#,
        )
        .bind(network)
        .bind(address)
        .bind(txids)
        .fetch_all(&self.pool)
        .await
        .map_err(sqlx_error)?;

        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let txid: String = row.try_get("txid").ok()?;
                let spent: i64 = row.try_get("spent_sat").ok()?;
                Some((txid, spent.max(0) as u64))
            })
            .collect())
    }

    pub async fn address_response(
        &self,
        network: &str,
        address: &str,
        address_type: String,
        limit: usize,
        offset: usize,
    ) -> Result<Option<AddressResponse>, AppError> {
        let total_rows: i64 = sqlx::query_scalar(
            r#"
            select count(*)
            from indexed_address_txs
            where network = $1 and address = $2
            "#,
        )
        .bind(network)
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .map_err(sqlx_error)?;

        if total_rows == 0 {
            return Ok(None);
        }

        let balance_sat: Option<i64> = sqlx::query_scalar(
            r#"
            select coalesce(sum(value_sat), 0)::bigint
            from indexed_outputs
            where network = $1 and address = $2 and spent_by_txid is null
            "#,
        )
        .bind(network)
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .map_err(sqlx_error)?;
        let received_sat: Option<i64> = sqlx::query_scalar(
            r#"
            select coalesce(sum(value_sat), 0)::bigint
            from indexed_outputs
            where network = $1 and address = $2
            "#,
        )
        .bind(network)
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .map_err(sqlx_error)?;
        let sent_sat: Option<i64> = sqlx::query_scalar(
            r#"
            select coalesce(sum(value_sat), 0)::bigint
            from indexed_outputs
            where network = $1 and address = $2 and spent_by_txid is not null
            "#,
        )
        .bind(network)
        .bind(address)
        .fetch_one(&self.pool)
        .await
        .map_err(sqlx_error)?;

        let rows = sqlx::query(
            r#"
            select txid, block_height, timestamp, fee_sat, received_sat, spent_sat
            from indexed_address_txs
            where network = $1 and address = $2
            order by block_height desc, timestamp desc, txid desc
            limit $3 offset $4
            "#,
        )
        .bind(network)
        .bind(address)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(sqlx_error)?;

        let transactions = rows
            .into_iter()
            .map(|row| AddressTransaction {
                txid: row.try_get("txid").unwrap_or_default(),
                block_height: row
                    .try_get::<i64, _>("block_height")
                    .ok()
                    .map(|value| value as u64),
                timestamp: row
                    .try_get::<i64, _>("timestamp")
                    .ok()
                    .map(|value| value as u64),
                fee_sat: row
                    .try_get::<Option<i64>, _>("fee_sat")
                    .ok()
                    .flatten()
                    .map(|value| value.max(0) as u64),
                received_sat: row
                    .try_get::<i64, _>("received_sat")
                    .unwrap_or_default()
                    .max(0) as u64,
                spends_from_address: row.try_get::<i64, _>("spent_sat").unwrap_or_default() > 0,
                sent_sat: match row.try_get::<i64, _>("spent_sat").unwrap_or_default() {
                    spent if spent > 0 => Some(spent as u64),
                    _ => None,
                },
            })
            .collect();

        Ok(Some(AddressResponse {
            network: network.into(),
            address: address.into(),
            is_valid: true,
            address_type,
            balance_sat: balance_sat.unwrap_or_default().max(0) as u64,
            received_sat: received_sat.unwrap_or_default().max(0) as u64,
            sent_sat: sent_sat.unwrap_or_default().max(0) as u64,
            pending_balance_sat: 0,
            // These sums cover only the indexed window, not the address's
            // whole history, so the response says so and the UI can too.
            totals_complete: false,
            offset,
            limit,
            transactions,
            source: "bitscan-indexer".into(),
        }))
    }
}

fn string_field(value: &Value, key: &str) -> Result<String, AppError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AppError::Rpc(format!("missing string field `{key}`")))
}

fn u64_field(value: &Value, key: &str) -> Result<u64, AppError> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| AppError::Rpc(format!("missing numeric field `{key}`")))
}

fn sqlx_error(error: sqlx::Error) -> AppError {
    AppError::Rpc(format!("indexer database: {error}"))
}
