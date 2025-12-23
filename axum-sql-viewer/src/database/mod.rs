//! Database abstraction layer
//!
//! This module provides a database-agnostic interface for schema discovery
//! and data retrieval.

pub mod traits;

#[cfg(feature = "sqlite")]
pub mod sqlite;

#[cfg(feature = "postgres")]
pub mod postgres;

// Re-export the main trait
pub use traits::DatabaseProvider;
