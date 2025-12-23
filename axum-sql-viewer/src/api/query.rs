//! Raw SQL query execution endpoint

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use std::sync::Arc;

use crate::database::traits::DatabaseProvider;
use crate::schema::{QueryRequest, QueryResult};

/// Handler for POST /api/query
///
/// Executes a raw SQL query and returns the results.
///
/// # Security Warning
///
/// This endpoint allows executing ANY SQL statement including INSERT, UPDATE, DELETE.
/// It should only be used in development environments!
///
/// Request body:
/// ```json
/// {
///   "sql": "SELECT * FROM users LIMIT 10"
/// }
/// ```
///
/// Response (successful SELECT):
/// ```json
/// {
///   "columns": ["id", "name", "email"],
///   "rows": [...],
///   "affectedRows": 0,
///   "executionTimeMilliseconds": 12,
///   "error": null
/// }
/// ```
///
/// Response (successful INSERT/UPDATE/DELETE):
/// ```json
/// {
///   "columns": [],
///   "rows": [],
///   "affectedRows": 5,
///   "executionTimeMilliseconds": 8,
///   "error": null
/// }
/// ```
///
/// Response (error):
/// ```json
/// {
///   "columns": [],
///   "rows": [],
///   "affectedRows": 0,
///   "executionTimeMilliseconds": 0,
///   "error": "near \"SELCT\": syntax error"
/// }
/// ```
///
/// # Arguments
///
/// * `database` - Database provider from state
/// * `request` - JSON request containing SQL query to execute
///
/// # Returns
///
/// JSON response containing query results or error information
pub async fn execute_query_handler<DB: DatabaseProvider>(
    State(database): State<Arc<DB>>,
    Json(request): Json<QueryRequest>,
) -> Response {
    // Log the query execution attempt (be careful with sensitive data in production)
    eprintln!("Executing SQL query: {}", request.sql);

    match database.execute_query(&request.sql).await {
        Ok(result) => {
            // Check if there was an error in the result
            if result.error.is_some() {
                // Query execution failed, return bad request
                (StatusCode::BAD_REQUEST, Json(result)).into_response()
            } else {
                // Query executed successfully
                (StatusCode::OK, Json(result)).into_response()
            }
        }
        Err(error) => {
            eprintln!("Failed to execute query: {}", error);

            // Return appropriate status code based on error type
            let status = if error.to_string().contains("timeout") {
                StatusCode::REQUEST_TIMEOUT
            } else if error.to_string().contains("too large") || error.to_string().contains("TooManyRows") {
                StatusCode::PAYLOAD_TOO_LARGE
            } else {
                StatusCode::BAD_REQUEST
            };

            // Return error as part of QueryResult structure
            (
                status,
                Json(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    affected_rows: 0,
                    execution_time_milliseconds: 0,
                    error: Some(error.to_string()),
                }),
            )
                .into_response()
        }
    }
}
