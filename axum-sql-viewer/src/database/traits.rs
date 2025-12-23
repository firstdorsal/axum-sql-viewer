//! Database provider trait
//!
//! This trait defines the interface that all database implementations must provide.

use crate::schema::{CountResponse, QueryResult, RowQuery, RowsResponse, TableInfo, TableSchema};
use async_trait::async_trait;
use thiserror::Error;

/// Database provider trait for schema discovery and data access
///
/// Implementations of this trait provide database-specific logic for
/// discovering schema information and fetching data.
#[async_trait]
pub trait DatabaseProvider: Send + Sync + 'static {
    /// List all table names in the database
    ///
    /// # Returns
    ///
    /// A vector of table information, optionally including row counts
    async fn list_tables(&self) -> Result<Vec<TableInfo>, DatabaseError>;

    /// Get schema information for a specific table
    ///
    /// # Arguments
    ///
    /// * `table` - Name of the table
    ///
    /// # Returns
    ///
    /// Complete schema information including columns, keys, and indexes
    async fn get_table_schema(&self, table: &str) -> Result<TableSchema, DatabaseError>;

    /// Fetch rows with pagination, sorting, and filtering
    ///
    /// # Arguments
    ///
    /// * `table` - Name of the table
    /// * `query` - Query parameters (pagination, sorting, filters)
    ///
    /// # Returns
    ///
    /// Paginated rows with metadata
    async fn get_rows(&self, table: &str, query: RowQuery) -> Result<RowsResponse, DatabaseError>;

    /// Get total row count for a table (with optional filters)
    ///
    /// # Arguments
    ///
    /// * `table` - Name of the table
    /// * `query` - Query parameters (filters)
    ///
    /// # Returns
    ///
    /// Total row count
    async fn count_rows(&self, table: &str, query: &RowQuery) -> Result<CountResponse, DatabaseError>;

    /// Execute a raw SQL query
    ///
    /// # Security Warning
    ///
    /// This allows executing any SQL statement including INSERT, UPDATE, DELETE.
    /// Only use in development environments!
    ///
    /// # Arguments
    ///
    /// * `sql` - SQL query to execute
    ///
    /// # Returns
    ///
    /// Query results with execution metadata
    async fn execute_query(&self, sql: &str) -> Result<QueryResult, DatabaseError>;
}

/// Database error type
#[derive(Debug, Error)]
pub enum DatabaseError {
    /// Generic database error
    #[error("Database error: {0}")]
    Query(String),

    /// Table not found
    #[error("Table not found: {0}")]
    TableNotFound(String),

    /// Invalid column name
    #[error("Invalid column: {0}")]
    InvalidColumn(String),

    /// Query timeout
    #[error("Query timeout exceeded")]
    Timeout,

    /// Result set too large
    #[error("Result set too large (max {0} rows)")]
    TooManyRows(u64),

    /// Serialization error
    #[error("Serialization error: {0}")]
    Serialization(String),
}

impl From<sqlx::Error> for DatabaseError {
    fn from(error: sqlx::Error) -> Self {
        DatabaseError::Query(error.to_string())
    }
}
