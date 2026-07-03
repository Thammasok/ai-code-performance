//! Domain model for AI usage telemetry.
//!
//! Reference: docs/contracts/domain-ai-usage-backend.yaml
//! Key decisions from ADR-003, ADR-004:
//! - `developer_id` is NEVER accepted from client; derived from JWT signature
//! - `account_class` is computed server-side from `account_email_domain`
//! - Redaction happens BEFORE persist, not at query time (data minimization)

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Tool identifier for AI CLI tools.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tool {
    ClaudeCode,
    Codex,
    Opencode,
    Other,
}

/// Provider of the AI model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Anthropic,
    Openai,
    Other,
}

/// Status of the AI call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallStatus {
    Success,
    Error,
    Timeout,
}

/// Account classification result (ADR-004).
/// Computed server-side by comparing `account_email_domain` against company domain allow-list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AccountClass {
    Company,
    Personal,
    Unknown,
}

impl Default for AccountClass {
    fn default() -> Self {
        // ADR-004: `unknown` should be treated as `personal` by default (fail-safe)
        Self::Unknown
    }
}

/// Policy for handling personal account usage data (ADR-004).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PersonalAccountPolicy {
    /// Redact tokens/cost/project before persist; keep only identity + timestamp + account_class
    FlagOnly,
    /// Collect full details regardless of account_class
    CollectFull,
}

impl Default for PersonalAccountPolicy {
    fn default() -> Self {
        // ADR-004: `flag_only` is the default (data minimization)
        Self::FlagOnly
    }
}

/// Governance configuration (ADR-004).
/// Admin-configurable without code deployment.
#[derive(Debug, Clone)]
pub struct GovernanceConfig {
    pub company_domains: Vec<String>,
    pub personal_account_policy: PersonalAccountPolicy,
    pub raw_retention_days: i32,
}

impl Default for GovernanceConfig {
    fn default() -> Self {
        Self {
            company_domains: Vec::new(),
            personal_account_policy: PersonalAccountPolicy::default(),
            raw_retention_days: 90, // ADR-002 default
        }
    }
}

/// Input event from local-agent (client payload).
/// Note: `developer_id` and `account_class` are NOT in this struct;
/// they are derived server-side per ADR-003/ADR-004.
#[derive(Debug, Clone, Deserialize)]
pub struct UsageEventInput {
    pub event_id: Uuid,
    pub tool: Tool,
    #[serde(default)]
    pub tool_version: Option<String>,
    pub model: String,
    pub provider: Provider,
    pub tokens_input: i64,
    pub tokens_output: i64,
    #[serde(default)]
    pub tokens_cached: i64,
    #[serde(default)]
    pub cost_estimate_usd: Option<f64>,
    pub session_id: Uuid,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub machine_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    #[serde(default)]
    pub latency_ms: Option<i32>,
    pub status: CallStatus,
    /// Secondary signal from CLI-native account (ADR-003/ADR-004).
    /// Never authoritative for identity; used only for account classification.
    #[serde(default)]
    pub account_email_domain: Option<String>,
}

/// Full usage event with server-derived fields.
#[derive(Debug, Clone, Serialize)]
pub struct UsageEvent {
    pub event_id: Uuid,
    /// Derived from JWT signature verification (ADR-003). NEVER from client payload.
    pub developer_id: Uuid,
    pub tool: Tool,
    pub tool_version: Option<String>,
    pub model: String,
    pub provider: Provider,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub tokens_cached: i64,
    pub cost_estimate_usd: Option<f64>,
    pub session_id: Uuid,
    pub project: Option<String>,
    pub machine_id: Option<String>,
    pub timestamp: DateTime<Utc>,
    pub latency_ms: Option<i32>,
    pub status: CallStatus,
    pub account_email_domain: Option<String>,
    /// Computed server-side from `account_email_domain` vs company domain allow-list (ADR-004).
    pub account_class: AccountClass,
}

impl UsageEvent {
    /// Create a new event by combining client input with server-derived identity.
    pub fn from_input(input: UsageEventInput, developer_id: Uuid, account_class: AccountClass) -> Self {
        Self {
            event_id: input.event_id,
            developer_id,
            tool: input.tool,
            tool_version: input.tool_version,
            model: input.model,
            provider: input.provider,
            tokens_input: input.tokens_input,
            tokens_output: input.tokens_output,
            tokens_cached: input.tokens_cached,
            cost_estimate_usd: input.cost_estimate_usd,
            session_id: input.session_id,
            project: input.project,
            machine_id: input.machine_id,
            timestamp: input.timestamp,
            latency_ms: input.latency_ms,
            status: input.status,
            account_email_domain: input.account_email_domain,
            account_class,
        }
    }

    /// Apply redaction for personal account policy (ADR-004).
    /// Zeros out tokens/cost/project BEFORE persist (data minimization).
    pub fn redact_for_personal(&mut self) {
        self.tokens_input = 0;
        self.tokens_output = 0;
        self.tokens_cached = 0;
        self.cost_estimate_usd = None;
        self.project = None;
    }
}

/// Classify account based on email domain vs company domain allow-list (ADR-004).
///
/// Returns `AccountClass::Company` if domain matches any company domain,
/// `AccountClass::Personal` if domain is present but doesn't match,
/// `AccountClass::Unknown` if no domain provided.
pub fn classify_account(
    account_email_domain: Option<&str>,
    company_domains: &[String],
) -> AccountClass {
    match account_email_domain {
        None => AccountClass::Unknown,
        Some(domain) => {
            let domain_lower = domain.to_lowercase();
            if company_domains.iter().any(|d| d.to_lowercase() == domain_lower) {
                AccountClass::Company
            } else {
                AccountClass::Personal
            }
        }
    }
}

/// Determine if event should be redacted based on account class and policy (ADR-004).
///
/// Redaction applies when:
/// - policy is `FlagOnly` AND
/// - account_class is `Personal` or `Unknown` (fail-safe: unknown treated as personal)
pub fn should_redact(account_class: AccountClass, policy: PersonalAccountPolicy) -> bool {
    match policy {
        PersonalAccountPolicy::CollectFull => false,
        PersonalAccountPolicy::FlagOnly => {
            matches!(account_class, AccountClass::Personal | AccountClass::Unknown)
        }
    }
}

/// Response for POST /v1/events
#[derive(Debug, Clone, Serialize)]
pub struct EventResponse {
    pub event_id: Uuid,
    pub status: EventResponseStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EventResponseStatus {
    Accepted,
    Rejected,
}

// ============================================================================
// Tier 2 Models: Usage Summary, Governance, Audit Log
// ============================================================================

/// User role for RBAC (ADR-005).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Developer,
    Manager,
    PlatformAdmin,
    Auditor,
}

impl Default for Role {
    fn default() -> Self {
        Self::Developer
    }
}

/// Developer identity with role information.
#[derive(Debug, Clone)]
pub struct Developer {
    pub developer_id: Uuid,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub role: Role,
    pub team_id: Option<String>,
}

/// Query parameters for GET /v1/usage/summary.
#[derive(Debug, Clone, Deserialize)]
pub struct UsageSummaryQuery {
    pub date_from: chrono::NaiveDate,
    pub date_to: chrono::NaiveDate,
    #[serde(default)]
    pub developer_id: Option<Uuid>,
    #[serde(default)]
    pub team_id: Option<String>,
    #[serde(default)]
    pub group_by: Option<GroupBy>,
}

/// Grouping options for usage summary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupBy {
    Tool,
    Model,
    Developer,
    Day,
}

/// Single row in usage summary results.
#[derive(Debug, Clone, Serialize)]
pub struct UsageSummaryRow {
    pub group_key: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cost_estimate_usd: f64,
    pub call_count: i64,
}

/// Response for GET /v1/usage/summary.
#[derive(Debug, Clone, Serialize)]
pub struct UsageSummaryResponse {
    pub results: Vec<UsageSummaryRow>,
}

/// Input for PATCH /v1/governance/policy.
#[derive(Debug, Clone, Deserialize)]
pub struct GovernancePolicyUpdate {
    #[serde(default)]
    pub company_domains: Option<Vec<String>>,
    #[serde(default)]
    pub personal_account_policy: Option<PersonalAccountPolicy>,
    #[serde(default)]
    pub raw_retention_days: Option<i32>,
}

/// Response for PATCH /v1/governance/policy.
#[derive(Debug, Clone, Serialize)]
pub struct GovernancePolicyResponse {
    pub updated_at: DateTime<Utc>,
    pub updated_by: Uuid,
    pub company_domains: Vec<String>,
    pub personal_account_policy: PersonalAccountPolicy,
    pub raw_retention_days: i32,
}

/// Query parameters for GET /v1/governance/audit-log.
#[derive(Debug, Clone, Deserialize)]
pub struct AuditLogQuery {
    #[serde(default)]
    pub date_from: Option<chrono::NaiveDate>,
    #[serde(default)]
    pub date_to: Option<chrono::NaiveDate>,
}

/// Single entry in the audit log.
#[derive(Debug, Clone, Serialize)]
pub struct AuditLogEntry {
    pub actor: Uuid,
    pub action: String,
    pub occurred_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<serde_json::Value>,
}

/// Response for GET /v1/governance/audit-log.
#[derive(Debug, Clone, Serialize)]
pub struct AuditLogResponse {
    pub entries: Vec<AuditLogEntry>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_account_company_domain() {
        let domains = vec!["mycompany.com".to_string(), "corp.mycompany.com".to_string()];

        assert_eq!(
            classify_account(Some("mycompany.com"), &domains),
            AccountClass::Company
        );
        assert_eq!(
            classify_account(Some("MYCOMPANY.COM"), &domains), // case insensitive
            AccountClass::Company
        );
        assert_eq!(
            classify_account(Some("corp.mycompany.com"), &domains),
            AccountClass::Company
        );
    }

    #[test]
    fn test_classify_account_personal_domain() {
        let domains = vec!["mycompany.com".to_string()];

        assert_eq!(
            classify_account(Some("gmail.com"), &domains),
            AccountClass::Personal
        );
        assert_eq!(
            classify_account(Some("personal.com"), &domains),
            AccountClass::Personal
        );
    }

    #[test]
    fn test_classify_account_unknown() {
        let domains = vec!["mycompany.com".to_string()];

        assert_eq!(classify_account(None, &domains), AccountClass::Unknown);
    }

    #[test]
    fn test_should_redact_flag_only_policy() {
        assert!(should_redact(AccountClass::Personal, PersonalAccountPolicy::FlagOnly));
        assert!(should_redact(AccountClass::Unknown, PersonalAccountPolicy::FlagOnly));
        assert!(!should_redact(AccountClass::Company, PersonalAccountPolicy::FlagOnly));
    }

    #[test]
    fn test_should_redact_collect_full_policy() {
        assert!(!should_redact(AccountClass::Personal, PersonalAccountPolicy::CollectFull));
        assert!(!should_redact(AccountClass::Unknown, PersonalAccountPolicy::CollectFull));
        assert!(!should_redact(AccountClass::Company, PersonalAccountPolicy::CollectFull));
    }
}
