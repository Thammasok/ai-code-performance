use std::sync::Arc;

use axum::{routing::{get, post}, Router};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::adapters::db::repository::{PgDeveloperRepository, PgEventRepository, PgGovernanceRepository};
use crate::adapters::http::events::{health, submit_event};
use crate::domain::ports::{DeveloperRepository, EventRepository, GovernanceRepository};

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    pub event_repo: Arc<dyn EventRepository>,
    pub developer_repo: Arc<dyn DeveloperRepository>,
    pub governance_repo: Arc<dyn GovernanceRepository>,
}

impl AppState {
    /// Create AppState from a PostgreSQL connection pool.
    pub fn from_pool(pool: PgPool) -> Self {
        Self {
            event_repo: Arc::new(PgEventRepository::new(pool.clone())),
            developer_repo: Arc::new(PgDeveloperRepository::new(pool.clone())),
            governance_repo: Arc::new(PgGovernanceRepository::new(pool)),
        }
    }
}

/// Build the Axum router with all routes.
pub fn build_app(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/events", post(submit_event))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
