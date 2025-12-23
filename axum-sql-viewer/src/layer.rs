//! SqlViewerLayer - Main Axum integration layer
//!
//! This module provides the main entry point for integrating axum-sql-viewer
//! into an Axum application.

use crate::database::traits::DatabaseProvider;
use axum::{routing::get, routing::post, Router};
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[cfg(feature = "sqlite")]
use crate::database::sqlite::SqliteProvider;

#[cfg(feature = "postgres")]
use crate::database::postgres::PostgresProvider;

use crate::api::{
    count_rows_handler, execute_query_handler, get_rows_handler, get_table_schema_handler,
    list_tables_handler,
};
use crate::frontend::create_frontend_router;

/// Main layer for integrating SQL viewer into an Axum application
///
/// # Example
///
/// ```rust,no_run
/// use axum::Router;
/// use axum_sql_viewer::SqlViewerLayer;
/// use sqlx::SqlitePool;
///
/// # async fn example() {
/// let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
/// let viewer = SqlViewerLayer::sqlite("/sql-viewer", pool);
/// let app = Router::new().merge(viewer.into_router());
/// # }
/// ```
pub struct SqlViewerLayer<DB: DatabaseProvider> {
    base_path: String,
    database: Arc<DB>,
}

impl<DB: DatabaseProvider> SqlViewerLayer<DB> {
    /// Create a new SQL viewer at the given base path
    ///
    /// # Arguments
    ///
    /// * `base_path` - The URL path where the viewer will be mounted (e.g., "/sql-viewer")
    /// * `database` - The database provider implementation
    pub fn new(base_path: impl Into<String>, database: DB) -> Self {
        Self {
            base_path: base_path.into(),
            database: Arc::new(database),
        }
    }

    /// Convert into an Axum Router that can be merged
    ///
    /// This method consumes the layer and returns a Router that can be merged
    /// into your main application router.
    ///
    /// The returned router includes:
    /// - Frontend serving at `{base_path}/`
    /// - API endpoints at `{base_path}/api/*`
    /// - Permissive CORS middleware for development
    pub fn into_router(self) -> Router {
        let database = self.database.clone();
        let base_path = self.base_path.clone();

        // Create API router with all endpoints
        // Note: Axum 0.8 uses {param} syntax instead of :param
        let api_router = Router::new()
            .route("/tables", get(list_tables_handler::<DB>))
            .route("/tables/{name}", get(get_table_schema_handler::<DB>))
            .route("/tables/{name}/rows", get(get_rows_handler::<DB>))
            .route("/tables/{name}/count", get(count_rows_handler::<DB>))
            .route("/query", post(execute_query_handler::<DB>))
            .with_state(database);

        // Create frontend router
        let frontend_router = create_frontend_router(base_path.clone());

        // Nest API router under /api and frontend at root
        // Apply permissive CORS for development
        Router::new()
            .nest(&format!("{}/api", base_path), api_router)
            .nest(&base_path, frontend_router)
            .layer(
                CorsLayer::permissive(), // Permissive CORS for development
            )
    }
}

#[cfg(feature = "sqlite")]
impl SqlViewerLayer<SqliteProvider> {
    /// Create a new SQL viewer for SQLite
    ///
    /// # Arguments
    ///
    /// * `base_path` - The URL path where the viewer will be mounted
    /// * `pool` - The SQLite connection pool
    pub fn sqlite(base_path: impl Into<String>, pool: sqlx::SqlitePool) -> Self {
        Self::new(base_path, SqliteProvider::new(pool))
    }
}

#[cfg(feature = "postgres")]
impl SqlViewerLayer<PostgresProvider> {
    /// Create a new SQL viewer for PostgreSQL
    ///
    /// # Arguments
    ///
    /// * `base_path` - The URL path where the viewer will be mounted
    /// * `pool` - The PostgreSQL connection pool
    pub fn postgres(base_path: impl Into<String>, pool: sqlx::PgPool) -> Self {
        Self::new(base_path, PostgresProvider::new(pool))
    }
}
