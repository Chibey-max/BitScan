use axum::{Json, extract::State};

use crate::{
    AppState,
    error::AppError,
    groq::bitcoin_resources,
    model::{AiChatRequest, AiChatResponse},
};

pub async fn chat(
    State(state): State<AppState>,
    Json(request): Json<AiChatRequest>,
) -> Result<Json<AiChatResponse>, AppError> {
    let message = request.message.trim();
    if message.is_empty() {
        return Err(AppError::BadRequest("message is required".into()));
    }

    let mode = request
        .mode
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("beginner");

    let Some(ai) = &state.ai else {
        return Err(AppError::BadRequest(
            "AI mode is not configured; set GROQ_API_KEY or GROQ_API_KEYS".into(),
        ));
    };

    Ok(Json(
        ai.chat(message, mode, request.context.as_deref()).await?,
    ))
}

pub async fn resources() -> Json<Vec<crate::model::AiResource>> {
    Json(bitcoin_resources())
}
