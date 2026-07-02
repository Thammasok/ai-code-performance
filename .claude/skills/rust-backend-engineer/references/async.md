# Async & Concurrency Reference

## Tokio runtime setup

```rust
// src/main.rs
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let config = Config::from_env()?;
    let pool   = create_pool(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let state = AppState::new(pool, &config);
    let app   = build_app(state).await;

    let listener = TcpListener::bind(&config.listen_addr).await?;
    tracing::info!("listening on {}", config.listen_addr);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    tracing::info!("shutdown signal received");
}
```

---

## Spawn blocking for CPU-bound work

```rust
// Never block the async executor — offload to rayon or spawn_blocking
pub async fn hash_password_async(plain: String) -> Result<String, AuthError> {
    tokio::task::spawn_blocking(move || hash_password(&plain))
        .await
        .map_err(|e| AuthError::Internal(e.into()))?
}
```

---

## Concurrent futures

```rust
use tokio::try_join;

// Run independent DB queries concurrently
let (user, orders) = try_join!(
    user_repo.find_by_id(user_id),
    order_repo.list_by_user(user_id),
)?;

// Fan-out with bounded concurrency (avoid overwhelming DB)
use futures::stream::{self, StreamExt};

let results: Vec<_> = stream::iter(ids)
    .map(|id| repo.find_by_id(id))
    .buffer_unordered(10)   // max 10 concurrent
    .collect()
    .await;
```

---

## Shared mutable state patterns

```rust
// Prefer: immutable shared state via Arc
let state = Arc::new(AppConfig::from_env());

// When mutation needed: RwLock for read-heavy
let cache: Arc<RwLock<HashMap<String, Value>>> = Arc::new(RwLock::new(HashMap::new()));

// For counters/flags: atomics (no locking)
use std::sync::atomic::{AtomicU64, Ordering};
let request_count = Arc::new(AtomicU64::new(0));
request_count.fetch_add(1, Ordering::Relaxed);

// Never: Mutex<T> across .await points (deadlock risk)
// let guard = mutex.lock().await;
// some_async_call().await;  // guard held across await — BAD
```

---

## Background tasks / job scheduling

```rust
// Simple periodic background task
pub fn spawn_cleanup_task(pool: PgPool) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(e) = cleanup_expired_sessions(&pool).await {
                tracing::error!(error = %e, "session cleanup failed");
            }
        }
    })
}
```

### Job queues with Redis (using custom impl or apalis)

```toml
# [dependencies]
# apalis = { version = "0.6", features = ["redis"] }
```

```rust
use apalis::prelude::*;
use apalis_redis::RedisStorage;

#[derive(Serialize, Deserialize)]
struct SendEmailJob { to: String, subject: String, body: String }

async fn send_email(job: SendEmailJob, ctx: JobContext) -> Result<(), JobError> {
    mailer.send(&job.to, &job.subject, &job.body).await?;
    Ok(())
}

// Worker
WorkerBuilder::new("email-worker")
    .data(mailer.clone())
    .backend(RedisStorage::connect(redis_url).await?)
    .build_fn(send_email)
    .run()
    .await?;
```
