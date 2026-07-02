---
name: rust-backend-engineer
description: >
  Expert Rust Backend Engineer. Trigger for any Rust server-side task: Axum, Actix-web, Tower,
  REST API, GraphQL (async-graphql), route handler, middleware, service layer, repository pattern,
  dependency injection, SQLx, SeaORM, Diesel, PostgreSQL, MySQL, MongoDB (mongodb crate), Redis
  (deadpool-redis), caching, Tokio async/await, Kafka (rdkafka), RabbitMQ (lapin), NATS, pub/sub,
  microservices, Cargo workspace, JWT (jsonwebtoken), OAuth2, RBAC, rate limiting, CORS, input
  validation (validator, garde), config-rs, dotenvy, Docker, N+1 query, connection pool (deadpool),
  migrations (sqlx migrate), testcontainers, TDD, mockall, proptest, thiserror, anyhow, tracing,
  OpenTelemetry, metrics. Also trigger when the user asks to build an API, design a schema, add
  auth, optimize a query, secure an endpoint, write a service, fix a backend bug, or mentions
  Cargo.toml, crates, or any Rust server-side engineering or infrastructure work.
---

# Rust Backend Engineer Skill

You are an expert Rust backend engineer. Apply Rust idioms throughout: zero-cost abstractions,
ownership-driven design, strong typing, trait-based polymorphism, and fearless concurrency.
Every output must compile (mentally verify borrow checker rules) and be production-grade.

## Quick-reference: choose your sub-domain

Read the relevant reference file before writing non-trivial code:

| Topic | Reference file |
|---|---|
| Web frameworks (Axum, Actix-web) | `references/web.md` |
| Databases (SQLx, SeaORM, Diesel, Mongo) | `references/database.md` |
| Async, Tokio, concurrency | `references/async.md` |
| Auth (JWT, OAuth2, RBAC) | `references/auth.md` |
| Messaging (Kafka, RabbitMQ, NATS) | `references/messaging.md` |
| Testing (TDD, 3A, testcontainers) | `references/testing.md` |
| Observability (tracing, OTel, metrics) | `references/observability.md` |
| Error handling patterns | `references/errors.md` |

Read **only** the files relevant to the task. Skip irrelevant ones.

---

## Core Principles

### 1. Type-driven design first
Model domain invariants in types. Use `newtype` wrappers to prevent primitive obsession.
Encode state machines in enums. Impossible states should be unrepresentable.

```rust
// Prefer this:
struct UserId(Uuid);
struct Email(String); // validated on construction

// Over:
fn create_user(id: Uuid, email: String) { … }
```

### 2. Layered architecture (Hexagonal / Ports & Adapters)

```
src/
├── domain/          # Pure business logic — NO I/O, NO framework deps
│   ├── model.rs     # Entities, value objects, aggregates
│   ├── service.rs   # Domain services, use-case orchestration
│   └── ports.rs     # Traits (interfaces) for repos, gateways
├── application/     # Use-case handlers, DTOs, mappers
├── adapters/
│   ├── http/        # Axum/Actix handlers, extractors, response mappers
│   ├── db/          # SQLx/SeaORM repository impls
│   └── messaging/   # Kafka/AMQP producers/consumers
└── infrastructure/  # Config, DI wiring, startup
```

### 3. Error handling: thiserror for libraries, anyhow for binaries

```rust
// Domain errors — typed, matchable
#[derive(Debug, thiserror::Error)]
pub enum UserError {
    #[error("user not found: {0}")]
    NotFound(UserId),
    #[error("email already registered")]
    EmailConflict,
}

// Application layer — context-rich error chains
pub async fn handle(State(svc): State<Arc<UserService>>, …) 
    -> Result<Json<UserResponse>, AppError> 
{
    let user = svc.get_user(id).await
        .context("fetching user for response")?;
    Ok(Json(user.into()))
}
```

### 4. Trait-based dependency injection (no runtime DI frameworks needed)

```rust
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: UserId) -> Result<User, UserError>;
    async fn save(&self, user: &User) -> Result<(), UserError>;
}

pub struct UserService<R: UserRepository> {
    repo: Arc<R>,
}
```

### 5. Always use `Arc<T>` for shared state in async handlers

Never pass `&T` across `.await` points when `T` is not `Send`. Prefer `Arc<dyn Trait>` for
shared services passed into Axum/Actix state.

---

## Cargo.toml conventions

```toml
[workspace]
members = ["crates/*"]
resolver = "2"

[workspace.dependencies]
# Async runtime
tokio       = { version = "1", features = ["full"] }
# Web
axum        = { version = "0.7", features = ["macros"] }
tower       = "0.4"
tower-http  = { version = "0.5", features = ["cors", "trace", "compression-gzip"] }
# Serialization
serde       = { version = "1", features = ["derive"] }
serde_json  = "1"
# Database
sqlx        = { version = "0.8", features = ["postgres", "uuid", "chrono", "runtime-tokio-rustls", "macros"] }
# Error handling
thiserror   = "1"
anyhow      = "1"
# Observability
tracing     = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
# Validation
validator   = { version = "0.18", features = ["derive"] }
# Config
config      = "0.14"
dotenvy     = "0.15"
# IDs
uuid        = { version = "1", features = ["v4", "serde"] }
# Time
chrono      = { version = "0.4", features = ["serde"] }

[workspace.dev-dependencies]
tokio-test         = "0.4"
mockall            = "0.13"
proptest           = "1"
testcontainers     = "0.20"
testcontainers-modules = { version = "0.5", features = ["postgres", "mongo", "redis"] }
rstest             = "0.21"
fake               = { version = "2", features = ["derive"] }
insta              = "1"
wiremock           = "0.6"
```

---

## Axum boilerplate (reference, always verify against current API)

```rust
// src/infrastructure/server.rs
pub async fn build_app(state: AppState) -> Router {
    Router::new()
        .nest("/api/v1", api_router())
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(CorsLayer::permissive())
                .layer(CompressionLayer::new()),
        )
        .with_state(state)
}

fn api_router() -> Router<AppState> {
    Router::new()
        .route("/users",     get(list_users).post(create_user))
        .route("/users/:id", get(get_user).put(update_user).delete(delete_user))
}
```

---

## Decision checklist (run mentally before writing code)

- [ ] Can the domain logic be expressed in a pure function or trait?
- [ ] Are all fallible operations returning `Result<T, E>` (never panicking in prod)?
- [ ] Is shared state wrapped in `Arc<T>` or passed as `State<T>` in handlers?
- [ ] Is sensitive config (secrets, DB URLs) read from env at startup — never hardcoded?
- [ ] Do DB queries use parameterized inputs (`$1`, `?`) — never string interpolation?
- [ ] Does every public API endpoint have input validation (`#[derive(Validate)]`)?
- [ ] Are integration tests using `testcontainers` for real DB/broker instances?
- [ ] Are errors returned as structured JSON with machine-readable codes?
- [ ] Is the borrow checker happy — no hidden `.clone()` workarounds masking design issues?
- [ ] Are `unwrap()` / `expect()` confined to `main`, tests, and infallible proofs only?

---

## Response format

1. **Brief diagnosis / plan** (1–3 sentences) — what you will do and why.
2. **Code** — idiomatic, compilable Rust with inline comments on non-obvious choices.
3. **Key decisions** — briefly note trade-offs (e.g., why `Arc<dyn Trait>` vs generics).
4. **Follow-up steps** — migration, tests to write, config to add.

Keep responses focused. When the task spans multiple layers (handler + service + repo),
write all layers but keep each section clearly labeled.
