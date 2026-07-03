//! HTTP handlers for governance endpoints.
//!
//! - PATCH /v1/governance/policy - Update governance config (platform_admin only)
//! - GET /v1/governance/audit-log - Retrieve change history (platform_admin/auditor)
//!
//! Key security principles from ADR-005:
//! - Requires elevated roles (platform_admin for updates, platform_admin/auditor for audit log)
//! - All changes are logged to governance_audit_log

use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};

use crate::domain::auth::authenticate;
use crate::domain::model::{
    AuditLogQuery, AuditLogResponse, GovernanceConfig, GovernancePolicyResponse,
    GovernancePolicyUpdate, Role,
};
use crate::domain::ports::{DeveloperRepositoryExt, GovernanceRepository};
use crate::infrastructure::AppState;

use super::error::AppError;

/// PATCH /v1/governance/policy - Update governance configuration.
///
/// Authentication: Bearer token (self-signed JWT from local-agent)
/// Authorization: Requires platform_admin role
pub async fn update_governance_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(update): Json<GovernancePolicyUpdate>,
) -> Result<Json<GovernancePolicyResponse>, AppError> {
    // Step 1: Authenticate
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let identity = authenticate(auth_header, |developer_id| {
        let dev_repo = state.developer_repo.clone();
        async move { dev_repo.get_public_key(developer_id).await }
    })
    .await?;

    let developer_id = identity.developer_id;

    // Step 2: Check role - must be platform_admin
    let developer = state
        .developer_repo_ext
        .get_developer(developer_id)
        .await?;

    if developer.role != Role::PlatformAdmin {
        return Err(AppError::Forbidden(
            "Only platform_admin can update governance policy".to_string(),
        ));
    }

    // Step 3: Get current config for audit log
    let before = state.governance_repo.get_config().await?;

    // Step 4: Merge updates with current config
    let new_config = GovernanceConfig {
        company_domains: update.company_domains.unwrap_or_else(|| before.company_domains.clone()),
        personal_account_policy: update
            .personal_account_policy
            .unwrap_or(before.personal_account_policy),
        raw_retention_days: update.raw_retention_days.unwrap_or(before.raw_retention_days),
    };

    // Step 5: Validate
    if new_config.raw_retention_days < 1 || new_config.raw_retention_days > 365 {
        return Err(AppError::Validation(
            "raw_retention_days must be between 1 and 365".to_string(),
        ));
    }

    // Step 6: Update and log
    let updated_at = state
        .governance_repo
        .update_config(&new_config, developer_id, &before)
        .await?;

    tracing::info!(
        actor = %developer_id,
        "Governance policy updated"
    );

    Ok(Json(GovernancePolicyResponse {
        updated_at,
        updated_by: developer_id,
        company_domains: new_config.company_domains,
        personal_account_policy: new_config.personal_account_policy,
        raw_retention_days: new_config.raw_retention_days,
    }))
}

/// GET /v1/governance/audit-log - Retrieve governance change history.
///
/// Authentication: Bearer token (self-signed JWT from local-agent)
/// Authorization: Requires platform_admin or auditor role
pub async fn get_audit_log(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditLogQuery>,
) -> Result<Json<AuditLogResponse>, AppError> {
    // Step 1: Authenticate
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let identity = authenticate(auth_header, |developer_id| {
        let dev_repo = state.developer_repo.clone();
        async move { dev_repo.get_public_key(developer_id).await }
    })
    .await?;

    let developer_id = identity.developer_id;

    // Step 2: Check role - must be platform_admin or auditor
    let developer = state
        .developer_repo_ext
        .get_developer(developer_id)
        .await?;

    if !matches!(developer.role, Role::PlatformAdmin | Role::Auditor) {
        return Err(AppError::Forbidden(
            "Only platform_admin or auditor can view audit log".to_string(),
        ));
    }

    // Step 3: Query audit log
    let entries = state
        .governance_repo
        .get_audit_log(query.date_from, query.date_to)
        .await?;

    tracing::info!(
        actor = %developer_id,
        entry_count = entries.len(),
        "Audit log queried"
    );

    Ok(Json(AuditLogResponse { entries }))
}
