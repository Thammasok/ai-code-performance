//! HTTP handler for POST /v1/events.
//!
//! Key security principles from ADR-003:
//! - `developer_id` is NEVER accepted from request body
//! - `developer_id` is derived ONLY from JWT signature verification
//! - Any `developer_id` field in the body is silently ignored

use axum::{
    extract::State,
    http::HeaderMap,
    Json,
};
use crate::domain::auth::authenticate;
use crate::domain::model::{
    classify_account, should_redact, EventResponse, EventResponseStatus,
    UsageEvent, UsageEventInput,
};
use crate::infrastructure::AppState;

use super::error::AppError;

/// POST /v1/events - Submit a usage event from local-agent.
///
/// Authentication: Bearer token (self-signed JWT from local-agent)
/// The `developer_id` is derived from JWT signature, NOT from request body.
pub async fn submit_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<UsageEventInput>,
) -> Result<Json<EventResponse>, AppError> {
    // Step 1: Authenticate and derive developer_id from JWT signature
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let identity = authenticate(auth_header, |developer_id| {
        let dev_repo = state.developer_repo.clone();
        async move { dev_repo.get_public_key(developer_id).await }
    })
    .await?;

    // developer_id is now TRUSTED because it came from signature verification
    let developer_id = identity.developer_id;

    // Step 2: Get governance config for account classification
    let governance = state
        .governance_repo
        .get_config()
        .await
        .unwrap_or_default();

    // Step 3: Classify account (server-side per ADR-004)
    let account_class = classify_account(
        input.account_email_domain.as_deref(),
        &governance.company_domains,
    );

    // Step 4: Determine if we should redact
    let redact = should_redact(account_class, governance.personal_account_policy);

    // Step 5: Build full event with server-derived fields
    let event = UsageEvent::from_input(input, developer_id, account_class);

    // Step 6: Persist (with redaction applied at write time, not query time)
    state.event_repo.insert_event(&event, redact).await?;

    tracing::info!(
        event_id = %event.event_id,
        developer_id = %developer_id,
        tool = ?event.tool,
        account_class = ?account_class,
        redacted = redact,
        "Event accepted"
    );

    Ok(Json(EventResponse {
        event_id: event.event_id,
        status: EventResponseStatus::Accepted,
    }))
}

/// Health check endpoint.
pub async fn health() -> &'static str {
    "ok"
}
