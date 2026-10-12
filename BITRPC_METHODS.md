# BitScan BitRPC Method Requirements

This document lists the Bitcoin RPC methods BitScan currently calls through BitRPC, what each method is used for, and the extra provider support needed so BitScan can avoid using a separate indexer such as Tatum.

## Current BitRPC Usage

BitScan connects to BitRPC as a Bitcoin Core JSON-RPC provider. The Rust backend calls BitRPC from `explorer/src/rpc.rs` through:

```rust
state.rpc.call(method, params)
```

The frontend does not call BitRPC directly. The flow is:

```text
Next.js frontend -> Rust API -> BitRPC JSON-RPC -> Bitcoin node/provider
```

## Methods Already Used

| Method | Params used by BitScan | Used for | Rust location |
| --- | --- | --- | --- |
| `getblockchaininfo` | `[]` | Chain tip height, best block hash, chain name, verification progress, health checks, and confirmation calculations for indexed transaction fallback | `blocks.rs`, `health.rs`, `transactions.rs` |
| `getmempoolinfo` | `[]` | Mempool transaction count, mempool bytes, memory usage, and minimum fee rate | `blocks.rs` |
| `getblockhash` | `[height]` | Converts a block height into a block hash | `blocks.rs` |
| `getblock` | `[hash, 1]` | Fetches block details including height, hash, previous/next block hash, time, merkle root, nonce, bits, difficulty, size, weight, confirmations, and transaction IDs | `blocks.rs`, `search.rs` |
| `getrawtransaction` | `[txid, true, block_hash]` | Fetches decoded transactions from a known block, used for block transaction summaries and transaction details | `blocks.rs`, `transactions.rs` |
| `getrawtransaction` | `[txid, true]` | Attempts direct tx lookup and previous-output lookup. This only works reliably if the provider has `txindex` enabled or another transaction index behind the endpoint | `transactions.rs`, `search.rs` |

## What Each Method Powers In The App

### `getblockchaininfo`

Used by:

- `GET /api/tip`
- `GET /api/blocks`
- `GET /health`
- Transaction confirmation fallback logic

Required fields:

- `blocks`
- `bestblockhash`
- `chain`
- `verificationprogress`

This powers the current chain tip card, latest height, backend health status, and pagination start point for latest blocks.

### `getmempoolinfo`

Used by:

- `GET /api/mempool`

Required fields:

- `size`
- `bytes`
- `usage`
- `mempoolminfee`

This powers the mempool card and minimum fee display.

### `getblockhash`

Used by:

- Block height search
- Block detail lookup by height
- Latest block listing

Params:

```json
[969995]
```

Expected result:

```json
"000000000000000000..."
```

This lets BitScan support URLs and searches like:

```text
/block/969995
```

### `getblock`

Used by:

- `GET /api/block/{height_or_hash}`
- `GET /api/blocks`
- `GET /api/block/{height_or_hash}/txs`
- Search classification for 64-character hashes

Params:

```json
["block_hash", 1]
```

Required fields:

- `height`
- `hash`
- `previousblockhash`
- `nextblockhash`
- `time`
- `confirmations`
- `merkleroot`
- `nonce`
- `bits`
- `difficulty`
- `size`
- `weight`
- `tx`

This powers the block page, latest blocks list, block filling/weight display, and block transaction pagination.

### `getrawtransaction`

Used by:

- `GET /api/block/{id}/txs`
- `GET /api/tx/{txid}`
- Input previous-output resolution

Preferred params when the block is known:

```json
["txid", true, "block_hash"]
```

Fallback/direct params:

```json
["txid", true]
```

Required fields:

- `txid`
- `hash`
- `size`
- `vsize`
- `weight`
- `version`
- `locktime`
- `blockhash`
- `confirmations`
- `vin`
- `vout`
- `fee`, if available

This powers transaction details, inputs, outputs, total output value, and fee calculations.

## Current Limitation

The current BitRPC methods are enough for:

- Chain tip
- Mempool status
- Latest blocks
- Block details
- Block transactions when the block hash is known
- Transaction detail when the tx can be resolved by `getrawtransaction`

The current BitRPC methods are not enough for full explorer behavior unless BitRPC also supports indexing features.

## Why Tatum Is Currently Used

Tatum is only used as an indexer fallback for:

1. Transaction lookup when `getrawtransaction(txid, true)` cannot resolve a tx without `block_hash`.
2. Address balance.
3. Address transaction history.

Current Tatum endpoints used:

```text
GET /v3/bitcoin/transaction/{txid}
GET /v3/bitcoin/address/balance/{address}
GET /v3/bitcoin/transaction/address/{address}
```

## What BitRPC Needs To Provide So BitScan Can Remove Tatum

To remove Tatum completely, BitRPC would need one of these options.

### Option A: Full `txindex` Support

Support:

```json
getrawtransaction(txid, true)
```

for historical transactions without requiring `block_hash`.

This would fix direct transaction searches and transaction pages opened from search.

### Option B: Address Indexing Support

Bitcoin Core RPC does not provide full address history by default. To replace Tatum address features, BitRPC needs indexed address endpoints or equivalent RPC methods that can answer:

- Address confirmed balance
- Address pending balance
- Total received
- Total sent
- Address transaction history
- Pagination for address transactions

Needed response shape for BitScan:

```json
{
  "address": "bc1...",
  "balance_sat": 12345,
  "received_sat": 50000,
  "sent_sat": 37655,
  "pending_balance_sat": 0,
  "transactions": [
    {
      "txid": "...",
      "block_height": 969995,
      "timestamp": 1750000000,
      "fee_sat": 1234,
      "received_sat": 10000,
      "spends_from_address": false
    }
  ]
}
```

### Option C: Electrs-Compatible API

If BitRPC can expose an Electrs-compatible HTTP API, BitScan can use it for address and transaction indexing.

Useful endpoints would include:

```text
GET /address/{address}
GET /address/{address}/txs
GET /address/{address}/utxo
GET /tx/{txid}
GET /tx/{txid}/status
```

This would replace the current Tatum address and transaction fallback paths.

## Direct Request To BitRPC Team

BitScan already works well with BitRPC for standard Bitcoin Core methods:

- `getblockchaininfo`
- `getmempoolinfo`
- `getblockhash`
- `getblock`
- `getrawtransaction`

To make BitRPC the only provider BitScan needs, please confirm whether BitRPC supports:

1. `getrawtransaction(txid, true)` for any historical transaction without requiring `block_hash`.
2. Address balance lookup.
3. Address transaction history lookup.
4. Address UTXO lookup.
5. Pagination for address transaction history.
6. Pending/unconfirmed address transactions.

If those are supported, BitScan can remove Tatum and use BitRPC as the single data source.

