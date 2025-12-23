//! SQLite database provider implementation

use crate::database::traits::{DatabaseError, DatabaseProvider};
use crate::schema::{
    ColumnInfo, CountResponse, ForeignKey, IndexInfo, QueryResult, RowQuery, RowsResponse,
    SortOrder, TableInfo, TableSchema,
};
use async_trait::async_trait;
use serde_json::Value;
use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, SqlitePool, TypeInfo, ValueRef};
use std::time::Instant;

/// SQLite database provider
pub struct SqliteProvider {
    pool: SqlitePool,
}

impl SqliteProvider {
    /// Create a new SQLite provider
    ///
    /// # Arguments
    ///
    /// * `pool` - SQLite connection pool
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Quote an identifier (table or column name) to prevent SQL injection
    ///
    /// SQLite uses double quotes for identifiers. This function escapes any
    /// double quotes in the identifier by doubling them.
    fn quote_identifier(identifier: &str) -> String {
        format!("\"{}\"", identifier.replace('"', "\"\""))
    }

    /// Convert a SQLite row to a JSON object
    ///
    /// This handles all SQLite data types and converts them to appropriate JSON values.
    fn row_to_json(row: &SqliteRow) -> Result<Value, DatabaseError> {
        let mut map = serde_json::Map::new();

        for column in row.columns() {
            let column_name = column.name();
            let value = Self::extract_column_value(row, column)?;
            map.insert(column_name.to_string(), value);
        }

        Ok(Value::Object(map))
    }

    /// Extract a column value from a SQLite row and convert to JSON
    fn extract_column_value(
        row: &SqliteRow,
        column: &sqlx::sqlite::SqliteColumn,
    ) -> Result<Value, DatabaseError> {
        let column_name = column.name();
        let type_info = column.type_info();
        let type_name = type_info.name();

        // Check if the value is NULL first
        if row
            .try_get_raw(column_name)
            .map_err(|e| DatabaseError::Query(e.to_string()))?
            .is_null()
        {
            return Ok(Value::Null);
        }

        // SQLite has dynamic typing but reports affinities: INTEGER, REAL, TEXT, BLOB, NULL
        // We'll try to extract the value based on the type affinity
        match type_name {
            "INTEGER" | "BIGINT" => {
                // Try i64 first, which covers most integer cases
                if let Ok(value) = row.try_get::<i64, _>(column_name) {
                    return Ok(Value::Number(value.into()));
                }
            }
            "REAL" | "FLOAT" | "DOUBLE" => {
                if let Ok(value) = row.try_get::<f64, _>(column_name) {
                    if let Some(number) = serde_json::Number::from_f64(value) {
                        return Ok(Value::Number(number));
                    }
                }
            }
            "TEXT" | "VARCHAR" | "CHAR" | "CLOB" => {
                if let Ok(value) = row.try_get::<String, _>(column_name) {
                    return Ok(Value::String(value));
                }
            }
            "BLOB" => {
                if let Ok(value) = row.try_get::<Vec<u8>, _>(column_name) {
                    // Convert BLOB to base64 string for JSON serialization
                    let base64_string = base64_encode(&value);
                    return Ok(Value::String(format!(
                        "[BLOB: {} bytes, base64: {}]",
                        value.len(),
                        base64_string
                    )));
                }
            }
            "BOOLEAN" | "BOOL" => {
                if let Ok(value) = row.try_get::<bool, _>(column_name) {
                    return Ok(Value::Bool(value));
                }
            }
            "DATE" | "DATETIME" | "TIMESTAMP" => {
                // Try to get as string (ISO format is common in SQLite)
                if let Ok(value) = row.try_get::<String, _>(column_name) {
                    return Ok(Value::String(value));
                }
            }
            _ => {
                // For unknown types, try string first, then other types
                if let Ok(value) = row.try_get::<String, _>(column_name) {
                    return Ok(Value::String(value));
                }
            }
        }

        // Fallback: try common types in order
        if let Ok(value) = row.try_get::<i64, _>(column_name) {
            return Ok(Value::Number(value.into()));
        }
        if let Ok(value) = row.try_get::<f64, _>(column_name) {
            if let Some(number) = serde_json::Number::from_f64(value) {
                return Ok(Value::Number(number));
            }
        }
        if let Ok(value) = row.try_get::<String, _>(column_name) {
            return Ok(Value::String(value));
        }
        if let Ok(value) = row.try_get::<bool, _>(column_name) {
            return Ok(Value::Bool(value));
        }
        if let Ok(value) = row.try_get::<Vec<u8>, _>(column_name) {
            let base64_string = base64_encode(&value);
            return Ok(Value::String(format!(
                "[BLOB: {} bytes, base64: {}]",
                value.len(),
                base64_string
            )));
        }

        // If all else fails, return null
        Ok(Value::Null)
    }

    /// Build a WHERE clause from filters
    fn build_where_clause(filters: &std::collections::HashMap<String, String>) -> (String, Vec<String>) {
        if filters.is_empty() {
            return (String::new(), Vec::new());
        }

        let mut conditions = Vec::new();
        let mut values = Vec::new();

        for (column, filter_value) in filters {
            let quoted_column = Self::quote_identifier(column);

            // Support LIKE patterns with % wildcard
            if filter_value.contains('%') {
                conditions.push(format!("{} LIKE ?", quoted_column));
                values.push(filter_value.clone());
            } else {
                conditions.push(format!("{} = ?", quoted_column));
                values.push(filter_value.clone());
            }
        }

        (format!(" WHERE {}", conditions.join(" AND ")), values)
    }

    /// Build an ORDER BY clause from sort parameters
    fn build_order_clause(sort_by: Option<&str>, sort_order: Option<SortOrder>) -> String {
        match (sort_by, sort_order) {
            (Some(column), Some(order)) => {
                let quoted_column = Self::quote_identifier(column);
                let direction = match order {
                    SortOrder::Ascending => "ASC",
                    SortOrder::Descending => "DESC",
                };
                format!(" ORDER BY {} {}", quoted_column, direction)
            }
            _ => String::new(),
        }
    }
}

#[async_trait]
impl DatabaseProvider for SqliteProvider {
    async fn list_tables(&self) -> Result<Vec<TableInfo>, DatabaseError> {
        let query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";

        let rows = sqlx::query(query)
            .fetch_all(&self.pool)
            .await?;

        let mut tables = Vec::new();
        for row in rows {
            let name: String = row.try_get("name")?;

            // Optionally get row count for each table
            let count_query = format!("SELECT COUNT(*) as count FROM {}", Self::quote_identifier(&name));
            let row_count: Option<u64> = sqlx::query_scalar(&count_query)
                .fetch_one(&self.pool)
                .await
                .ok()
                .map(|count: i64| count as u64);

            tables.push(TableInfo { name, row_count });
        }

        Ok(tables)
    }

    async fn get_table_schema(&self, table: &str) -> Result<TableSchema, DatabaseError> {
        // Get column information using PRAGMA table_info
        let table_info_query = format!("PRAGMA table_info({})", Self::quote_identifier(table));
        let column_rows = sqlx::query(&table_info_query)
            .fetch_all(&self.pool)
            .await?;

        if column_rows.is_empty() {
            return Err(DatabaseError::TableNotFound(table.to_string()));
        }

        let mut columns = Vec::new();
        let mut primary_key_columns = Vec::new();

        for row in column_rows {
            // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
            let _column_id: i32 = row.try_get("cid")?;
            let name: String = row.try_get("name")?;
            let data_type: String = row.try_get("type")?;
            let not_null: i32 = row.try_get("notnull")?;
            let default_value: Option<String> = row.try_get("dflt_value").ok();
            let primary_key: i32 = row.try_get("pk")?;

            let is_primary_key = primary_key > 0;
            if is_primary_key {
                primary_key_columns.push((primary_key, name.clone()));
            }

            columns.push(ColumnInfo {
                name,
                data_type,
                nullable: not_null == 0,
                default_value,
                is_primary_key,
            });
        }

        // Sort primary key columns by their pk order and extract names
        primary_key_columns.sort_by_key(|(order, _)| *order);
        let primary_key = if primary_key_columns.is_empty() {
            None
        } else {
            Some(primary_key_columns.into_iter().map(|(_, name)| name).collect())
        };

        // Get foreign key information using PRAGMA foreign_key_list
        let foreign_key_query = format!("PRAGMA foreign_key_list({})", Self::quote_identifier(table));
        let foreign_key_rows = sqlx::query(&foreign_key_query)
            .fetch_all(&self.pool)
            .await?;

        let mut foreign_keys = Vec::new();
        for row in foreign_key_rows {
            // PRAGMA foreign_key_list returns: id, seq, table, from, to, on_update, on_delete, match
            let column: String = row.try_get("from")?;
            let references_table: String = row.try_get("table")?;
            let references_column: String = row.try_get("to")?;

            foreign_keys.push(ForeignKey {
                column,
                references_table,
                references_column,
            });
        }

        // Get index information using PRAGMA index_list
        let index_list_query = format!("PRAGMA index_list({})", Self::quote_identifier(table));
        let index_rows = sqlx::query(&index_list_query)
            .fetch_all(&self.pool)
            .await?;

        let mut indexes = Vec::new();
        for row in index_rows {
            // PRAGMA index_list returns: seq, name, unique, origin, partial
            let index_name: String = row.try_get("name")?;
            let unique: i32 = row.try_get("unique")?;

            // Get columns in this index using PRAGMA index_info
            let index_info_query = format!("PRAGMA index_info({})", Self::quote_identifier(&index_name));
            let index_column_rows = sqlx::query(&index_info_query)
                .fetch_all(&self.pool)
                .await?;

            let mut index_columns = Vec::new();
            for col_row in index_column_rows {
                // PRAGMA index_info returns: seqno, cid, name
                let column_name: Option<String> = col_row.try_get("name").ok();
                if let Some(name) = column_name {
                    index_columns.push(name);
                }
            }

            indexes.push(IndexInfo {
                name: index_name,
                columns: index_columns,
                unique: unique != 0,
            });
        }

        Ok(TableSchema {
            name: table.to_string(),
            columns,
            primary_key,
            foreign_keys,
            indexes,
        })
    }

    async fn get_rows(&self, table: &str, query: RowQuery) -> Result<RowsResponse, DatabaseError> {
        // Verify the table exists first
        let table_exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%'"
        )
        .bind(table)
        .fetch_optional(&self.pool)
        .await?;

        if table_exists.is_none() {
            return Err(DatabaseError::TableNotFound(table.to_string()));
        }

        // Enforce maximum limit
        const MAX_LIMIT: u64 = 500;
        let limit = query.limit.min(MAX_LIMIT);

        // Build WHERE clause from filters
        let (where_clause, filter_values) = Self::build_where_clause(&query.filters);

        // Build ORDER BY clause
        let order_clause = Self::build_order_clause(
            query.sort_by.as_deref(),
            query.sort_order,
        );

        // Get total count with filters applied
        let count_query = format!(
            "SELECT COUNT(*) FROM {}{}",
            Self::quote_identifier(table),
            where_clause
        );

        let mut count_sql_query = sqlx::query_scalar::<_, i64>(&count_query);
        for value in &filter_values {
            count_sql_query = count_sql_query.bind(value);
        }
        let total: i64 = count_sql_query.fetch_one(&self.pool).await?;
        let total = total as u64;

        // Build the main query
        let select_query = format!(
            "SELECT * FROM {}{}{} LIMIT ? OFFSET ?",
            Self::quote_identifier(table),
            where_clause,
            order_clause
        );

        // Build and execute query with bindings
        let mut sql_query = sqlx::query(&select_query);
        for value in &filter_values {
            sql_query = sql_query.bind(value);
        }
        sql_query = sql_query.bind(limit as i64).bind(query.offset as i64);

        let rows = sql_query.fetch_all(&self.pool).await?;

        // Extract column names from the first row (if any) or from schema
        let columns = if let Some(first_row) = rows.first() {
            first_row
                .columns()
                .iter()
                .map(|col| col.name().to_string())
                .collect()
        } else {
            // If no rows, get columns from schema
            let schema = self.get_table_schema(table).await?;
            schema.columns.into_iter().map(|col| col.name).collect()
        };

        // Convert rows to JSON
        let mut json_rows = Vec::new();
        for row in &rows {
            json_rows.push(Self::row_to_json(row)?);
        }

        let has_more = query.offset + (json_rows.len() as u64) < total;

        Ok(RowsResponse {
            rows: json_rows,
            columns,
            total,
            offset: query.offset,
            limit,
            has_more,
        })
    }

    async fn count_rows(&self, table: &str, query: &RowQuery) -> Result<CountResponse, DatabaseError> {
        // Verify the table exists first
        let table_exists: Option<i64> = sqlx::query_scalar(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? AND name NOT LIKE 'sqlite_%'"
        )
        .bind(table)
        .fetch_optional(&self.pool)
        .await?;

        if table_exists.is_none() {
            return Err(DatabaseError::TableNotFound(table.to_string()));
        }

        // Build WHERE clause from filters
        let (where_clause, filter_values) = Self::build_where_clause(&query.filters);

        // Build count query
        let count_query = format!(
            "SELECT COUNT(*) FROM {}{}",
            Self::quote_identifier(table),
            where_clause
        );

        let mut sql_query = sqlx::query_scalar::<_, i64>(&count_query);
        for value in &filter_values {
            sql_query = sql_query.bind(value);
        }

        let count: i64 = sql_query.fetch_one(&self.pool).await?;

        Ok(CountResponse {
            count: count as u64,
        })
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, DatabaseError> {
        let start_time = Instant::now();

        // Enforce query timeout (30 seconds)
        const QUERY_TIMEOUT_SECONDS: u64 = 30;

        // Enforce maximum result row limit
        const MAX_RESULT_ROWS: u64 = 10000;

        // Check if this is a SELECT query or a write operation
        let trimmed_sql = sql.trim().to_uppercase();
        let is_select_query = trimmed_sql.starts_with("SELECT")
            || trimmed_sql.starts_with("PRAGMA")
            || trimmed_sql.starts_with("EXPLAIN");

        if is_select_query {
            // For SELECT queries, fetch all rows
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(QUERY_TIMEOUT_SECONDS),
                sqlx::query(sql).fetch_all(&self.pool),
            )
            .await;

            let execution_time_milliseconds = start_time.elapsed().as_millis() as u64;

            match result {
                Ok(Ok(rows)) => {
                    // Check row limit
                    if rows.len() > MAX_RESULT_ROWS as usize {
                        return Err(DatabaseError::TooManyRows(MAX_RESULT_ROWS));
                    }

                    // Extract columns from first row or return empty result
                    let columns = if let Some(first_row) = rows.first() {
                        first_row
                            .columns()
                            .iter()
                            .map(|column| column.name().to_string())
                            .collect()
                    } else {
                        Vec::new()
                    };

                    // Convert rows to JSON
                    let mut json_rows = Vec::new();
                    for row in &rows {
                        json_rows.push(Self::row_to_json(row)?);
                    }

                    Ok(QueryResult {
                        columns,
                        rows: json_rows,
                        affected_rows: rows.len() as u64,
                        execution_time_milliseconds,
                        error: None,
                    })
                }
                Ok(Err(error)) => {
                    // SQL execution error
                    Ok(QueryResult {
                        columns: Vec::new(),
                        rows: Vec::new(),
                        affected_rows: 0,
                        execution_time_milliseconds,
                        error: Some(error.to_string()),
                    })
                }
                Err(_) => {
                    // Timeout error
                    Err(DatabaseError::Timeout)
                }
            }
        } else {
            // For INSERT/UPDATE/DELETE, use execute() to get affected rows
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(QUERY_TIMEOUT_SECONDS),
                sqlx::query(sql).execute(&self.pool),
            )
            .await;

            let execution_time_milliseconds = start_time.elapsed().as_millis() as u64;

            match result {
                Ok(Ok(query_result)) => {
                    Ok(QueryResult {
                        columns: Vec::new(),
                        rows: Vec::new(),
                        affected_rows: query_result.rows_affected(),
                        execution_time_milliseconds,
                        error: None,
                    })
                }
                Ok(Err(error)) => {
                    Ok(QueryResult {
                        columns: Vec::new(),
                        rows: Vec::new(),
                        affected_rows: 0,
                        execution_time_milliseconds,
                        error: Some(error.to_string()),
                    })
                }
                Err(_) => {
                    Err(DatabaseError::Timeout)
                }
            }
        }
    }
}

/// Simple base64 encoding for BLOB data
fn base64_encode(data: &[u8]) -> String {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    // Limit to first 64 bytes for display purposes
    let limited_data = if data.len() > 64 {
        &data[..64]
    } else {
        data
    };

    let mut result = String::new();
    let mut i = 0;

    while i + 2 < limited_data.len() {
        let b1 = limited_data[i];
        let b2 = limited_data[i + 1];
        let b3 = limited_data[i + 2];

        result.push(BASE64_CHARS[(b1 >> 2) as usize] as char);
        result.push(BASE64_CHARS[(((b1 & 0x03) << 4) | (b2 >> 4)) as usize] as char);
        result.push(BASE64_CHARS[(((b2 & 0x0f) << 2) | (b3 >> 6)) as usize] as char);
        result.push(BASE64_CHARS[(b3 & 0x3f) as usize] as char);

        i += 3;
    }

    // Handle remaining bytes
    if i < limited_data.len() {
        let b1 = limited_data[i];
        result.push(BASE64_CHARS[(b1 >> 2) as usize] as char);

        if i + 1 < limited_data.len() {
            let b2 = limited_data[i + 1];
            result.push(BASE64_CHARS[(((b1 & 0x03) << 4) | (b2 >> 4)) as usize] as char);
            result.push(BASE64_CHARS[((b2 & 0x0f) << 2) as usize] as char);
            result.push('=');
        } else {
            result.push(BASE64_CHARS[((b1 & 0x03) << 4) as usize] as char);
            result.push_str("==");
        }
    }

    if data.len() > 64 {
        result.push_str("...");
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quote_identifier() {
        assert_eq!(SqliteProvider::quote_identifier("users"), "\"users\"");
        assert_eq!(
            SqliteProvider::quote_identifier("table\"name"),
            "\"table\"\"name\""
        );
    }

    #[test]
    fn test_build_where_clause() {
        let mut filters = std::collections::HashMap::new();
        filters.insert("name".to_string(), "John".to_string());
        filters.insert("age".to_string(), "30".to_string());

        let (clause, values) = SqliteProvider::build_where_clause(&filters);
        assert!(clause.contains("WHERE"));
        assert!(clause.contains("\"name\""));
        assert!(clause.contains("\"age\""));
        assert_eq!(values.len(), 2);
    }

    #[test]
    fn test_build_order_clause() {
        let clause = SqliteProvider::build_order_clause(Some("name"), Some(SortOrder::Ascending));
        assert!(clause.contains("ORDER BY"));
        assert!(clause.contains("\"name\""));
        assert!(clause.contains("ASC"));

        let clause = SqliteProvider::build_order_clause(Some("id"), Some(SortOrder::Descending));
        assert!(clause.contains("DESC"));

        let clause = SqliteProvider::build_order_clause(None, None);
        assert!(clause.is_empty());
    }

    #[test]
    fn test_base64_encode() {
        let data = b"Hello, World!";
        let encoded = base64_encode(data);
        assert!(!encoded.is_empty());
        assert!(encoded.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '='));
    }
}
