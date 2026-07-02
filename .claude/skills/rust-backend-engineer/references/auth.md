# Auth Reference

## JWT (jsonwebtoken crate)

```rust
// [dependencies]
// jsonwebtoken = "9"
// argon2 = "0.5"

use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub:    String,        // user_id
    pub email:  String,
    pub roles:  Vec<String>,
    pub exp:    usize,         // expiry unix timestamp
    pub iat:    usize,         // issued at
}

pub fn sign_jwt(claims: &Claims, secret: &[u8]) -> Result<String, JwtError> {
    encode(&Header::default(), claims, &EncodingKey::from_secret(secret))
        .map_err(JwtError::from)
}

pub fn verify_jwt(token: &str, secret: &[u8]) -> Result<Claims, AppError> {
    decode::<Claims>(token, &DecodingKey::from_secret(secret), &Validation::default())
        .map(|d| d.claims)
        .map_err(|_| AppError::Unauthorized)
}
```

### Password hashing (Argon2)

```rust
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use rand::rngs::OsRng;

pub fn hash_password(plain: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(plain.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(AuthError::from)
}

pub fn verify_password(plain: &str, hash: &str) -> Result<(), AuthError> {
    let parsed = PasswordHash::new(hash).map_err(AuthError::from)?;
    Argon2::default()
        .verify_password(plain.as_bytes(), &parsed)
        .map_err(|_| AuthError::InvalidCredentials)
}
```

---

## RBAC (Role-Based Access Control)

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Role { Admin, Editor, Viewer }

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Permission { CreatePost, EditPost, DeletePost, ViewPost }

pub fn has_permission(role: &Role, perm: &Permission) -> bool {
    match (role, perm) {
        (Role::Admin,  _)                     => true,
        (Role::Editor, Permission::EditPost)
        | (Role::Editor, Permission::CreatePost)
        | (Role::Editor, Permission::ViewPost)  => true,
        (Role::Viewer, Permission::ViewPost)    => true,
        _                                       => false,
    }
}

// Axum guard extractor
pub struct RequirePermission<const P: &'static str>;

#[async_trait]
impl<S> FromRequestParts<S> for RequirePermission<"edit_post">
where S: Send + Sync,
{
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, AppError> {
        let AuthUser(claims) = AuthUser::from_request_parts(parts, state).await?;
        let role: Role = claims.roles[0].parse().map_err(|_| AppError::Unauthorized)?;
        if !has_permission(&role, &Permission::EditPost) {
            return Err(AppError::Forbidden);
        }
        Ok(Self)
    }
}
```

---

## OAuth2 (oauth2 crate)

```rust
use oauth2::{
    AuthorizationCode, AuthUrl, ClientId, ClientSecret, CsrfToken,
    PkceCodeChallenge, RedirectUrl, Scope, TokenUrl,
    basic::BasicClient,
};

pub fn build_oauth_client(config: &OAuthConfig) -> BasicClient {
    BasicClient::new(
        ClientId::new(config.client_id.clone()),
        Some(ClientSecret::new(config.client_secret.clone())),
        AuthUrl::new(config.auth_url.clone()).unwrap(),
        Some(TokenUrl::new(config.token_url.clone()).unwrap()),
    )
    .set_redirect_uri(RedirectUrl::new(config.redirect_url.clone()).unwrap())
}

// Handler: redirect to provider
pub async fn oauth_login(State(client): State<Arc<BasicClient>>) -> impl IntoResponse {
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();
    let (auth_url, csrf_token) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".into()))
        .add_scope(Scope::new("email".into()))
        .set_pkce_challenge(pkce_challenge)
        .url();
    // Store csrf_token + pkce_verifier in session/Redis
    Redirect::to(auth_url.as_str())
}
```

---

## Refresh token rotation

Store hashed refresh tokens in DB. On each use, rotate (invalidate old, issue new).
This prevents replay attacks if a token is leaked.

```sql
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rt_user ON refresh_tokens(user_id);
```
