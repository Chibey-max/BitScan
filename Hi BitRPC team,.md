Hi BitRPC team,

I’m building BitScan, a Bitcoin block explorer powered by a Rust backend and Next.js frontend. Right now the app already uses BitRPC successfully for standard Bitcoin Core RPC calls.

The methods currently working through BitRPC are:

- getblockchaininfo
- getmempoolinfo
- getblockhash
- getblock
- getrawtransaction

These power the chain tip, mempool stats, latest blocks, block details, block transaction lists, and transaction details when the block hash is known.

The main blocker is that I still need a separate indexer provider for some explorer features, especially:

1. Looking up any historical transaction by txid without needing block_hash.
2. Getting address balance.
3. Getting total received and total sent for an address.
4. Getting address transaction history.
5. Getting address UTXOs.
6. Getting pending/unconfirmed address activity.
7. Paginating address transaction history.

Can you confirm if BitRPC supports any of these features, either through Bitcoin Core RPC with txindex enabled or through an indexed/Electrs-style API?

Ideally, I want BitScan to use BitRPC as the only Bitcoin data provider and remove the need for Tatum or any other indexer.

The exact JSON-RPC methods I currently use are documented here in my project:

BITRPC_METHODS.md

Thanks.