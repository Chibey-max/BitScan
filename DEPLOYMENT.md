# BitScan Deployment Guide

BitScan is deployed as two services:

```txt
User browser
  -> Next.js frontend
    -> Rust Axum API
      -> Bitcoin Core / BitRPC JSON-RPC
```

The frontend and backend should not be deployed as one Vercel app. The Next.js app can run on Vercel, but the Rust API is a long-running Axum web server and should run on a backend host such as Render, Fly.io, Railway, or a VPS.

## Recommended Production Setup

Use this setup for the simplest deployment:

```txt
Frontend: Vercel
Backend: Render
Bitcoin RPC: BitRPC
```

## Deploy The Rust API On Render

Create a new Render **Web Service** from the GitHub repository.

Use these settings:

```txt
Root Directory: explorer
Build Command: cargo build --release
Start Command: ./target/release/explorer
```

Add these environment variables:

```env
BIND_ADDRESS=0.0.0.0:10000
BITCOIN_RPC_URL=https://bitrpc.thebuidl.xyz/bitcoin
BITCOIN_RPC_API_KEY=your_bitrpc_api_key
```

Do not commit the real API key. Add it only in the Render dashboard.

Render web services must listen on `0.0.0.0`. The app currently reads its listen address from `BIND_ADDRESS`, so `0.0.0.0:10000` is the deployment value to use.

After deployment, test the API:

```txt
https://your-render-service.onrender.com/health
```

Expected response shape:

```json
{
  "ok": true,
  "api": "bitscan",
  "rpc": true,
  "message": "api and bitcoin core are reachable"
}
```

## Deploy The Frontend On Vercel

Create a new Vercel project from the GitHub repository.

Use these settings:

```txt
Root Directory: frontend/my-app
Framework Preset: Next.js
Build Command: npm run build
```

Add this environment variable in Vercel:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

This value must point to the deployed Rust API, not `localhost`.

After changing `NEXT_PUBLIC_API_BASE_URL`, redeploy the frontend. Next.js public environment variables are embedded into the client build.

## Production Request Flow

In production, requests work like this:

```txt
Vercel frontend
  -> NEXT_PUBLIC_API_BASE_URL
    -> Render Rust API
      -> BitRPC JSON-RPC
```

Examples:

```txt
Frontend search bar
  -> https://your-render-service.onrender.com/api/search?q=969301

Block detail page
  -> https://your-render-service.onrender.com/api/block/969301

Transaction page
  -> https://your-render-service.onrender.com/api/tx/{txid}?block_hash={block_hash}
```

## Important Notes

- This app is currently RPC-backed, not indexer-backed.
- There is no production database.
- Address history is limited by the RPC provider.
- BitRPC API keys must stay on the Rust backend only.
- Never expose `BITCOIN_RPC_API_KEY` through the frontend.
- Only `NEXT_PUBLIC_API_BASE_URL` belongs in the frontend environment.

## Local Vs Production Environment

Local backend:

```env
BIND_ADDRESS=127.0.0.1:3001
BITCOIN_RPC_URL=https://bitrpc.thebuidl.xyz/bitcoin
BITCOIN_RPC_API_KEY=your_bitrpc_api_key
```

Production backend:

```env
BIND_ADDRESS=0.0.0.0:10000
BITCOIN_RPC_URL=https://bitrpc.thebuidl.xyz/bitcoin
BITCOIN_RPC_API_KEY=your_bitrpc_api_key
```

Local frontend:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001
```

Production frontend:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
```

## Alternative Backend Hosts

You can also deploy the Rust API to:

- Fly.io
- Railway
- Shuttle
- Koyeb
- a VPS with Docker/systemd

The same rules apply:

- build the Rust API from `explorer/`
- bind to `0.0.0.0`
- use the host's expected port
- set `BITCOIN_RPC_URL`
- set `BITCOIN_RPC_API_KEY`

## Future Improvement

A small backend improvement would make deployment more portable:

```txt
Read PORT from the environment if BIND_ADDRESS is not set.
```

That would allow hosts like Render, Railway, and Fly.io to inject their own port automatically.
