# Web Frameworks Reference

## Axum (preferred for new projects)

### Handler patterns

```rust
use axum::{
    extract::{Path, Query, State, Json},
    http::StatusCode,
    response::{IntoResponse, Response},
};

// Path + query + state + JSON body
pub async fn create_user(
    State(svc): State<Arc<UserService>>,
    Json(body): Json<CreateUserDto>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()?;
    let user = svc.create(body.into()).await?;
    Ok((StatusCode::CREATED, Json(UserResponse::from(user))))
}

// Path param
pub async fn get_user(
    State(svc): State<Arc<UserService>>,
    Path(id): Path<Uuid>,
) -> Result<Json<UserResponse>, AppError> {
    let user = svc.get_by_id(UserId(id)).await?;
    Ok(Json(user.into()))
}

// Typed query params
#[derive(Deserialize)]
pub struct PaginationQuery {
    pub page:  Option<u32>,
    pub limit: Option<u32>,
}

pub async fn list_users(
    State(svc): State<Arc<UserService>>,
    Query(q): Query<PaginationQuery>,
) -> Result<Json<Vec<UserResponse>>, AppError> {
    let users = svc.list(q.page.unwrap_or(1), q.limit.unwrap_or(20)).await?;
    Ok(Json(users.into_iter().map(Into::into).collect()))
}
```

### Unified AppError → HTTP response mapping

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)] NotFound(#[from] UserError),
    #[error(transparent)] Validation(#[from] ValidationErrors),
    #[error(transparent)] Database(#[from] sqlx::Error),
    #[error("unauthorized")]  Unauthorized,
    #[error("internal error")] Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match &self {
            AppError::NotFound(_)    => (StatusCode::NOT_FOUND,            "NOT_FOUND",     self.to_string()),
            AppError::Validation(_)  => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION",    self.to_string()),
            AppError::Unauthorized   => (StatusCode::UNAUTHORIZED,         "UNAUTHORIZED",  self.to_string()),
            AppError::Database(_)
            | AppError::Internal(_)  => (StatusCode::INTERNAL_SERVER_ERROR,"INTERNAL",      "internal server error".into()),
        };
        let body = json!({ "error": { "code": code, "message": message } });
        (status, Json(body)).into_response()
    }
}
```

### AppState pattern

```rust
#[derive(Clone)]
pub struct AppState {
    pub user_svc:  Arc<UserService<PgUserRepo>>,
    pub order_svc: Arc<OrderService<PgOrderRepo>>,
    pub config:    Arc<Config>,
}
```

### Custom extractor (e.g., authenticated user)

```rust
pub struct AuthUser(pub Claims);

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, AppError> {
        let TypedHeader(Authorization(bearer)) =
            TypedHeader::<Authorization<Bearer>>::from_request_parts(parts, _state)
                .await
                .map_err(|_| AppError::Unauthorized)?;
        let claims = verify_jwt(bearer.token())?;
        Ok(AuthUser(claims))
    }
}
```

---

## Actix-web (high throughput, multi-thread per-worker model)

```rust
HttpServer::new(move || {
    App::new()
        .app_data(web::Data::new(state.clone()))
        .wrap(middleware::Logger::default())
        .service(
            web::scope("/api/v1")
                .route("/users", web::get().to(list_users))
                .route("/users", web::post().to(create_user))
        )
})
.workers(num_cpus::get())
.bind("0.0.0.0:8080")?
.run()
.await
```

---

## Tower middleware patterns

```rust
use tower::ServiceBuilder;
use tower_http::{
    trace::TraceLayer,
    cors::CorsLayer,
    limit::RequestBodyLimitLayer,
    timeout::TimeoutLayer,
};

let middleware = ServiceBuilder::new()
    .layer(TimeoutLayer::new(Duration::from_secs(30)))
    .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024)) // 2MB
    .layer(TraceLayer::new_for_http())
    .layer(CorsLayer::permissive());
```

### Rate limiting (tower-governor)

```rust
// [dependencies]
// tower_governor = "0.4"

use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

let governor_conf = GovernorConfigBuilder::default()
    .per_second(10)
    .burst_size(20)
    .finish()
    .unwrap();

let app = Router::new()
    // …routes…
    .layer(GovernorLayer { config: Arc::new(governor_conf) });
```
