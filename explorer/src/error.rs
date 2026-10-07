use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{error::Error, fmt};

#[derive(Debug)]
pub enum AppError {
    Rpc(String),
    BadRequest(String),
    NotFound(String),
    RateLimited(String),
    Transport(reqwest::Error),
    Json(serde_json::Error),
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Rpc(message) => write!(formatter, "bitcoin core rpc error: {message}"),
            AppError::BadRequest(message) => write!(formatter, "invalid request: {message}"),
            AppError::NotFound(message) => write!(formatter, "not found: {message}"),
            AppError::RateLimited(message) => write!(formatter, "rate limited: {message}"),
            AppError::Transport(error) => error.fmt(formatter),
            AppError::Json(error) => error.fmt(formatter),
        }
    }
}

impl Error for AppError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            AppError::Transport(error) => Some(error),
            AppError::Json(error) => Some(error),
            AppError::Rpc(_)
            | AppError::BadRequest(_)
            | AppError::NotFound(_)
            | AppError::RateLimited(_) => None,
        }
    }
}

impl From<reqwest::Error> for AppError {
    fn from(error: reqwest::Error) -> Self {
        AppError::Transport(error)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        AppError::Json(error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::RateLimited(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::Rpc(_) | AppError::Transport(_) | AppError::Json(_) => {
                StatusCode::BAD_GATEWAY
            }
        };

        let body = Json(json!({
            "error": self.to_string(),
        }));

        (status, body).into_response()
    }
}
