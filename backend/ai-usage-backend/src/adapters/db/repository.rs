//! PostgreSQL repository implementations.
//!
//! Key implementation notes per ADR-004:
//! - `insert_event()` receives `redact: bool` and zeros out tokens/cost/project
//!   BEFORE writing to DB, not at query time (data minimization).

use async_trait::async_trait;
use sqlx::PgPool;
use uuid::Uuid;

use crate::domain::auth::AuthError;
use crate::domain::model::{
    AccountClass, CallStatus, GovernanceConfig, PersonalAccountPolicy, Provider, Tool, UsageEvent,
};
use crate::domain::ports::{DeveloperRepository, EventRepository, GovernanceRepository, RepositoryError};

/// PostgreSQL implementation of EventRepository.
#[derive(Clone)]
pub struct PgEventRepository {
    pool: PgPool,
}

impl PgEventRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl EventRepository for PgEventRepository {
    async fn insert_event(&self, event: &UsageEvent, redact: bool) -> Result<(), RepositoryError> {
        // Apply redaction BEFORE persist (ADR-004 data minimization)
        let (tokens_input, tokens_output, tokens_cached, cost, project) = if redact {
            (0i64, 0i64, 0i64, None::<f64>, None::<String>)
        } else {
            (
                event.tokens_input,
                event.tokens_output,
                event.tokens_cached,
                event.cost_estimate_usd,
                event.project.clone(),
            )
        };

        sqlx::query!(
            r#"
            INSERT INTO usage_events (
                event_id, developer_id, tool, tool_version, model, provider,
                tokens_input, tokens_output, tokens_cached, cost_estimate_usd,
                session_id, project, machine_id, timestamp, latency_ms, status,
                account_email_domain, account_class
            ) VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18
            )
            ON CONFLICT (event_id) DO NOTHING
            "#,
            event.event_id,
            event.developer_id,
            tool_to_str(event.tool),
            event.tool_version,
            event.model,
            provider_to_str(event.provider),
            tokens_input,
            tokens_output,
            tokens_cached,
            cost,
            event.session_id,
            project,
            event.machine_id,
            event.timestamp,
            event.latency_ms,
            status_to_str(event.status),
            event.account_email_domain,
            account_class_to_str(event.account_class),
        )
        .execute(&self.pool)
        .await
        .map_err(|e| RepositoryError::Database(e.to_string()))?;

        Ok(())
    }

    async fn event_exists(&self, event_id: Uuid) -> Result<bool, RepositoryError> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM usage_events WHERE event_id = $1) as "exists!""#,
            event_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| RepositoryError::Database(e.to_string()))?;

        Ok(result)
    }
}

/// PostgreSQL implementation of DeveloperRepository.
#[derive(Clone)]
pub struct PgDeveloperRepository {
    pool: PgPool,
}

impl PgDeveloperRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl DeveloperRepository for PgDeveloperRepository {
    async fn get_public_key(&self, developer_id: Uuid) -> Result<String, AuthError> {
        let result = sqlx::query_scalar!(
            r#"SELECT public_key FROM developers WHERE developer_id = $1"#,
            developer_id
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AuthError::InvalidToken(e.to_string()))?;

        result.ok_or(AuthError::DeveloperNotFound(developer_id))
    }

    async fn developer_exists(&self, developer_id: Uuid) -> Result<bool, RepositoryError> {
        let result = sqlx::query_scalar!(
            r#"SELECT EXISTS(SELECT 1 FROM developers WHERE developer_id = $1) as "exists!""#,
            developer_id
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| RepositoryError::Database(e.to_string()))?;

        Ok(result)
    }
}

/// PostgreSQL implementation of GovernanceRepository.
#[derive(Clone)]
pub struct PgGovernanceRepository {
    pool: PgPool,
}

impl PgGovernanceRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl GovernanceRepository for PgGovernanceRepository {
    async fn get_config(&self) -> Result<GovernanceConfig, RepositoryError> {
        let row = sqlx::query!(
            r#"
            SELECT
                company_domains,
                personal_account_policy,
                raw_retention_days
            FROM governance_config
            WHERE id = 1
            "#
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| RepositoryError::Database(e.to_string()))?;

        match row {
            Some(r) => Ok(GovernanceConfig {
                company_domains: r.company_domains.unwrap_or_default(),
                personal_account_policy: str_to_personal_account_policy(&r.personal_account_policy),
                raw_retention_days: r.raw_retention_days,
            }),
            None => Ok(GovernanceConfig::default()),
        }
    }

    async fn update_config(&self, config: &GovernanceConfig) -> Result<(), RepositoryError> {
        sqlx::query!(
            r#"
            INSERT INTO governance_config (id, company_domains, personal_account_policy, raw_retention_days)
            VALUES (1, $1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET
                company_domains = EXCLUDED.company_domains,
                personal_account_policy = EXCLUDED.personal_account_policy,
                raw_retention_days = EXCLUDED.raw_retention_days,
                updated_at = NOW()
            "#,
            &config.company_domains,
            personal_account_policy_to_str(config.personal_account_policy),
            config.raw_retention_days,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| RepositoryError::Database(e.to_string()))?;

        Ok(())
    }
}

// Helper functions for enum <-> string conversion

fn tool_to_str(tool: Tool) -> &'static str {
    match tool {
        Tool::ClaudeCode => "claude_code",
        Tool::Codex => "codex",
        Tool::Opencode => "opencode",
        Tool::Other => "other",
    }
}

fn provider_to_str(provider: Provider) -> &'static str {
    match provider {
        Provider::Anthropic => "anthropic",
        Provider::Openai => "openai",
        Provider::Other => "other",
    }
}

fn status_to_str(status: CallStatus) -> &'static str {
    match status {
        CallStatus::Success => "success",
        CallStatus::Error => "error",
        CallStatus::Timeout => "timeout",
    }
}

fn account_class_to_str(class: AccountClass) -> &'static str {
    match class {
        AccountClass::Company => "company",
        AccountClass::Personal => "personal",
        AccountClass::Unknown => "unknown",
    }
}

fn personal_account_policy_to_str(policy: PersonalAccountPolicy) -> &'static str {
    match policy {
        PersonalAccountPolicy::FlagOnly => "flag_only",
        PersonalAccountPolicy::CollectFull => "collect_full",
    }
}

fn str_to_personal_account_policy(s: &str) -> PersonalAccountPolicy {
    match s {
        "collect_full" => PersonalAccountPolicy::CollectFull,
        _ => PersonalAccountPolicy::FlagOnly, // default to restrictive
    }
}
