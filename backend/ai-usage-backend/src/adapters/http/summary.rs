//! HTTP handler for GET /v1/usage/summary.
//!
//! Key security principles from ADR-005:
//! - Result set is scoped server-side by role
//! - Developer sees only their own data
//! - Manager sees their team's data
//! - Platform admin sees all data
//! - Postgres RLS provides defense-in-depth (future enhancement)

use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};

use crate::domain::auth::authenticate;
use crate::domain::model::{Role, UsageSummaryQuery, UsageSummaryResponse};
use crate::infrastructure::AppState;

use super::error::AppError;

/// GET /v1/usage/summary - Query aggregated usage data.
///
/// Authentication: Bearer token (self-signed JWT from local-agent)
/// Authorization: Scoped by role (developer/manager/admin)
pub async fn get_usage_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UsageSummaryQuery>,
) -> Result<Json<UsageSummaryResponse>, AppError> {
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

    // Step 2: Get developer info for role-based scoping
    let developer = state
        .developer_repo_ext
        .get_developer(developer_id)
        .await
        .unwrap_or_else(|_| crate::domain::model::Developer {
            developer_id,
            email: None,
            display_name: None,
            role: Role::Developer,
            team_id: None,
        });

    // Step 3: Determine which developer IDs to query based on role
    let developer_ids = match developer.role {
        Role::PlatformAdmin => {
            // Admin can see all, or filter by requested developer_id/team_id
            if let Some(req_dev_id) = query.developer_id {
                Some(vec![req_dev_id])
            } else if let Some(ref team_id) = query.team_id {
                let ids = state
                    .usage_summary_repo
                    .get_team_developer_ids(team_id)
                    .await?;
                Some(ids)
            } else {
                None // All developers
            }
        }
        Role::Manager => {
            // Manager can see their team
            if let Some(ref team_id) = developer.team_id {
                let ids = state
                    .usage_summary_repo
                    .get_team_developer_ids(team_id)
                    .await?;
                Some(ids)
            } else {
                // No team assigned, can only see self
                Some(vec![developer_id])
            }
        }
        Role::Developer | Role::Auditor => {
            // Developer/Auditor can only see their own data
            Some(vec![developer_id])
        }
    };

    // Step 4: Query usage summary
    let results = state
        .usage_summary_repo
        .query_summary(developer_ids, query.date_from, query.date_to, query.group_by)
        .await?;

    tracing::info!(
        developer_id = %developer_id,
        role = ?developer.role,
        result_count = results.len(),
        "Usage summary queried"
    );

    Ok(Json(UsageSummaryResponse { results }))
}
