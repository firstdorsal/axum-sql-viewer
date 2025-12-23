/**
 * Database type definitions for axum-sql-viewer frontend
 * All interfaces for API communication and UI state management
 */

/**
 * Represents basic information about a table
 */
export interface TableInfo {
  name: string;
  rowCount?: number;
}

/**
 * Response from fetching all tables
 */
export interface TablesResponse {
  tables: TableInfo[];
}

/**
 * Response from fetching row count
 */
export interface CountResponse {
  count: number;
}

/**
 * Represents information about a single column in a table
 */
export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
}

/**
 * Represents a foreign key constraint
 */
export interface ForeignKey {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

/**
 * Represents an index on a table
 */
export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

/**
 * Represents the complete schema of a table
 */
export interface TableSchema {
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[] | null;
  foreignKeys: ForeignKey[];
  indexes: IndexInfo[];
}

/**
 * Represents a paginated response of table rows
 */
export interface RowsResponse {
  rows: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  columns: string[];
}

/**
 * Query parameters for fetching rows with pagination, sorting, and filtering
 */
export interface RowQuery {
  offset: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
  filters?: Record<string, string>;
}

/**
 * Sort order type for query results
 */
export type SortOrder = `ascending` | `descending`;

/**
 * Request body for executing a raw SQL query
 */
export interface QueryRequest {
  sql: string;
}

/**
 * Result from executing a query
 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  affectedRows: number;
  executionTimeMilliseconds: number;
  error?: string;
}

/**
 * Represents a saved query stored in localStorage
 */
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a query execution history entry
 */
export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: string;
  executionTimeMilliseconds: number;
  success: boolean;
  error?: string;
  rowCount?: number;
}
