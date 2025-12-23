//! Table listing and schema endpoints

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use std::sync::Arc;

use crate::database::traits::DatabaseProvider;
use crate::schema::TablesResponse;

/// Handler for GET /api/tables
///
/// Returns a list of all tables in the database with row counts.
///
/// # Arguments
///
/// * `database` - Database provider from state
///
/// # Returns
///
/// JSON response containing list of tables
pub async fn list_tables_handler<DB: DatabaseProvider>(
    State(database): State<Arc<DB>>,
) -> Response {
    match database.list_tables().await {
        Ok(tables) => (StatusCode::OK, Json(TablesResponse { tables })).into_response(),
        Err(error) => {
            eprintln!("Failed to list tables: {}", error);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": error.to_string()
                })),
            )
                .into_response()
        }
    }
}

/// Handler for GET /api/tables/:name
///
/// Returns the schema information for a specific table including columns,
/// primary keys, foreign keys, and indexes.
///
/// # Arguments
///
/// * `database` - Database provider from state
/// * `table_name` - Name of the table to get schema for
///
/// # Returns
///
/// JSON response containing table schema information
pub async fn get_table_schema_handler<DB: DatabaseProvider>(
    State(database): State<Arc<DB>>,
    Path(table_name): Path<String>,
) -> Response {
    match database.get_table_schema(&table_name).await {
        Ok(schema) => (StatusCode::OK, Json(schema)).into_response(),
        Err(error) => {
            eprintln!("Failed to get schema for table '{}': {}", table_name, error);

            // Return appropriate status code based on error type
            let status = if error.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };

            (
                status,
                Json(serde_json::json!({
                    "error": error.to_string()
                })),
            )
                .into_response()
        }
    }
}
