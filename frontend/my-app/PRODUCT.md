# BitScan

BitScan is a Bitcoin block explorer for the Rust for Bitcoin capstone. It pairs a Rust JSON API with a frontend that lets users inspect chain tip status, recent blocks, block details, transactions, and search results.

The product is for developers, reviewers, and presenters who need to prove the backend can read from Bitcoin Core, decode Bitcoin data, and expose stable explorer-style responses. The frontend should make the API easy to demo and should remain useful when pointed at regtest or a hosted mainnet node.

Primary user tasks:
- Check node/API health and current chain tip.
- Search by block height, block hash, or transaction id where the RPC provider supports it.
- Scan recent blocks and pagination state.
- Inspect transaction status, fee, inputs, and outputs.
- Understand provider limits clearly when a hosted RPC does not expose txindex or address-indexing methods.

Constraints:
- Amounts are displayed as satoshis first, with BTC as secondary formatting when helpful.
- Frontend data comes from the Rust API under `NEXT_PUBLIC_API_BASE_URL`, defaulting to `http://localhost:3001`.
- Empty, loading, and backend-unavailable states are first-class demo states.
- The interface should feel like an operational explorer, not a marketing landing page.
