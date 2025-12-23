//! # axum-sql-viewer
//!
//! A development tool for viewing SQL tables in web browsers, easily integrable as an Axum layer.
//!
//! ## Features
//!
//! - Dynamic schema discovery for any SQL database
//! - Web-based table browser with infinite scrolling
//! - Column sorting and filtering
//! - Raw SQL query execution
//! - Support for SQLite and PostgreSQL
//!
//! ## Security Warning
//!
//! **This is a development tool only!**
//!
//! - No authentication/authorization built-in
//! - Exposes full database schema and data
//! - Raw query execution allows full database access (INSERT/UPDATE/DELETE)
//! - Should never be exposed in production or public networks
//!
//! ## Example Usage
//!
//! ```rust,no_run
//! use axum::{Router, routing::get};
//! use axum_sql_viewer::SqlViewerLayer;
//! use sqlx::SqlitePool;
//!
//! #[tokio::main]
//! async fn main() {
//!     let pool = SqlitePool::connect("sqlite::memory:")
//!         .await
//!         .unwrap();
//!
//!     let app = Router::new()
//!         .route("/", get(|| async { "Hello, World!" }))
//!         .merge(SqlViewerLayer::sqlite("/sql-viewer", pool).into_router());
//!
//!     // Serve the application...
//! }
//! ```

// Public modules
pub mod api;
pub mod database;
pub mod frontend;
pub mod layer;
pub mod schema;

// Public exports
pub use layer::SqlViewerLayer;
pub use schema::{ColumnInfo, ForeignKey, IndexInfo, TableSchema};

// Re-export database providers
pub use database::traits::DatabaseProvider;

#[cfg(feature = "sqlite")]
pub use database::sqlite::SqliteProvider;

#[cfg(feature = "postgres")]
pub use database::postgres::PostgresProvider;

// Error type
use thiserror::Error;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Invalid query: {0}")]
    InvalidQuery(String),
}

pub type Result<T> = std::result::Result<T, Error>;
