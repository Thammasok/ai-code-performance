use std::sync::Arc;

use axum::{
    routing::{get, patch, post},
    Router,
};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::adapters::db::repository::{
    PgDeveloperRepository, PgEventRepository, PgGovernanceRepository, PgUsageSummaryRepository,
};
use crate::adapters::http::events::{health, submit_event};
use crate::adapters::http::governance::{get_audit_log, update_governance_policy};
use crate::adapters::http::summary::get_usage_summary;
use crate::domain::ports::{
    DeveloperRepository, DeveloperRepositoryExt, EventRepository, GovernanceRepository,
    UsageSummaryRepository,
};

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub event_repo: Arc<dyn EventRepository>,
    pub developer_repo: Arc<dyn DeveloperRepository>,
    pub developer_repo_ext: Arc<dyn DeveloperRepositoryExt>,
    pub governance_repo: Arc<dyn GovernanceRepository>,
    pub usage_summary_repo: Arc<dyn UsageSummaryRepository>,
}

impl AppState {
    /// Create AppState from a PostgreSQL connection pool.
    pub fn from_pool(pool: PgPool) -> Self {
        let developer_repo = Arc::new(PgDeveloperRepository::new(pool.clone()));
        Self {
            event_repo: Arc::new(PgEventRepository::new(pool.clone())),
            developer_repo: developer_repo.clone(),
            developer_repo_ext: developer_repo,
            governance_repo: Arc::new(PgGovernanceRepository::new(pool.clone())),
            usage_summary_repo: Arc::new(PgUsageSummaryRepository::new(pool)),
        }
    }
}

/// Build the Axum router with all routes.
pub fn build_app(state: AppState) -> Router {
    Router::new()
        // Health check
        .route("/health", get(health))
        // Tier 1: Event submission
        .route("/v1/events", post(submit_event))
        // Tier 2: Usage summary
        .route("/v1/usage/summary", get(get_usage_summary))
        // Tier 2: Governance
        .route("/v1/governance/policy", patch(update_governance_policy))
        .route("/v1/governance/audit-log", get(get_audit_log))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
