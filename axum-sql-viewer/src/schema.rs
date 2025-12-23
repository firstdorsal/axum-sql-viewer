//! Schema types for dynamic database introspection
//!
//! These types represent database schema information discovered at runtime.

use serde::{Deserialize, Serialize};

/// Complete schema information for a database table
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    /// Name of the table
    pub name: String,

    /// List of columns in the table
    pub columns: Vec<ColumnInfo>,

    /// Primary key column names (if any)
    pub primary_key: Option<Vec<String>>,

    /// Foreign key constraints
    pub foreign_keys: Vec<ForeignKey>,

    /// Index definitions
    pub indexes: Vec<IndexInfo>,
}

/// Information about a single column
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    /// Column name
    pub name: String,

    /// SQL data type (e.g., "INTEGER", "TEXT", "VARCHAR(255)")
    pub data_type: String,

    /// Whether the column allows NULL values
    pub nullable: bool,

    /// Default value expression (if any)
    pub default_value: Option<String>,

    /// Whether this column is part of the primary key
    pub is_primary_key: bool,
}

/// Foreign key constraint information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKey {
    /// Column name in this table
    pub column: String,

    /// Referenced table name
    pub references_table: String,

    /// Referenced column name
    pub references_column: String,
}

/// Index information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    /// Index name
    pub name: String,

    /// Columns included in the index
    pub columns: Vec<String>,

    /// Whether the index enforces uniqueness
    pub unique: bool,
}

/// Information about a table (for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    /// Table name
    pub name: String,

    /// Approximate row count (if available)
    pub row_count: Option<u64>,
}

/// Query parameters for fetching rows
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowQuery {
    /// Starting offset for pagination
    #[serde(default)]
    pub offset: u64,

    /// Maximum number of rows to return
    #[serde(default = "default_limit")]
    pub limit: u64,

    /// Column name to sort by
    pub sort_by: Option<String>,

    /// Sort order
    pub sort_order: Option<SortOrder>,

    /// Column filters (column_name -> filter_value)
    #[serde(default)]
    pub filters: std::collections::HashMap<String, String>,
}

fn default_limit() -> u64 {
    100
}

/// Sort order for row queries
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SortOrder {
    Ascending,
    Descending,
}

/// Response containing table rows
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowsResponse {
    /// The rows returned
    pub rows: Vec<serde_json::Value>,

    /// Column names in the result
    pub columns: Vec<String>,

    /// Total number of rows in the table (with filters applied)
    pub total: u64,

    /// Current offset
    pub offset: u64,

    /// Limit used for this query
    pub limit: u64,

    /// Whether there are more rows available
    pub has_more: bool,
}

/// Response from listing tables
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TablesResponse {
    /// List of tables
    pub tables: Vec<TableInfo>,
}

/// Request to execute a raw SQL query
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    /// SQL query to execute
    pub sql: String,
}

/// Result from executing a query
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    /// Column names in the result
    pub columns: Vec<String>,

    /// Rows returned (empty for non-SELECT queries)
    pub rows: Vec<serde_json::Value>,

    /// Number of rows affected (for INSERT/UPDATE/DELETE)
    pub affected_rows: u64,

    /// Query execution time in milliseconds
    pub execution_time_milliseconds: u64,

    /// Error message if the query failed
    pub error: Option<String>,
}

/// Response for row count queries
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CountResponse {
    /// Total number of rows
    pub count: u64,
}
