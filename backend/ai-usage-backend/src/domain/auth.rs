//! JWT verification for local-agent authentication (ADR-003).
//!
//! Key security principle: `developer_id` MUST come from signature verification,
//! never from any field the client sends directly.
//!
//! The local-agent signs events with a private key (ES256) stored in OS keychain.
//! The corresponding public key is registered with the backend during provisioning.
//!
//! Verification flow:
//! 1. Decode JWT header + payload WITHOUT signature verification to get `developer_id`
//! 2. Lookup the registered public key for that `developer_id`
//! 3. Verify the full JWT signature against the retrieved public key
//! 4. Only if signature verification passes, trust the `developer_id`
//!
//! This two-step approach is necessary because we use per-developer keys,
//! so we need to know which key to verify against before we can verify.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

/// JWT claims for local-agent authentication.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentClaims {
    /// Subject: the developer_id (UUID)
    pub sub: Uuid,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Expiration (Unix timestamp)
    pub exp: i64,
    /// JWT ID (for deduplication/replay protection)
    #[serde(default)]
    pub jti: Option<String>,
}

/// Errors that can occur during authentication.
#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing Authorization header")]
    MissingAuthHeader,

    #[error("invalid Authorization header format")]
    InvalidAuthHeaderFormat,

    #[error("failed to decode JWT header: {0}")]
    InvalidJwtHeader(String),

    #[error("failed to decode JWT payload: {0}")]
    InvalidJwtPayload(String),

    #[error("developer not found: {0}")]
    DeveloperNotFound(Uuid),

    #[error("JWT signature verification failed: {0}")]
    SignatureVerificationFailed(String),

    #[error("JWT expired")]
    TokenExpired,

    #[error("invalid token: {0}")]
    InvalidToken(String),
}

/// Result of successful JWT verification.
#[derive(Debug, Clone)]
pub struct VerifiedIdentity {
    /// The developer_id, derived ONLY from successful signature verification.
    pub developer_id: Uuid,
    /// The full claims for logging/audit purposes.
    pub claims: AgentClaims,
}

/// Extract Bearer token from Authorization header.
pub fn extract_bearer_token(auth_header: &str) -> Result<&str, AuthError> {
    auth_header
        .strip_prefix("Bearer ")
        .ok_or(AuthError::InvalidAuthHeaderFormat)
}

/// Decode JWT payload WITHOUT verification to extract developer_id.
/// This is step 1 of the two-step verification process.
///
/// WARNING: The returned developer_id is NOT YET TRUSTED.
/// It must be used ONLY to lookup the public key for step 2.
pub fn decode_unverified_claims(token: &str) -> Result<AgentClaims, AuthError> {
    // JWT format: header.payload.signature
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err(AuthError::InvalidToken("JWT must have 3 parts".into()));
    }

    // Decode payload (middle part)
    let payload_bytes = URL_SAFE_NO_PAD
        .decode(parts[1])
        .map_err(|e| AuthError::InvalidJwtPayload(e.to_string()))?;

    let claims: AgentClaims = serde_json::from_slice(&payload_bytes)
        .map_err(|e| AuthError::InvalidJwtPayload(e.to_string()))?;

    Ok(claims)
}

/// Verify JWT signature against the provided public key.
/// This is step 2 of the two-step verification process.
///
/// On success, returns `VerifiedIdentity` with the trusted developer_id.
pub fn verify_jwt(token: &str, public_key_pem: &str) -> Result<VerifiedIdentity, AuthError> {
    // Verify header algorithm
    let header = decode_header(token).map_err(|e| AuthError::InvalidJwtHeader(e.to_string()))?;

    if header.alg != Algorithm::ES256 {
        return Err(AuthError::InvalidToken(format!(
            "expected ES256 algorithm, got {:?}",
            header.alg
        )));
    }

    // Build decoding key from PEM
    let key = DecodingKey::from_ec_pem(public_key_pem.as_bytes())
        .map_err(|e| AuthError::InvalidToken(format!("invalid public key: {}", e)))?;

    // Configure validation
    let mut validation = Validation::new(Algorithm::ES256);
    validation.validate_exp = true;
    validation.required_spec_claims.clear(); // We handle required claims ourselves

    // Decode and verify
    let token_data = decode::<AgentClaims>(token, &key, &validation).map_err(|e| {
        match e.kind() {
            jsonwebtoken::errors::ErrorKind::ExpiredSignature => AuthError::TokenExpired,
            jsonwebtoken::errors::ErrorKind::InvalidSignature => {
                AuthError::SignatureVerificationFailed("signature mismatch".into())
            }
            _ => AuthError::SignatureVerificationFailed(e.to_string()),
        }
    })?;

    Ok(VerifiedIdentity {
        developer_id: token_data.claims.sub,
        claims: token_data.claims,
    })
}

/// Full authentication flow: extract token, decode unverified, lookup key, verify.
///
/// The `key_lookup` function is called with the unverified developer_id to retrieve
/// the registered public key. This is typically a database lookup.
pub async fn authenticate<F, Fut>(
    auth_header: Option<&str>,
    key_lookup: F,
) -> Result<VerifiedIdentity, AuthError>
where
    F: FnOnce(Uuid) -> Fut,
    Fut: std::future::Future<Output = Result<String, AuthError>>,
{
    // Step 1: Extract bearer token
    let token = extract_bearer_token(auth_header.ok_or(AuthError::MissingAuthHeader)?)?;

    // Step 2: Decode unverified claims to get developer_id
    let unverified_claims = decode_unverified_claims(token)?;
    let developer_id = unverified_claims.sub;

    // Step 3: Lookup public key for this developer
    let public_key_pem = key_lookup(developer_id).await?;

    // Step 4: Verify signature against the retrieved key
    // Only NOW can we trust the developer_id
    verify_jwt(token, &public_key_pem)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_bearer_token() {
        assert!(extract_bearer_token("Bearer abc123").is_ok());
        assert_eq!(extract_bearer_token("Bearer abc123").unwrap(), "abc123");

        assert!(extract_bearer_token("Basic abc123").is_err());
        assert!(extract_bearer_token("abc123").is_err());
    }

    #[test]
    fn test_decode_unverified_claims() {
        // This is a valid JWT structure (header.payload.signature) with a test payload
        // The signature is invalid but we're only testing unverified decode
        let developer_id = Uuid::new_v4();
        let claims = AgentClaims {
            sub: developer_id,
            iat: 1000000000,
            exp: 2000000000,
            jti: Some("test-jti".into()),
        };

        let payload_json = serde_json::to_string(&claims).unwrap();
        let payload_b64 = URL_SAFE_NO_PAD.encode(payload_json.as_bytes());

        // Minimal header for ES256
        let header_json = r#"{"alg":"ES256","typ":"JWT"}"#;
        let header_b64 = URL_SAFE_NO_PAD.encode(header_json.as_bytes());

        // Fake signature (just for structure)
        let fake_sig = URL_SAFE_NO_PAD.encode(b"fake-signature");

        let token = format!("{}.{}.{}", header_b64, payload_b64, fake_sig);

        let decoded = decode_unverified_claims(&token).unwrap();
        assert_eq!(decoded.sub, developer_id);
        assert_eq!(decoded.jti, Some("test-jti".into()));
    }
}
