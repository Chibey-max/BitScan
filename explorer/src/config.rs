pub struct Config {
    pub bind_addr: String,
    pub rpc_url: String,
    pub rpc_user: String,
    pub rpc_password: String,
    pub rpc_api_key: Option<String>,
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
            rpc_api_key: std::env::var("BITCOIN_RPC_API_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty()),
        }
    }
}
