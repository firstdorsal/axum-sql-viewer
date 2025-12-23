//! REST API endpoints
//!
//! This module contains all API endpoint handlers for the SQL viewer.

use axum::Router;
use std::sync::Arc;

use crate::database::traits::DatabaseProvider;

pub mod query;
pub mod rows;
pub mod tables;

// Re-export handlers for convenience
pub use query::execute_query_handler;
pub use rows::{count_rows_handler, get_rows_handler};
pub use tables::{get_table_schema_handler, list_tables_handler};

/// Create the API router with all endpoints
///
/// This function creates a router with all API endpoints configured and state attached.
///
/// # Arguments
///
/// * `database` - Arc-wrapped database provider implementation
///
/// # Returns
///
/// An Axum Router configured with all API routes
pub fn create_api_router<DB: DatabaseProvider>(database: Arc<DB>) -> Router {
    Router::new()
        .route("/tables", axum::routing::get(tables::list_tables_handler::<DB>))
        .route("/tables/:name", axum::routing::get(tables::get_table_schema_handler::<DB>))
        .route("/tables/:name/rows", axum::routing::get(rows::get_rows_handler::<DB>))
        .route("/tables/:name/count", axum::routing::get(rows::count_rows_handler::<DB>))
        .route("/query", axum::routing::post(query::execute_query_handler::<DB>))
        .with_state(database)
}
