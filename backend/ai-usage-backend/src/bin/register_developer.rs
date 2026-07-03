//! CLI tool to register a developer's public key.
//!
//! Usage:
//!   register_developer <developer_id> <public_key_pem_file>
//!
//! This is a development/testing helper. In production, developer registration
//! should happen through the SSO device-code flow (see ADR-003).

use std::env;
use std::fs;

use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let args: Vec<String> = env::args().collect();

    if args.len() != 3 {
        eprintln!("Usage: {} <developer_id> <public_key_pem_file>", args[0]);
        eprintln!();
        eprintln!("Example:");
        eprintln!("  {} 550e8400-e29b-41d4-a716-446655440000 ./public_key.pem", args[0]);
        std::process::exit(1);
    }

    let developer_id: Uuid = args[1]
        .parse()
        .map_err(|_| anyhow::anyhow!("Invalid UUID: {}", args[1]))?;

    let public_key_path = &args[2];
    let public_key_pem = fs::read_to_string(public_key_path)
        .map_err(|e| anyhow::anyhow!("Failed to read public key file: {}", e))?;

    // Validate it looks like a PEM
    if !public_key_pem.contains("-----BEGIN PUBLIC KEY-----") {
        anyhow::bail!("File does not appear to be a PEM-encoded public key");
    }

    let database_url = env::var("DATABASE_URL")
        .map_err(|_| anyhow::anyhow!("DATABASE_URL environment variable must be set"))?;

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await?;

    // Upsert developer
    sqlx::query!(
        r#"
        INSERT INTO developers (developer_id, public_key)
        VALUES ($1, $2)
        ON CONFLICT (developer_id) DO UPDATE
        SET public_key = EXCLUDED.public_key, updated_at = NOW()
        "#,
        developer_id,
        public_key_pem,
    )
    .execute(&pool)
    .await?;

    println!("Successfully registered developer: {}", developer_id);

    Ok(())
}
