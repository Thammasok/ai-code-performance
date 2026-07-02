# Testing Reference

## Test structure conventions

```
src/
└── domain/user.rs   ← #[cfg(test)] mod tests { … }   (unit)

tests/
├── user_repo.rs     ← real Postgres via testcontainers (integration)
├── api_users.rs     ← Axum TestClient (component/API)
└── contracts.rs     ← Pact consumer contracts
```

---

## Unit tests (3A pattern)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_total_applies_percentage_discount() {
        // Arrange
        let items = vec![
            OrderItem::new("Widget", 49_00),
            OrderItem::new("Gadget", 60_00),
        ];
        let order = Order::new(items);

        // Act
        let total = order.total_with_discount(&Discount::Percentage(10));

        // Assert
        assert_eq!(total, 97_20); // 109_00 * 0.90
    }
}
```

---

## Mockall — trait mocking

```rust
// In domain/ports.rs
#[cfg_attr(test, mockall::automock)]
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: UserId) -> Result<User, UserError>;
    async fn save(&self, user: &User)       -> Result<(), UserError>;
}

// In a unit test
#[tokio::test]
async fn get_user_propagates_not_found() {
    let mut repo = MockUserRepository::new();
    repo.expect_find_by_id()
        .once()
        .returning(|_| Err(UserError::NotFound(UserId(Uuid::new_v4()))));

    let svc = UserService::new(Arc::new(repo));
    let err = svc.get_user(UserId(Uuid::new_v4())).await.unwrap_err();
    assert!(matches!(err, AppError::NotFound(_)));
}
```

---

## Integration tests with testcontainers

```rust
// tests/user_repo.rs
use testcontainers::{clients::Cli, Container};
use testcontainers_modules::postgres::Postgres;

async fn setup_pg() -> (PgPool, Container<'static, Postgres>) {
    let docker = Cli::default();
    let pg     = docker.run(Postgres::default());
    let url    = format!(
        "postgres://postgres:postgres@127.0.0.1:{}/postgres",
        pg.get_host_port_ipv4(5432)
    );
    let pool = PgPool::connect(&url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    (pool, pg)
}

#[tokio::test]
async fn save_and_find_user_roundtrip() {
    let (pool, _pg) = setup_pg().await;
    let repo = PgUserRepo::new(pool);

    // Arrange
    let user = User::new(Email::new("alice@example.com").unwrap());

    // Act
    repo.save(&user).await.unwrap();
    let found = repo.find_by_id(user.id).await.unwrap();

    // Assert
    assert_eq!(found.email, user.email);
}
```

---

## Component (API) tests — Axum TestClient

```rust
// tests/api_users.rs
use axum_test::TestServer;

async fn build_test_server() -> TestServer {
    let repo  = Arc::new(InMemoryUserRepo::new());
    let svc   = Arc::new(UserService::new(repo));
    let state = AppState { user_svc: svc };
    let app   = build_app(state).await;
    TestServer::new(app).unwrap()
}

#[tokio::test]
async fn post_users_returns_201_with_location() {
    let server = build_test_server().await;

    let res = server
        .post("/api/v1/users")
        .json(&json!({ "email": "bob@example.com", "password": "s3cr3t!" }))
        .await;

    res.assert_status(StatusCode::CREATED);
    assert!(res.headers().get("Location").is_some());
}

#[tokio::test]
async fn post_users_returns_422_on_invalid_email() {
    let server = build_test_server().await;
    let res = server
        .post("/api/v1/users")
        .json(&json!({ "email": "not-an-email", "password": "s3cr3t!" }))
        .await;
    res.assert_status(StatusCode::UNPROCESSABLE_ENTITY);
}
```

---

## Property testing (proptest)

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn discount_never_produces_negative_total(
        price_cents in 1u64..=1_000_00,
        pct         in 0u8..=100,
    ) {
        let item  = OrderItem::new("X", price_cents);
        let total = Order::new(vec![item]).total_with_discount(&Discount::Percentage(pct));
        prop_assert!(total <= price_cents);
    }
}
```

---

## Snapshot testing (insta)

```rust
#[test]
fn user_serialization_snapshot() {
    let user = User { id: UserId(fixed_uuid()), email: Email::new("a@b.com").unwrap(), … };
    insta::assert_json_snapshot!(UserResponse::from(user));
}
// Run: cargo insta review
```

---

## CI configuration (cargo-nextest)

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    cargo install cargo-nextest --locked
    cargo nextest run --all-features
    cargo test --doc

- name: Coverage
  run: |
    cargo install cargo-llvm-cov --locked
    cargo llvm-cov --lcov --output-path lcov.info
```
