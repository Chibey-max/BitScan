pub struct Config {
    pub bind_addr: String,
    pub rpc_url: String,
    pub rpc_user: String,
    pub rpc_password: String,
    pub rpc_api_key: Option<String>,
    pub testnet_rpc_url: Option<String>,
    pub testnet_rpc_user: String,
    pub testnet_rpc_password: String,
    pub testnet_rpc_api_key: Option<String>,
    pub tatum_api_key: Option<String>,
    pub tatum_base_url: String,
    pub tatum_testnet_api_key: Option<String>,
    pub tatum_testnet_base_url: String,
    pub tatum_cache_ttl_seconds: u64,
    pub database_url: Option<String>,
    pub indexer_enabled: bool,
    pub indexer_lookback_blocks: u64,
    pub indexer_poll_seconds: u64,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            bind_addr: std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3001".into()),
            rpc_url: std::env::var("BITCOIN_RPC_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:18443".into()),
            rpc_user: std::env::var("BITCOIN_RPC_USER").unwrap_or_else(|_| "bitcoin".into()),
            rpc_password: std::env::var("BITCOIN_RPC_PASSWORD")
                .unwrap_or_else(|_| "bitcoin".into()),
            rpc_api_key: non_empty("BITCOIN_RPC_API_KEY"),
            testnet_rpc_url: non_empty("BITCOIN_TESTNET_RPC_URL")
                .or_else(|| non_empty("TESTNET_BITCOIN_RPC_URL")),
            testnet_rpc_user: std::env::var("BITCOIN_TESTNET_RPC_USER")
                .or_else(|_| std::env::var("TESTNET_BITCOIN_RPC_USER"))
                .unwrap_or_else(|_| "bitcoin".into()),
            testnet_rpc_password: std::env::var("BITCOIN_TESTNET_RPC_PASSWORD")
                .or_else(|_| std::env::var("TESTNET_BITCOIN_RPC_PASSWORD"))
                .unwrap_or_else(|_| "bitcoin".into()),
            testnet_rpc_api_key: non_empty("BITCOIN_TESTNET_RPC_API_KEY")
                .or_else(|| non_empty("TESTNET_BITCOIN_RPC_API_KEY")),
            // Address balances and history need an address-indexing provider; the
            // node RPC alone cannot answer them. Tatum is optional: without a key
            // the explorer still serves blocks, transactions, and search.
            tatum_api_key: non_empty("TATUM_API_KEY"),
            tatum_base_url: std::env::var("TATUM_BASE_URL")
                .unwrap_or_else(|_| "https://api.tatum.io".into()),
            tatum_testnet_api_key: non_empty("TATUM_TESTNET_API_KEY"),
            tatum_testnet_base_url: std::env::var("TATUM_TESTNET_BASE_URL")
                .unwrap_or_else(|_| "https://api.tatum.io".into()),
            tatum_cache_ttl_seconds: std::env::var("TATUM_CACHE_TTL_SECONDS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(300),
            database_url: non_empty("DATABASE_URL"),
            indexer_enabled: std::env::var("INDEXER_ENABLED")
                .map(|value| value != "0" && !value.eq_ignore_ascii_case("false"))
                .unwrap_or(true),
            indexer_lookback_blocks: std::env::var("INDEXER_LOOKBACK_BLOCKS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(24),
            indexer_poll_seconds: std::env::var("INDEXER_POLL_SECONDS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(30),
        }
    }
}

fn non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
}
