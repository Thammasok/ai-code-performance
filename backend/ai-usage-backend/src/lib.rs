//! AI Usage Backend - Telemetry collection server.
//!
//! This is a modular monolith (ADR-001) handling ingestion, identity resolution,
//! governance policy enforcement, and storage for AI usage telemetry.
//!
//! Architecture: Hexagonal (ports & adapters)
//! - domain/: Pure business logic, no I/O, no framework deps
//! - adapters/: HTTP handlers, DB repositories
//! - infrastructure/: Config, DI wiring, startup

pub mod adapters;
pub mod domain;
pub mod infrastructure;

pub use infrastructure::{build_app, AppState};
