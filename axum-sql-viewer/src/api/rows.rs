//! Row fetching endpoints with pagination

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use std::sync::Arc;

use crate::database::traits::DatabaseProvider;
use crate::schema::RowQuery;

/// Maximum allowed limit to prevent excessive memory usage
const MAX_LIMIT: u64 = 500;

/// Handler for GET /api/tables/:name/rows
///
/// Fetches rows from a table with pagination, sorting, and filtering.
///
/// Query parameters:
/// - offset: Starting row offset (default: 0)
/// - limit: Maximum rows to return (default: 100, max: 500)
/// - sortBy: Column name to sort by (optional)
/// - sortOrder: "ascending" or "descending" (optional, default: "ascending")
/// - filter[column]: Filter value for specific column (supports % wildcards)
///
/// # Arguments
///
/// * `database` - Database provider from state
/// * `table_name` - Name of the table to fetch rows from
/// * `query` - Query parameters for pagination, sorting, and filtering
///
/// # Returns
///
/// JSON response containing rows, columns, and pagination metadata
pub async fn get_rows_handler<DB: DatabaseProvider>(
    State(database): State<Arc<DB>>,
    Path(table_name): Path<String>,
    Query(mut query): Query<RowQuery>,
) -> Response {
    // Enforce maximum limit
    if query.limit > MAX_LIMIT {
        query.limit = MAX_LIMIT;
    }

    match database.get_rows(&table_name, query).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => {
            eprintln!(
                "Failed to get rows from table '{}': {}",
                table_name,
                error
            );

            // Return appropriate status code based on error type
            let status = if error.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else if error.to_string().contains("Invalid column") {
                StatusCode::BAD_REQUEST
            } else if error.to_string().contains("timeout") {
                StatusCode::REQUEST_TIMEOUT
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

/// Handler for GET /api/tables/:name/count
///
/// Returns the total row count for a table (with optional filters applied).
///
/// Query parameters:
/// - filter[column]: Filter value for specific column (same as get_rows_handler)
///
/// # Arguments
///
/// * `database` - Database provider from state
/// * `table_name` - Name of the table to count rows from
/// * `query` - Query parameters (filters only, other fields ignored)
///
/// # Returns
///
/// JSON response containing the total row count
pub async fn count_rows_handler<DB: DatabaseProvider>(
    State(database): State<Arc<DB>>,
    Path(table_name): Path<String>,
    Query(query): Query<RowQuery>,
) -> Response {
    match database.count_rows(&table_name, &query).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(error) => {
            eprintln!(
                "Failed to count rows from table '{}': {}",
                table_name,
                error
            );

            // Return appropriate status code based on error type
            let status = if error.to_string().contains("not found") {
                StatusCode::NOT_FOUND
            } else if error.to_string().contains("Invalid column") {
                StatusCode::BAD_REQUEST
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
