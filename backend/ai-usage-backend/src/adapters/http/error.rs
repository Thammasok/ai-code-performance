//! HTTP error response handling.
//!
//! Converts domain errors into structured JSON responses with appropriate status codes.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

use crate::domain::auth::AuthError;
use crate::domain::ports::RepositoryError;

/// Structured error response body.
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: &'static str,
    pub message: String,
}

/// Application error that can be converted to HTTP response.
#[derive(Debug)]
pub enum AppError {
    Auth(AuthError),
    Repository(RepositoryError),
    Validation(String),
}

impl From<AuthError> for AppError {
    fn from(e: AuthError) -> Self {
        AppError::Auth(e)
    }
}

impl From<RepositoryError> for AppError {
    fn from(e: RepositoryError) -> Self {
        AppError::Repository(e)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::Auth(e) => match e {
                AuthError::MissingAuthHeader | AuthError::InvalidAuthHeaderFormat => {
                    (StatusCode::UNAUTHORIZED, "missing_auth", e.to_string())
                }
                AuthError::DeveloperNotFound(_) => {
                    (StatusCode::UNAUTHORIZED, "developer_not_found", e.to_string())
                }
                AuthError::SignatureVerificationFailed(_) => {
                    (StatusCode::UNAUTHORIZED, "invalid_signature", e.to_string())
                }
                AuthError::TokenExpired => {
                    (StatusCode::UNAUTHORIZED, "token_expired", e.to_string())
                }
                AuthError::InvalidJwtHeader(_)
                | AuthError::InvalidJwtPayload(_)
                | AuthError::InvalidToken(_) => {
                    (StatusCode::UNAUTHORIZED, "invalid_token", e.to_string())
                }
            },
            AppError::Repository(e) => match e {
                RepositoryError::DuplicateEvent(id) => (
                    StatusCode::CONFLICT,
                    "duplicate_event",
                    format!("Event {} already exists", id),
                ),
                RepositoryError::Database(msg) => {
                    // Log internal error, return generic message to client
                    tracing::error!("Database error: {}", msg);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "internal_error",
                        "Internal server error".to_string(),
                    )
                }
                RepositoryError::NotFound => {
                    (StatusCode::NOT_FOUND, "not_found", "Resource not found".to_string())
                }
            },
            AppError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, "validation_error", msg),
        };

        let body = ErrorResponse {
            error: ErrorBody { code, message },
        };

        (status, Json(body)).into_response()
    }
}
