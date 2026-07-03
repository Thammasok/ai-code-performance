# AI Usage Backend

Rust/Axum backend for the AI Usage Telemetry system.

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Rust 1.80+ (for local development)

### Running with Docker Compose

```bash
# Start PostgreSQL
docker compose up -d postgres

# Run database migrations with Liquibase
docker compose --profile migrate up liquibase

# Start the backend (optional - for containerized deployment)
docker compose --profile app up -d backend
```

### Local Development

```bash
# Start PostgreSQL only
docker compose up -d postgres

# Run migrations
docker compose --profile migrate up liquibase

# Copy environment file
cp .env.example .env

# Run the backend locally
cargo run
```

### Running Tests

Tests use testcontainers, so Docker must be running.

```bash
cargo test
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/v1/events` | Submit usage event (requires JWT) |

## Database Migrations

Migrations are managed with Liquibase. Changelog files are in `liquibase/changelogs/`.

```bash
# Run migrations
docker compose --profile migrate up liquibase

# Check migration status (requires Liquibase CLI)
cd liquibase
liquibase --defaults-file=liquibase.properties status
```

## Architecture

See `docs/overview/architecture.md` for full system documentation.

Key design decisions:
- **ADR-001**: Modular monolith architecture
- **ADR-002**: Single Postgres with partitioning
- **ADR-003**: JWT auth with local-agent keys
- **ADR-004**: Personal account classification & redaction
- **ADR-005**: RBAC with Postgres RLS
