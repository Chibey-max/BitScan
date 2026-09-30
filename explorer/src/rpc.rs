use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::error::AppError;

#[derive(Clone)]
pub struct RpcClient {
    client: Client,
    url: String,
    user: String,
    password: String,
    api_key: Option<String>,
}

#[derive(Deserialize)]
struct RpcEnvelope {
    result: Option<Value>,
    error: Option<RpcError>,
}

#[derive(Deserialize)]
struct RpcError {
    message: String,
}

impl RpcClient {
    pub fn new(url: String, user: String, password: String, api_key: Option<String>) -> Self {
        Self {
            client: Client::new(),
            url,
            user,
            password,
            api_key,
        }
    }

    pub async fn call(&self, method: &str, params: Value) -> Result<Value, AppError> {
        let mut request = self.client.post(&self.url).json(&json!({
            "jsonrpc": "1.0",
            "id": "bitscan",
            "method": method,
            "params": params,
        }));

        request = if let Some(api_key) = &self.api_key {
            request.header("X-API-Key", api_key)
        } else {
            request.basic_auth(&self.user, Some(&self.password))
        };

        let envelope = request
            .send()
            .await?
            .error_for_status()?
            .json::<RpcEnvelope>()
            .await?;

        if let Some(error) = envelope.error {
            return Err(AppError::Rpc(error.message));
        }

        envelope
            .result
            .ok_or_else(|| AppError::Rpc(format!("{method} returned no result")))
    }
}
