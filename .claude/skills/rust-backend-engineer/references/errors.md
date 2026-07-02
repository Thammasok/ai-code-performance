# Error Handling Reference

## Layer-appropriate error types

```
Domain errors     →  thiserror  (typed, matchable, no I/O details)
Application/infra →  anyhow     (context-rich chains for logging)
HTTP boundary     →  AppError   (maps all errors to status + JSON)
```

---

## Domain errors (thiserror)

```rust
#[derive(Debug, thiserror::Error, PartialEq)]
pub enum UserError {
    #[error("user not found: {0:?}")]
    NotFound(UserId),

    #[error("email already registered: {0}")]
    EmailConflict(String),

    #[error("invalid email format")]
    InvalidEmail,

    #[error("database error")]
    Database(#[from] sqlx::Error),
}
```

---

## AppError (HTTP boundary)

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)] User(#[from] UserError),
    #[error(transparent)] Auth(#[from] AuthError),
    #[error(transparent)] Validation(#[from] validator::ValidationErrors),
    #[error("forbidden")]     Forbidden,
    #[error("unauthorized")]  Unauthorized,
    #[error("not found")]     NotFound,
    #[error("conflict: {0}")] Conflict(String),
    #[error(transparent)]     Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::User(UserError::NotFound(_))   => (StatusCode::NOT_FOUND, "USER_NOT_FOUND"),
            AppError::User(UserError::EmailConflict(_)) => (StatusCode::CONFLICT, "EMAIL_CONFLICT"),
            AppError::Validation(_)                  => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR"),
            AppError::Unauthorized                   => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
            AppError::Forbidden                      => (StatusCode::FORBIDDEN, "FORBIDDEN"),
            AppError::NotFound                       => (StatusCode::NOT_FOUND, "NOT_FOUND"),
            AppError::Conflict(_)                    => (StatusCode::CONFLICT, "CONFLICT"),
            _                                        => {
                tracing::error!(error = %self, "unhandled internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
            }
        };
        let body = serde_json::json!({
            "error": { "code": code, "message": self.to_string() }
        });
        (status, Json(body)).into_response()
    }
}
```

---

## anyhow for rich context chains

```rust
use anyhow::Context;

pub async fn process_payment(order_id: OrderId) -> anyhow::Result<Receipt> {
    let order = repo.find(order_id).await
        .with_context(|| format!("fetching order {order_id:?}"))?;
    let receipt = payment_gateway.charge(&order).await
        .context("charging payment gateway")?;
    Ok(receipt)
}
```

---

## Never panic in production paths

```rust
// BAD
let val = map.get("key").unwrap();

// GOOD
let val = map.get("key").ok_or_else(|| anyhow!("missing required key 'key'"))?;

// Allowed: infallible proofs (document why)
let url = Url::parse("https://api.example.com").expect("hardcoded URL is always valid");
```

---

## Validation at the boundary

```rust
use validator::Validate;

#[derive(Debug, Deserialize, Validate)]
pub struct CreateUserDto {
    #[validate(email)]
    pub email: String,

    #[validate(length(min = 8, max = 72))]
    pub password: String,

    #[validate(length(min = 1, max = 100))]
    pub name: String,
}

// In handler — validate before touching domain
pub async fn create_user(Json(body): Json<CreateUserDto>, …) -> Result<…, AppError> {
    body.validate()?;  // ValidationErrors → AppError::Validation → 422
    // …
}
```
