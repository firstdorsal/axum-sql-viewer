//! PostgreSQL database provider implementation

use crate::database::traits::{DatabaseError, DatabaseProvider};
use crate::schema::{
    ColumnInfo, CountResponse, ForeignKey, IndexInfo, QueryResult, RowQuery, RowsResponse,
    SortOrder, TableInfo, TableSchema,
};
use async_trait::async_trait;
use sqlx::{postgres::PgRow, Column, PgPool, Row, TypeInfo};
use std::collections::HashMap;

/// PostgreSQL database provider
pub struct PostgresProvider {
    pool: PgPool,
}

impl PostgresProvider {
    /// Create a new PostgreSQL provider
    ///
    /// # Arguments
    ///
    /// * `pool` - PostgreSQL connection pool
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Quote an identifier to prevent SQL injection
    fn quote_identifier(identifier: &str) -> String {
        format!("\"{}\"", identifier.replace("\"", "\"\""))
    }

    /// Convert a PostgreSQL row to a JSON object
    fn row_to_json(row: &PgRow) -> Result<serde_json::Value, DatabaseError> {
        let mut map = serde_json::Map::new();

        for column in row.columns() {
            let column_name = column.name();
            let type_info = column.type_info();
            let type_name = type_info.name();

            let value: serde_json::Value = match type_name {
                "BOOL" => {
                    let val: Option<bool> = row.try_get(column_name)?;
                    val.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null)
                }
                "INT2" | "SMALLINT" | "SMALLSERIAL" => {
                    let val: Option<i16> = row.try_get(column_name)?;
                    val.map(|v| serde_json::Value::Number(v.into())).unwrap_or(serde_json::Value::Null)
                }
                "INT4" | "INT" | "INTEGER" | "SERIAL" => {
                    let val: Option<i32> = row.try_get(column_name)?;
                    val.map(|v| serde_json::Value::Number(v.into())).unwrap_or(serde_json::Value::Null)
                }
                "INT8" | "BIGINT" | "BIGSERIAL" => {
                    let val: Option<i64> = row.try_get(column_name)?;
                    val.map(|v| serde_json::Value::Number(v.into())).unwrap_or(serde_json::Value::Null)
                }
                "FLOAT4" | "REAL" => {
                    let val: Option<f32> = row.try_get(column_name)?;
                    val.and_then(|v| serde_json::Number::from_f64(v as f64))
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
                }
                "FLOAT8" | "DOUBLE PRECISION" => {
                    let val: Option<f64> = row.try_get(column_name)?;
                    val.and_then(serde_json::Number::from_f64)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
                }
                "TEXT" | "VARCHAR" | "CHAR" | "NAME" | "BPCHAR" => {
                    let val: Option<String> = row.try_get(column_name)?;
                    val.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null)
                }
                "BYTEA" => {
                    let val: Option<Vec<u8>> = row.try_get(column_name)?;
                    val.map(|bytes| {
                        serde_json::Value::String(format!("[BLOB: {} bytes]", bytes.len()))
                    }).unwrap_or(serde_json::Value::Null)
                }
                "TIMESTAMP" | "TIMESTAMPTZ" | "TIMESTAMP WITHOUT TIME ZONE" | "TIMESTAMP WITH TIME ZONE"
                | "DATE" | "TIME" | "TIME WITHOUT TIME ZONE" => {
                    // Try to get as string representation
                    let val: Option<String> = row.try_get(column_name).ok().flatten();
                    val.map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
                "JSON" | "JSONB" => {
                    let val: Option<serde_json::Value> = row.try_get(column_name)?;
                    val.unwrap_or(serde_json::Value::Null)
                }
                "UUID" => {
                    // Try to get as string representation
                    let val: Option<String> = row.try_get(column_name).ok().flatten();
                    val.map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
                "NUMERIC" | "DECIMAL" => {
                    // Try to get as string to preserve precision
                    let val: Option<String> = row.try_get(column_name).ok().flatten();
                    val.map(serde_json::Value::String)
                        .unwrap_or(serde_json::Value::Null)
                }
                _ => {
                    // Fallback: try to get as string
                    let val: Option<String> = row.try_get(column_name).ok().flatten();
                    val.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null)
                }
            };

            map.insert(column_name.to_string(), value);
        }

        Ok(serde_json::Value::Object(map))
    }

    /// Build a WHERE clause from filters
    fn build_where_clause(filters: &HashMap<String, String>, parameter_offset: i32) -> (String, Vec<String>) {
        if filters.is_empty() {
            return (String::new(), vec![]);
        }

        let mut conditions = Vec::new();
        let mut values = Vec::new();
        let mut param_index = parameter_offset;

        for (column, filter_value) in filters {
            let quoted_column = Self::quote_identifier(column);

            if filter_value.contains('%') {
                conditions.push(format!("{} LIKE ${}", quoted_column, param_index));
            } else {
                conditions.push(format!("{} = ${}", quoted_column, param_index));
            }

            values.push(filter_value.clone());
            param_index += 1;
        }

        let where_clause = format!(" WHERE {}", conditions.join(" AND "));
        (where_clause, values)
    }
}

#[async_trait]
impl DatabaseProvider for PostgresProvider {
    async fn list_tables(&self) -> Result<Vec<TableInfo>, DatabaseError> {
        let query = r#"
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
        "#;

        let rows = sqlx::query(query)
            .fetch_all(&self.pool)
            .await?;

        let mut tables = Vec::new();
        for row in rows {
            let name: String = row.try_get("table_name")?;

            // Get row count for each table
            let count_query = format!(
                "SELECT COUNT(*) as count FROM {}",
                Self::quote_identifier(&name)
            );
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
        // Get column information
        let column_query = r#"
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default,
                udt_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
            ORDER BY ordinal_position
        "#;

        let column_rows = sqlx::query(column_query)
            .bind(table)
            .fetch_all(&self.pool)
            .await?;

        if column_rows.is_empty() {
            return Err(DatabaseError::TableNotFound(table.to_string()));
        }

        // Get primary key columns
        let pk_query = r#"
            SELECT kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = $1
              AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY kcu.ordinal_position
        "#;

        let pk_rows = sqlx::query(pk_query)
            .bind(table)
            .fetch_all(&self.pool)
            .await?;

        let primary_key_columns: Vec<String> = pk_rows
            .iter()
            .map(|row| row.try_get::<String, _>("column_name"))
            .collect::<Result<Vec<_>, _>>()?;

        let primary_key = if primary_key_columns.is_empty() {
            None
        } else {
            Some(primary_key_columns.clone())
        };

        // Get foreign keys
        let fk_query = r#"
            SELECT
                kcu.column_name,
                ccu.table_name AS references_table,
                ccu.column_name AS references_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.table_schema = 'public'
              AND tc.table_name = $1
              AND tc.constraint_type = 'FOREIGN KEY'
        "#;

        let fk_rows = sqlx::query(fk_query)
            .bind(table)
            .fetch_all(&self.pool)
            .await?;

        let foreign_keys: Vec<ForeignKey> = fk_rows
            .iter()
            .map(|row| {
                Ok(ForeignKey {
                    column: row.try_get("column_name")?,
                    references_table: row.try_get("references_table")?,
                    references_column: row.try_get("references_column")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;

        // Get indexes
        let index_query = r#"
            SELECT
                i.indexname AS index_name,
                i.indexdef AS index_definition
            FROM pg_indexes i
            WHERE i.schemaname = 'public'
              AND i.tablename = $1
              AND i.indexname NOT IN (
                SELECT constraint_name
                FROM information_schema.table_constraints
                WHERE table_schema = 'public'
                  AND table_name = $1
                  AND constraint_type = 'PRIMARY KEY'
              )
        "#;

        let index_rows = sqlx::query(index_query)
            .bind(table)
            .fetch_all(&self.pool)
            .await?;

        let indexes: Vec<IndexInfo> = index_rows
            .iter()
            .map(|row| {
                let index_name: String = row.try_get("index_name")?;
                let index_definition: String = row.try_get("index_definition")?;

                // Parse column names from index definition (simplified)
                // This is a basic implementation - could be enhanced
                let columns = vec![]; // Would need proper parsing of index_definition

                let unique = index_definition.to_uppercase().contains("UNIQUE");

                Ok(IndexInfo {
                    name: index_name,
                    columns,
                    unique,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;

        // Build column info
        let columns: Vec<ColumnInfo> = column_rows
            .iter()
            .map(|row| {
                let column_name: String = row.try_get("column_name")?;
                let data_type: String = row.try_get("data_type")?;
                let is_nullable: String = row.try_get("is_nullable")?;
                let column_default: Option<String> = row.try_get("column_default")?;

                Ok(ColumnInfo {
                    name: column_name.clone(),
                    data_type,
                    nullable: is_nullable == "YES",
                    default_value: column_default,
                    is_primary_key: primary_key_columns.contains(&column_name),
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()?;

        Ok(TableSchema {
            name: table.to_string(),
            columns,
            primary_key,
            foreign_keys,
            indexes,
        })
    }

    async fn get_rows(&self, table: &str, query: RowQuery) -> Result<RowsResponse, DatabaseError> {
        // Validate table exists and get columns
        let schema = self.get_table_schema(table).await?;
        let column_names: Vec<String> = schema.columns.iter().map(|c| c.name.clone()).collect();

        // Build base query
        let quoted_table = Self::quote_identifier(table);
        let mut sql = format!("SELECT * FROM {}", quoted_table);

        // Add WHERE clause for filters
        let (where_clause, filter_values) = Self::build_where_clause(&query.filters, 1);
        sql.push_str(&where_clause);

        // Add ORDER BY clause
        if let Some(sort_column) = &query.sort_by {
            // Validate sort column exists
            if !column_names.contains(sort_column) {
                return Err(DatabaseError::InvalidColumn(sort_column.clone()));
            }

            let quoted_sort = Self::quote_identifier(sort_column);
            let sort_direction = match query.sort_order {
                Some(SortOrder::Descending) => "DESC",
                _ => "ASC",
            };
            sql.push_str(&format!(" ORDER BY {} {}", quoted_sort, sort_direction));
        }

        // Add LIMIT and OFFSET
        let limit = query.limit.min(500); // Cap at 500 as per spec
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, query.offset));

        // Execute query
        let mut query_builder = sqlx::query(&sql);
        for value in &filter_values {
            query_builder = query_builder.bind(value);
        }

        let rows = query_builder.fetch_all(&self.pool).await?;

        // Convert rows to JSON
        let json_rows: Vec<serde_json::Value> = rows
            .iter()
            .map(Self::row_to_json)
            .collect::<Result<Vec<_>, _>>()?;

        // Get total count
        let count_result = self.count_rows(table, &query).await?;
        let total = count_result.count;

        let has_more = query.offset + (json_rows.len() as u64) < total;

        Ok(RowsResponse {
            rows: json_rows,
            columns: column_names,
            total,
            offset: query.offset,
            limit,
            has_more,
        })
    }

    async fn count_rows(&self, table: &str, query: &RowQuery) -> Result<CountResponse, DatabaseError> {
        let quoted_table = Self::quote_identifier(table);
        let mut sql = format!("SELECT COUNT(*) as count FROM {}", quoted_table);

        // Add WHERE clause for filters
        let (where_clause, filter_values) = Self::build_where_clause(&query.filters, 1);
        sql.push_str(&where_clause);

        // Execute query
        let mut query_builder = sqlx::query(&sql);
        for value in &filter_values {
            query_builder = query_builder.bind(value);
        }

        let row = query_builder.fetch_one(&self.pool).await?;
        let count: i64 = row.try_get("count")?;

        Ok(CountResponse {
            count: count as u64,
        })
    }

    async fn execute_query(&self, sql: &str) -> Result<QueryResult, DatabaseError> {
        let start_time = std::time::Instant::now();

        // Try to execute as a query that returns rows (SELECT)
        let result = sqlx::query(sql).fetch_all(&self.pool).await;

        let execution_time_milliseconds = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(rows) => {
                if rows.is_empty() {
                    // Could be a DML query (INSERT/UPDATE/DELETE) or SELECT with no results
                    // Try to get affected rows count
                    Ok(QueryResult {
                        columns: vec![],
                        rows: vec![],
                        affected_rows: 0,
                        execution_time_milliseconds,
                        error: None,
                    })
                } else {
                    // SELECT query with results
                    let columns: Vec<String> = rows[0]
                        .columns()
                        .iter()
                        .map(|col| col.name().to_string())
                        .collect();

                    let json_rows: Vec<serde_json::Value> = rows
                        .iter()
                        .map(Self::row_to_json)
                        .collect::<Result<Vec<_>, _>>()?;

                    // Apply row limit
                    let max_rows = 10000;
                    if json_rows.len() > max_rows {
                        return Err(DatabaseError::TooManyRows(max_rows as u64));
                    }

                    Ok(QueryResult {
                        columns,
                        rows: json_rows,
                        affected_rows: 0,
                        execution_time_milliseconds,
                        error: None,
                    })
                }
            }
            Err(error) => {
                // Return error in result
                Ok(QueryResult {
                    columns: vec![],
                    rows: vec![],
                    affected_rows: 0,
                    execution_time_milliseconds,
                    error: Some(error.to_string()),
                })
            }
        }
    }
}
