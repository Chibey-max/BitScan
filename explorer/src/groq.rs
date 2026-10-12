use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::{
    error::AppError,
    model::{AiChatResponse, AiResource},
};

#[derive(Clone)]
pub struct GroqClient {
    client: Client,
    base_url: String,
    model: String,
    api_keys: Vec<String>,
}

impl GroqClient {
    pub fn new(base_url: String, model: String, api_keys: Vec<String>) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(35))
            .user_agent("BitScan/1.0")
            .build()?;

        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_owned(),
            model,
            api_keys,
        })
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub async fn chat(
        &self,
        message: &str,
        mode: &str,
        context: Option<&str>,
    ) -> Result<AiChatResponse, AppError> {
        if self.api_keys.is_empty() {
            return Err(AppError::BadRequest(
                "AI mode is not configured; set GROQ_API_KEY or GROQ_API_KEYS".into(),
            ));
        }

        let system_prompt = bitcoin_teacher_prompt(mode);
        let user_prompt = build_user_prompt(message, context);
        let payload = GroqChatRequest {
            model: self.model.clone(),
            temperature: 0.35,
            max_tokens: 900,
            messages: vec![
                GroqMessage {
                    role: "system",
                    content: system_prompt,
                },
                GroqMessage {
                    role: "user",
                    content: user_prompt,
                },
            ],
        };

        let mut last_error = None;
        for (index, api_key) in self.api_keys.iter().enumerate() {
            match self.chat_once(api_key, &payload).await {
                Ok(answer) => {
                    return Ok(AiChatResponse {
                        answer,
                        model: self.model.clone(),
                        provider: "groq",
                        key_index: index + 1,
                        resources: bitcoin_resources(),
                    });
                }
                Err(error) if error.retry_next_key => {
                    tracing::warn!(
                        key_index = index + 1,
                        status = ?error.status,
                        message = %error.message,
                        "Groq key failed; trying fallback key"
                    );
                    last_error = Some(error.message);
                }
                Err(error) => {
                    return Err(AppError::Rpc(format!(
                        "Groq request failed: {}",
                        error.message
                    )));
                }
            }
        }

        Err(AppError::RateLimited(format!(
            "All configured Groq API keys failed{}",
            last_error
                .as_deref()
                .map(|message| format!("; last error: {message}"))
                .unwrap_or_default()
        )))
    }

    async fn chat_once(
        &self,
        api_key: &str,
        payload: &GroqChatRequest,
    ) -> Result<String, GroqAttemptError> {
        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(api_key)
            .json(payload)
            .send()
            .await
            .map_err(|error| GroqAttemptError::retryable(error.to_string(), None))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let retry_next_key = matches!(
                status,
                StatusCode::UNAUTHORIZED
                    | StatusCode::FORBIDDEN
                    | StatusCode::TOO_MANY_REQUESTS
                    | StatusCode::BAD_GATEWAY
                    | StatusCode::SERVICE_UNAVAILABLE
                    | StatusCode::GATEWAY_TIMEOUT
            );
            return Err(GroqAttemptError {
                message: format!("status {status}: {body}"),
                status: Some(status.as_u16()),
                retry_next_key,
            });
        }

        let payload = response
            .json::<GroqChatResponse>()
            .await
            .map_err(|error| GroqAttemptError::retryable(error.to_string(), Some(status)))?;

        payload
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content.trim().to_owned())
            .filter(|content| !content.is_empty())
            .ok_or_else(|| GroqAttemptError {
                message: "Groq returned an empty answer".into(),
                status: Some(status.as_u16()),
                retry_next_key: true,
            })
    }
}

#[derive(Serialize)]
struct GroqChatRequest {
    model: String,
    messages: Vec<GroqMessage>,
    temperature: f32,
    max_tokens: u16,
}

#[derive(Serialize)]
struct GroqMessage {
    role: &'static str,
    content: String,
}

#[derive(Deserialize)]
struct GroqChatResponse {
    choices: Vec<GroqChoice>,
}

#[derive(Deserialize)]
struct GroqChoice {
    message: GroqChoiceMessage,
}

#[derive(Deserialize)]
struct GroqChoiceMessage {
    content: String,
}

struct GroqAttemptError {
    message: String,
    status: Option<u16>,
    retry_next_key: bool,
}

impl GroqAttemptError {
    fn retryable(message: String, status: Option<StatusCode>) -> Self {
        Self {
            message,
            status: status.map(|value| value.as_u16()),
            retry_next_key: true,
        }
    }
}

fn bitcoin_teacher_prompt(mode: &str) -> String {
    format!(
        r#"You are BitScan AI, a Bitcoin-only assistant and teacher inside a Bitcoin explorer.

Rules:
- Only answer questions about Bitcoin, Bitcoin transactions, blocks, fees, scripts, wallets, mining, Lightning, Bitcoin Core, mempool behavior, and BitScan explorer data.
- If the user asks about trading advice, price predictions, investments, taxes, or unrelated crypto tokens, refuse briefly and redirect to Bitcoin education.
- Teach clearly. Use the requested explanation mode: {mode}.
- When explaining explorer data, connect terms to what users see in BitScan: block height, hash, txid, inputs, outputs, fees, weight, confirmations, script type, and mempool status.
- Prefer accurate, humble answers. If the answer depends on live data that was not provided in context, say what extra data is needed.
- Mention useful learning sources when relevant: Learn Me A Bitcoin, Bitcoin Optech, Bitcoin Core documentation, bitcoin.org developer docs, and Mastering Bitcoin.
- Do not invent citations, protocol rules, or exact values.

Answer style:
- Start with the direct answer.
- Then give a short explanation.
- Use bullets or small sections when helpful.
- End with one suggested next concept to learn."#
    )
}

fn build_user_prompt(message: &str, context: Option<&str>) -> String {
    let mut prompt = String::new();
    if let Some(context) = context.map(str::trim).filter(|value| !value.is_empty()) {
        prompt.push_str("BitScan page context:\n");
        prompt.push_str(&truncate(context, 4_000));
        prompt.push_str("\n\n");
    }
    prompt.push_str("User question:\n");
    prompt.push_str(&truncate(message.trim(), 2_000));
    prompt
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

pub fn bitcoin_resources() -> Vec<AiResource> {
    vec![
        AiResource {
            title: "Learn Me A Bitcoin",
            url: "https://learnmeabitcoin.com/",
        },
        AiResource {
            title: "Bitcoin Optech",
            url: "https://bitcoinops.org/",
        },
        AiResource {
            title: "Bitcoin Core Documentation",
            url: "https://bitcoincore.org/en/doc/",
        },
        AiResource {
            title: "Bitcoin.org Developer Guide",
            url: "https://developer.bitcoin.org/",
        },
        AiResource {
            title: "Mastering Bitcoin",
            url: "https://github.com/bitcoinbook/bitcoinbook",
        },
    ]
}
