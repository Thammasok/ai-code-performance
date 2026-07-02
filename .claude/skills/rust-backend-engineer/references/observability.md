# Observability Reference

## tracing setup (structured JSON logs)

```rust
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_tracing() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "info,tower_http=debug".into()))
        .with(tracing_subscriber::fmt::layer().json())
        .init();
}
```

## Instrument async functions

```rust
use tracing::{instrument, info, warn, error, Span};

#[instrument(skip(self, password), fields(user.email = %email))]
pub async fn login(&self, email: &str, password: &str) -> Result<Token, AuthError> {
    info!("login attempt");
    let user = self.repo.find_by_email(email).await
        .map_err(|e| { warn!(error = %e, "user lookup failed"); e })?;
    // …
    info!(user.id = %user.id, "login successful");
    Ok(token)
}
```

---

## OpenTelemetry (OTLP export)

```toml
[dependencies]
opentelemetry        = "0.23"
opentelemetry-otlp   = { version = "0.16", features = ["grpc-tonic"] }
opentelemetry_sdk    = { version = "0.23", features = ["rt-tokio"] }
tracing-opentelemetry = "0.24"
```

```rust
use opentelemetry_otlp::WithExportConfig;

pub fn init_telemetry(service_name: &str, otlp_endpoint: &str) -> anyhow::Result<()> {
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint(otlp_endpoint),
        )
        .with_trace_config(
            opentelemetry_sdk::trace::config()
                .with_resource(Resource::new(vec![
                    KeyValue::new("service.name", service_name.to_owned()),
                ]))
        )
        .install_batch(opentelemetry_sdk::runtime::Tokio)?;

    tracing_subscriber::registry()
        .with(EnvFilter::from_default_env())
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    Ok(())
}
```

---

## Prometheus metrics

```toml
[dependencies]
metrics             = "0.23"
metrics-exporter-prometheus = "0.15"
```

```rust
use metrics::{counter, histogram, gauge};

// Instrument a handler
pub async fn create_order(…) -> Result<…> {
    let start = std::time::Instant::now();
    counter!("orders.create.attempts").increment(1);

    let result = svc.create(…).await;

    histogram!("orders.create.duration_ms")
        .record(start.elapsed().as_millis() as f64);

    match &result {
        Ok(_)  => counter!("orders.create.success").increment(1),
        Err(_) => counter!("orders.create.errors").increment(1),
    }
    result
}

// Expose /metrics endpoint
pub fn metrics_router() -> Router {
    let recorder_handle = PrometheusBuilder::new().install_recorder().unwrap();
    Router::new().route("/metrics", get(move || async move { recorder_handle.render() }))
}
```

---

## Health check endpoint

```rust
#[derive(Serialize)]
struct HealthResponse { status: &'static str, version: &'static str }

pub async fn health(State(pool): State<PgPool>) -> impl IntoResponse {
    match sqlx::query("SELECT 1").fetch_one(&pool).await {
        Ok(_)  => Json(HealthResponse { status: "ok",      version: env!("CARGO_PKG_VERSION") }),
        Err(_) => (StatusCode::SERVICE_UNAVAILABLE,
                   Json(HealthResponse { status: "degraded", version: env!("CARGO_PKG_VERSION") })).into_response(),
    }
}
```
