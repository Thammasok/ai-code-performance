# Database Reference

## SQLx (preferred — compile-time checked queries)

### Connection pool setup

```rust
// src/infrastructure/database.rs
use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(20)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
}
```

### Repository implementation

```rust
pub struct PgUserRepo { pool: PgPool }

#[async_trait]
impl UserRepository for PgUserRepo {
    async fn find_by_id(&self, id: UserId) -> Result<User, UserError> {
        sqlx::query_as!(UserRow,
            r#"SELECT id, email, created_at FROM users WHERE id = $1"#,
            id.0
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(UserError::from)?
        .ok_or_else(|| UserError::NotFound(id))
        .map(User::from)
    }

    async fn save(&self, user: &User) -> Result<(), UserError> {
        sqlx::query!(
            r#"INSERT INTO users (id, email, created_at)
               VALUES ($1, $2, $3)
               ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email"#,
            user.id.0, user.email.as_str(), user.created_at
        )
        .execute(&self.pool)
        .await
        .map_err(UserError::from)?;
        Ok(())
    }
}
```

### Transactions

```rust
pub async fn transfer_funds(pool: &PgPool, from: AccountId, to: AccountId, amount: Decimal)
    -> Result<(), TransferError>
{
    let mut tx = pool.begin().await?;

    sqlx::query!("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from.0)
        .execute(&mut *tx).await?;
    sqlx::query!("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to.0)
        .execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(())
}
```

### Migrations (sqlx-cli)

```bash
# Install
cargo install sqlx-cli --no-default-features --features postgres

# Create migration
sqlx migrate add create_users_table

# Run migrations at startup
sqlx::migrate!("./migrations").run(&pool).await?;
```

```sql
-- migrations/20240101000000_create_users_table.sql
CREATE TABLE users (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT        NOT NULL UNIQUE,
    password   TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

---

## MongoDB (mongodb crate)

```rust
use mongodb::{Client, Collection, bson::{doc, oid::ObjectId}};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProductDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id:          Option<ObjectId>,
    pub name:        String,
    pub price_cents: i64,
    pub tags:        Vec<String>,
}

pub struct MongoProductRepo {
    col: Collection<ProductDoc>,
}

impl MongoProductRepo {
    pub async fn find_by_tag(&self, tag: &str) -> Result<Vec<ProductDoc>, MongoError> {
        let filter = doc! { "tags": tag };
        let mut cursor = self.col.find(filter, None).await?;
        let mut docs = vec![];
        while cursor.advance().await? {
            docs.push(cursor.deserialize_current()?);
        }
        Ok(docs)
    }
}
```

---

## Redis (deadpool-redis)

```rust
// [dependencies]
// deadpool-redis = "0.15"
// redis = { version = "0.25", features = ["tokio-comp"] }

use deadpool_redis::{Config, Runtime, Pool};

pub async fn create_redis_pool(url: &str) -> Result<Pool, PoolError> {
    Config::from_url(url)
        .create_pool(Some(Runtime::Tokio1))
}

// Usage
pub async fn cache_get_or_set<T: Serialize + DeserializeOwned>(
    pool: &Pool,
    key: &str,
    ttl_secs: u64,
    fetch: impl Future<Output = Result<T, AppError>>,
) -> Result<T, AppError> {
    let mut conn = pool.get().await?;
    if let Ok(cached) = redis::cmd("GET").arg(key).query_async::<_, String>(&mut *conn).await {
        return Ok(serde_json::from_str(&cached)?);
    }
    let value = fetch.await?;
    let serialized = serde_json::to_string(&value)?;
    redis::cmd("SETEX").arg(key).arg(ttl_secs).arg(serialized)
        .query_async::<_, ()>(&mut *conn).await?;
    Ok(value)
}
```

---

## N+1 prevention patterns

```rust
// BAD — N+1: one query per order
for order in orders {
    let user = repo.find_user(order.user_id).await?; // N extra queries
}

// GOOD — batch load with IN clause
let user_ids: Vec<Uuid> = orders.iter().map(|o| o.user_id.0).collect();
let users: HashMap<Uuid, User> = sqlx::query_as!(UserRow,
    "SELECT id, email FROM users WHERE id = ANY($1)",
    &user_ids as &[Uuid]
)
.fetch_all(&pool).await?
.into_iter().map(|r| (r.id, User::from(r))).collect();
```

---

## SeaORM (ORM with migrations and entity generation)

```bash
# Generate entities from existing schema
sea-orm-cli generate entity -u postgres://… -o src/adapters/db/entities
```

```rust
use sea_orm::*;
use crate::adapters::db::entities::user;

pub async fn find_active_users(db: &DatabaseConnection) -> Result<Vec<user::Model>, DbErr> {
    user::Entity::find()
        .filter(user::Column::Active.eq(true))
        .order_by_asc(user::Column::CreatedAt)
        .all(db)
        .await
}
```
