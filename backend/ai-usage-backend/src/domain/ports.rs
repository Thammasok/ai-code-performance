//! Domain ports (interfaces) for external dependencies.
//!
//! These traits define the contracts that adapters must implement.
//! The domain layer depends only on these traits, not on concrete implementations.

use async_trait::async_trait;
use uuid::Uuid;

use super::auth::AuthError;
use super::model::{GovernanceConfig, UsageEvent};

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

    /// Update governance configuration (admin only).
    async fn update_config(&self, config: &GovernanceConfig) -> Result<(), RepositoryError>;
}
