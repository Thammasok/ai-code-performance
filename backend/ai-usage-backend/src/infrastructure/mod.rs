use axum::{routing::post, Router};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::adapters::http::events::submit_event;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
}

pub fn build_app(state: AppState) -> Router {
    Router::new()
        .route("/v1/events", post(submit_event))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
