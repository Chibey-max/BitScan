# BitScan

BitScan is a full-stack Bitcoin explorer MVP:

- `explorer/` is a Rust Axum API that talks to Bitcoin Core JSON-RPC.
- `frontend/my-app/` is a Next.js dashboard for chain, block, transaction, and search inspection.

## Run Bitcoin Core

For local development, run Bitcoin Core in regtest with RPC enabled and `txindex=1`.

Example `bitcoin.conf` values:

```conf
regtest=1
server=1
txindex=1
rpcuser=bitcoin
rpcpassword=bitcoin
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
```

## Run the API

```bash
cd explorer
cp .env.example .env
cargo run
```

The API defaults to `http://127.0.0.1:3001`.

To use BitRPC instead of local Bitcoin Core, set these values in `explorer/.env`:

```env
BITCOIN_RPC_URL=https://bitrpc.thebuidl.xyz/bitcoin
BITCOIN_RPC_API_KEY=your_bitrpc_key
```

BitRPC supports the block explorer flow well: tip, blocks, block transactions, mempool, and transaction lookup when the block hash is provided. It does not currently permit every Bitcoin Core method, so arbitrary address search/balance scanning is not part of the BitRPC-backed MVP.

Useful endpoints:

- `GET /health`
- `GET /api/tip`
- `GET /api/mempool`
- `GET /api/blocks?limit=10`
- `GET /api/block/{height_or_hash}`
- `GET /api/block/{height_or_hash}/txs`
- `GET /api/tx/{txid}`
- `GET /api/tx/{txid}?block_hash={block_hash}`
- `GET /api/search?q={height_hash_or_txid}`

## Run the frontend

```bash
cd frontend/my-app
cp .env.example .env.local
npm run dev
```

The frontend defaults to `http://127.0.0.1:3000` and calls the API at `http://127.0.0.1:3001`.

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the recommended Vercel + Render deployment setup.
