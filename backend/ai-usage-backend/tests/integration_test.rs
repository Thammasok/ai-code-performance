//! Integration tests for POST /v1/events endpoint.
//!
//! Test coverage per CLAUDE.md task list:
//! - Signature ถูกต้อง + developer registered → 200, event persisted
//! - Signature ผิด/หมดอายุ → 401
//! - developer_id in body is ignored; derived from JWT only
//! - account_class = personal + flag_only policy → tokens/cost/project = 0/null in DB
//!
//! Note: Tests run their own schema setup since we use Liquibase for production migrations.

use std::sync::Arc;

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::Utc;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde_json::json;
use sqlx::PgPool;
use testcontainers::{runners::AsyncRunner, ContainerAsync};
use testcontainers_modules::postgres::Postgres;
use tower::ServiceExt;
use uuid::Uuid;

use ai_usage_backend::domain::auth::AgentClaims;
use ai_usage_backend::domain::model::PersonalAccountPolicy;
use ai_usage_backend::{build_app, AppState};

/// SQL schema for test setup (mirrors Liquibase changelogs)
const SCHEMA_SQL: &str = r#"
-- developers table
CREATE TABLE IF NOT EXISTS developers (
    developer_id UUID PRIMARY KEY,
    email VARCHAR(255),
    display_name VARCHAR(255),
    public_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- governance_config table
CREATE TABLE IF NOT EXISTS governance_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    company_domains TEXT[] NOT NULL DEFAULT '{}',
    personal_account_policy VARCHAR(20) NOT NULL DEFAULT 'flag_only',
    raw_retention_days INTEGER NOT NULL DEFAULT 90,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO governance_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- usage_events table
CREATE TABLE IF NOT EXISTS usage_events (
    event_id UUID PRIMARY KEY,
    developer_id UUID NOT NULL REFERENCES developers(developer_id),
    tool VARCHAR(50) NOT NULL,
    tool_version VARCHAR(50),
    model VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    tokens_input BIGINT NOT NULL DEFAULT 0,
    tokens_output BIGINT NOT NULL DEFAULT 0,
    tokens_cached BIGINT NOT NULL DEFAULT 0,
    cost_estimate_usd DOUBLE PRECISION,
    session_id UUID NOT NULL,
    project VARCHAR(255),
    machine_id VARCHAR(255),
    timestamp TIMESTAMPTZ NOT NULL,
    latency_ms INTEGER,
    status VARCHAR(20) NOT NULL,
    account_email_domain VARCHAR(255),
    account_class VARCHAR(20) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- governance_audit_log table
CREATE TABLE IF NOT EXISTS governance_audit_log (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    before_state JSONB,
    after_state JSONB
);
"#;

/// Test fixture holding container and connection pool.
struct TestFixture {
    _container: ContainerAsync<Postgres>,
    pool: PgPool,
}

impl TestFixture {
    async fn new() -> Self {
        let container = Postgres::default().start().await.expect("Failed to start Postgres container");

        let port = container.get_host_port_ipv4(5432).await.expect("Failed to get port");
        let database_url = format!(
            "postgres://postgres:postgres@127.0.0.1:{}/postgres",
            port
        );

        let pool = PgPool::connect(&database_url)
            .await
            .expect("Failed to connect to test database");

        // Run schema setup (mirrors Liquibase changelogs)
        sqlx::raw_sql(SCHEMA_SQL)
            .execute(&pool)
            .await
            .expect("Failed to setup test schema");

        Self {
            _container: container,
            pool,
        }
    }
}

/// Generate ES256 key pair for testing.
fn generate_test_keypair() -> (String, String) {
    use ring::signature::{EcdsaKeyPair, KeyPair, ECDSA_P256_SHA256_FIXED_SIGNING};
    use ring::rand::SystemRandom;

    let rng = SystemRandom::new();
    let pkcs8_bytes = EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &rng)
        .expect("Failed to generate key pair");

    let key_pair = EcdsaKeyPair::from_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, pkcs8_bytes.as_ref(), &rng)
        .expect("Failed to parse key pair");

    // Convert to PEM format for storage
    let private_key_pem = format!(
        "-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----",
        base64::engine::general_purpose::STANDARD.encode(pkcs8_bytes.as_ref())
    );

    // Get public key bytes and convert to PEM
    let public_key_bytes = key_pair.public_key().as_ref();

    // For EC keys, we need to wrap in SubjectPublicKeyInfo structure
    // This is a simplified version; in production use a proper ASN.1 library
    let spki_prefix: [u8; 26] = [
        0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
    ];
    let mut spki = Vec::with_capacity(spki_prefix.len() + public_key_bytes.len());
    spki.extend_from_slice(&spki_prefix);
    spki.extend_from_slice(public_key_bytes);

    let public_key_pem = format!(
        "-----BEGIN PUBLIC KEY-----\n{}\n-----END PUBLIC KEY-----",
        base64::engine::general_purpose::STANDARD.encode(&spki)
    );

    (private_key_pem, public_key_pem)
}

/// Create a signed JWT for testing.
fn create_test_jwt(developer_id: Uuid, private_key_pem: &str, expired: bool) -> String {
    let now = Utc::now().timestamp();
    let exp = if expired { now - 3600 } else { now + 3600 };

    let claims = AgentClaims {
        sub: developer_id,
        iat: now,
        exp,
        jti: Some(Uuid::new_v4().to_string()),
    };

    let key = EncodingKey::from_ec_pem(private_key_pem.as_bytes())
        .expect("Failed to create encoding key");

    let header = Header::new(Algorithm::ES256);

    encode(&header, &claims, &key).expect("Failed to encode JWT")
}

/// Register a developer in the test database.
async fn register_developer(pool: &PgPool, developer_id: Uuid, public_key_pem: &str) {
    sqlx::query!(
        r#"
        INSERT INTO developers (developer_id, email, display_name, public_key)
        VALUES ($1, $2, $3, $4)
        "#,
        developer_id,
        "test@example.com",
        "Test Developer",
        public_key_pem,
    )
    .execute(pool)
    .await
    .expect("Failed to register developer");
}

/// Set governance config for testing.
async fn set_governance_config(
    pool: &PgPool,
    company_domains: &[&str],
    policy: &str,
) {
    let domains: Vec<String> = company_domains.iter().map(|s| s.to_string()).collect();

    sqlx::query!(
        r#"
        UPDATE governance_config
        SET company_domains = $1, personal_account_policy = $2
        WHERE id = 1
        "#,
        &domains,
        policy,
    )
    .execute(pool)
    .await
    .expect("Failed to update governance config");
}

#[tokio::test]
async fn test_valid_signature_registered_developer_returns_200() {
    let fixture = TestFixture::new().await;
    let developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();

    // Register developer
    register_developer(&fixture.pool, developer_id, &public_key).await;

    // Build app
    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    // Create valid JWT
    let token = create_test_jwt(developer_id, &private_key, false);

    // Create request
    let event_id = Uuid::new_v4();
    let body = json!({
        "event_id": event_id,
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify event was persisted
    let row = sqlx::query!(
        r#"SELECT developer_id, tokens_input FROM usage_events WHERE event_id = $1"#,
        event_id
    )
    .fetch_one(&fixture.pool)
    .await
    .expect("Event not found in database");

    assert_eq!(row.developer_id, developer_id);
    assert_eq!(row.tokens_input, 1000);
}

#[tokio::test]
async fn test_invalid_signature_returns_401() {
    let fixture = TestFixture::new().await;
    let developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();
    let (wrong_private_key, _) = generate_test_keypair(); // Different key pair

    // Register developer with correct public key
    register_developer(&fixture.pool, developer_id, &public_key).await;

    // Build app
    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    // Create JWT with WRONG private key
    let token = create_test_jwt(developer_id, &wrong_private_key, false);

    let body = json!({
        "event_id": Uuid::new_v4(),
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_expired_token_returns_401() {
    let fixture = TestFixture::new().await;
    let developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();

    register_developer(&fixture.pool, developer_id, &public_key).await;

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    // Create EXPIRED JWT
    let token = create_test_jwt(developer_id, &private_key, true);

    let body = json!({
        "event_id": Uuid::new_v4(),
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_developer_id_in_body_is_ignored() {
    let fixture = TestFixture::new().await;
    let real_developer_id = Uuid::new_v4();
    let fake_developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();

    register_developer(&fixture.pool, real_developer_id, &public_key).await;

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    let token = create_test_jwt(real_developer_id, &private_key, false);

    // Include a fake developer_id in body - should be IGNORED
    let event_id = Uuid::new_v4();
    let body = json!({
        "event_id": event_id,
        "developer_id": fake_developer_id, // THIS SHOULD BE IGNORED
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Verify the REAL developer_id (from JWT) was used, not the fake one
    let row = sqlx::query!(
        r#"SELECT developer_id FROM usage_events WHERE event_id = $1"#,
        event_id
    )
    .fetch_one(&fixture.pool)
    .await
    .expect("Event not found");

    assert_eq!(row.developer_id, real_developer_id);
    assert_ne!(row.developer_id, fake_developer_id);
}

#[tokio::test]
async fn test_personal_account_flag_only_redacts_sensitive_fields() {
    let fixture = TestFixture::new().await;
    let developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();

    register_developer(&fixture.pool, developer_id, &public_key).await;

    // Set governance: company domain = mycompany.com, policy = flag_only
    set_governance_config(&fixture.pool, &["mycompany.com"], "flag_only").await;

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    let token = create_test_jwt(developer_id, &private_key, false);

    let event_id = Uuid::new_v4();
    let body = json!({
        "event_id": event_id,
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "cost_estimate_usd": 0.05,
        "project": "secret-project",
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success",
        "account_email_domain": "gmail.com" // Personal domain, NOT mycompany.com
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Verify sensitive fields were redacted (zeroed/nulled) in DB
    let row = sqlx::query!(
        r#"
        SELECT tokens_input, tokens_output, cost_estimate_usd, project, account_class
        FROM usage_events WHERE event_id = $1
        "#,
        event_id
    )
    .fetch_one(&fixture.pool)
    .await
    .expect("Event not found");

    // ADR-004: tokens/cost/project should be 0/null for personal account with flag_only policy
    assert_eq!(row.tokens_input, 0);
    assert_eq!(row.tokens_output, 0);
    assert!(row.cost_estimate_usd.is_none());
    assert!(row.project.is_none());
    assert_eq!(row.account_class, "personal");
}

#[tokio::test]
async fn test_company_account_not_redacted() {
    let fixture = TestFixture::new().await;
    let developer_id = Uuid::new_v4();
    let (private_key, public_key) = generate_test_keypair();

    register_developer(&fixture.pool, developer_id, &public_key).await;

    // Set governance: company domain = mycompany.com, policy = flag_only
    set_governance_config(&fixture.pool, &["mycompany.com"], "flag_only").await;

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    let token = create_test_jwt(developer_id, &private_key, false);

    let event_id = Uuid::new_v4();
    let body = json!({
        "event_id": event_id,
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "cost_estimate_usd": 0.05,
        "project": "company-project",
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success",
        "account_email_domain": "mycompany.com" // Company domain
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // Verify sensitive fields were NOT redacted for company account
    let row = sqlx::query!(
        r#"
        SELECT tokens_input, tokens_output, cost_estimate_usd, project, account_class
        FROM usage_events WHERE event_id = $1
        "#,
        event_id
    )
    .fetch_one(&fixture.pool)
    .await
    .expect("Event not found");

    assert_eq!(row.tokens_input, 1000);
    assert_eq!(row.tokens_output, 500);
    assert_eq!(row.cost_estimate_usd, Some(0.05));
    assert_eq!(row.project, Some("company-project".to_string()));
    assert_eq!(row.account_class, "company");
}

#[tokio::test]
async fn test_unregistered_developer_returns_401() {
    let fixture = TestFixture::new().await;
    let unregistered_developer_id = Uuid::new_v4();
    let (private_key, _public_key) = generate_test_keypair();

    // DO NOT register this developer

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    let token = create_test_jwt(unregistered_developer_id, &private_key, false);

    let body = json!({
        "event_id": Uuid::new_v4(),
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {}", token))
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn test_missing_auth_header_returns_401() {
    let fixture = TestFixture::new().await;

    let state = AppState::from_pool(fixture.pool.clone());
    let app = build_app(state);

    let body = json!({
        "event_id": Uuid::new_v4(),
        "tool": "claude_code",
        "model": "claude-sonnet-5",
        "provider": "anthropic",
        "tokens_input": 1000,
        "tokens_output": 500,
        "session_id": Uuid::new_v4(),
        "timestamp": Utc::now(),
        "status": "success"
    });

    // NO Authorization header
    let request = Request::builder()
        .method("POST")
        .uri("/v1/events")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(serde_json::to_string(&body).unwrap()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}
