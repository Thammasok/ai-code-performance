//! Domain ports (interfaces) for external dependencies.
//!
//! These traits define the contracts that adapters must implement.
//! The domain layer depends only on these traits, not on concrete implementations.

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, Utc};
use uuid::Uuid;

use super::auth::AuthError;
use super::model::{AuditLogEntry, Developer, GovernanceConfig, GroupBy, UsageEvent, UsageSummaryRow};

/// Error type for repository operations.
#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("database error: {0}")]
    Database(String),

    #[error("event already exists: {0}")]
    DuplicateEvent(Uuid),

    #[error("not found")]
    NotFound,
}

/// Repository for usage events.
#[async_trait]
pub trait EventRepository: Send + Sync {
    /// Insert a new usage event.
    ///
    /// The `redact` flag indicates whether sensitive fields should be zeroed
    /// BEFORE writing to the database (ADR-004 data minimization).
    async fn insert_event(&self, event: &UsageEvent, redact: bool) -> Result<(), RepositoryError>;

    /// Check if an event with the given ID already exists (for idempotency).
    async fn event_exists(&self, event_id: Uuid) -> Result<bool, RepositoryError>;
}

/// Repository for developer identity and public keys.
#[async_trait]
pub trait DeveloperRepository: Send + Sync {
    /// Get the registered public key (PEM format) for a developer.
    /// Returns `AuthError::DeveloperNotFound` if not registered.
    async fn get_public_key(&self, developer_id: Uuid) -> Result<String, AuthError>;

    /// Check if a developer is registered.
    async fn developer_exists(&self, developer_id: Uuid) -> Result<bool, RepositoryError>;
}

/// Repository for governance configuration.
#[async_trait]
pub trait GovernanceRepository: Send + Sync {
    /// Get the current governance configuration.
    async fn get_config(&self) -> Result<GovernanceConfig, RepositoryError>;

    /// Update governance configuration and log the change.
    /// Returns the updated_at timestamp.
    async fn update_config(
        &self,
        config: &GovernanceConfig,
        actor_id: Uuid,
        before: &GovernanceConfig,
    ) -> Result<DateTime<Utc>, RepositoryError>;

    /// Get audit log entries within date range.
    async fn get_audit_log(
        &self,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
    ) -> Result<Vec<AuditLogEntry>, RepositoryError>;
}

/// Repository for usage summary queries.
#[async_trait]
pub trait UsageSummaryRepository: Send + Sync {
    /// Query aggregated usage data.
    ///
    /// - `developer_ids`: List of developer IDs to include (for scoping by role)
    /// - `date_from`, `date_to`: Date range filter
    /// - `group_by`: Grouping dimension
    async fn query_summary(
        &self,
        developer_ids: Option<Vec<Uuid>>,
        date_from: NaiveDate,
        date_to: NaiveDate,
        group_by: Option<GroupBy>,
    ) -> Result<Vec<UsageSummaryRow>, RepositoryError>;

    /// Get all developer IDs in a team (for manager role scoping).
    async fn get_team_developer_ids(&self, team_id: &str) -> Result<Vec<Uuid>, RepositoryError>;
}

/// Extended DeveloperRepository with role lookup.
#[async_trait]
pub trait DeveloperRepositoryExt: DeveloperRepository {
    /// Get full developer info including role.
    async fn get_developer(&self, developer_id: Uuid) -> Result<Developer, RepositoryError>;
}
