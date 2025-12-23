import React from 'react';
import { Search } from 'lucide-react';
import { apiService } from '../services/ApiService';
import { TableSchema } from '../types/database';
import { cn } from '../lib/utils';
import VirtualizedTable from './VirtualizedTable';
import Switch from './ui/Switch';

interface TableViewerProps {
  tableName: string;
  className?: string;
}

interface TableViewerState {
  rows: Record<string, unknown>[];
  columns: string[];
  schema: TableSchema | null;
  total: number;
  offset: number;
  loading: boolean;
  loadingMore: boolean;
  sorting: boolean;
  switching: boolean;
  error: string | null;
  sortBy: string | null;
  sortOrder: `ascending` | `descending` | null;
  searchQuery: string;
  appliedSearchQuery: string;
  searchOnType: boolean;
  selectedRows: Set<number>;
}

interface _TablesResponse {
  tables: Array<{ name: string; rowCount?: number }>;
}

interface _CountResponse {
  count: number;
}

const BATCH_SIZE = 100;

class TableViewer extends React.PureComponent<TableViewerProps, TableViewerState> {
  state: TableViewerState = {
    rows: [],
    columns: [],
    schema: null,
    total: 0,
    offset: 0,
    loading: true,
    loadingMore: false,
    sorting: false,
    switching: false,
    error: null,
    sortBy: null,
    sortOrder: null,
    searchQuery: ``,
    appliedSearchQuery: ``,
    searchOnType: true,
    selectedRows: new Set<number>(),
  };

  async componentDidMount(): Promise<void> {
    await this.loadInitialData();
  }

  async componentDidUpdate(previousProps: TableViewerProps): Promise<void> {
    if (previousProps.tableName !== this.props.tableName) {
      await this.loadInitialData(true);
    }
  }

  private loadInitialData = async (isTableSwitch = false): Promise<void> => {
    const { tableName } = this.props;

    // For table switches, use switching state to avoid full loading flicker
    // For initial load, use loading state to show spinner
    if (isTableSwitch) {
      this.setState({
        switching: true,
        error: null,
        sortBy: null,
        sortOrder: null,
        searchQuery: ``,
        appliedSearchQuery: ``,
        selectedRows: new Set<number>(),
      });
    } else {
      this.setState({
        loading: true,
        error: null,
        rows: [],
        offset: 0,
        searchQuery: ``,
        appliedSearchQuery: ``,
        selectedRows: new Set<number>(),
      });
    }

    try {
      // Load schema and initial rows in parallel
      const [schema, rowsResponse] = await Promise.all([
        apiService.getTableSchema(tableName),
        apiService.getRows(tableName, {
          offset: 0,
          limit: BATCH_SIZE,
        }),
      ]);

      this.setState({
        schema,
        rows: rowsResponse.rows,
        columns: rowsResponse.columns,
        total: rowsResponse.total,
        offset: rowsResponse.rows.length,
        loading: false,
        switching: false,
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : `Failed to load table data`,
        loading: false,
        switching: false,
      });
    }
  };

  private loadMoreRows = async (): Promise<void> => {
    const { tableName } = this.props;
    const { rows, offset, total, loadingMore } = this.state;

    if (loadingMore || offset >= total) {
      return;
    }

    this.setState({ loadingMore: true });

    try {
      const rowsResponse = await apiService.getRows(tableName, {
        offset,
        limit: BATCH_SIZE,
        sortBy: this.state.sortBy ?? undefined,
        sortOrder: this.state.sortOrder ?? undefined,
      });

      this.setState({
        rows: [...rows, ...rowsResponse.rows],
        offset: offset + rowsResponse.rows.length,
        loadingMore: false,
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : `Failed to load more rows`,
        loadingMore: false,
      });
    }
  };

  private handleSort = async (column: string): Promise<void> => {
    const { sortBy, sortOrder, sorting } = this.state;
    const { tableName } = this.props;

    if (sorting) {
      return;
    }

    let newSortBy: string | null = column;
    let newSortOrder: `ascending` | `descending` | null = `ascending`;

    if (sortBy === column) {
      if (sortOrder === `ascending`) {
        newSortOrder = `descending`;
      } else if (sortOrder === `descending`) {
        newSortBy = null;
        newSortOrder = null;
      }
    }

    this.setState({
      sortBy: newSortBy,
      sortOrder: newSortOrder,
      sorting: true,
    });

    try {
      const rowsResponse = await apiService.getRows(tableName, {
        offset: 0,
        limit: BATCH_SIZE,
        sortBy: newSortBy ?? undefined,
        sortOrder: newSortOrder ?? undefined,
      });

      this.setState({
        rows: rowsResponse.rows,
        columns: rowsResponse.columns,
        total: rowsResponse.total,
        offset: rowsResponse.rows.length,
        sorting: false,
      });
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : `Failed to sort data`,
        sorting: false,
      });
    }
  };

  private handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = event.target.value;
    const { searchOnType } = this.state;

    if (searchOnType) {
      // In search-on-type mode, apply search immediately
      this.setState({
        searchQuery: newValue,
        appliedSearchQuery: newValue,
        selectedRows: new Set<number>(),
      });
    } else {
      // In manual mode, just update the input value
      this.setState({
        searchQuery: newValue,
      });
    }
  };

  private handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === `Enter` && !this.state.searchOnType) {
      this.applySearch();
    }
  };

  private applySearch = (): void => {
    this.setState((previousState) => ({
      appliedSearchQuery: previousState.searchQuery,
      selectedRows: new Set<number>(),
    }));
  };

  private handleSearchModeToggle = (checked: boolean): void => {
    this.setState((previousState) => {
      // When switching to search-on-type (live search), immediately apply current query
      // When switching to manual, keep current applied query
      return {
        searchOnType: checked,
        appliedSearchQuery: checked ? previousState.searchQuery : previousState.appliedSearchQuery,
        selectedRows: new Set<number>(),
      };
    });
  };

  private handleRowSelect = (rowIndex: number, selected: boolean): void => {
    this.setState((previousState) => {
      const newSelectedRows = new Set(previousState.selectedRows);
      if (selected) {
        newSelectedRows.add(rowIndex);
      } else {
        newSelectedRows.delete(rowIndex);
      }
      return { selectedRows: newSelectedRows };
    });
  };

  private handleSelectAll = (selected: boolean): void => {
    const { total, searchQuery } = this.state;
    const isFiltered = appliedSearchQuery.trim().length > 0;
    const filteredRows = this.getFilteredRows();

    if (selected) {
      // When filtered, select only filtered rows; otherwise select all rows (even unloaded)
      const count = isFiltered ? filteredRows.length : total;
      const allIndices = new Set(Array.from({ length: count }, (_, index) => index));
      this.setState({ selectedRows: allIndices });
    } else {
      this.setState({ selectedRows: new Set<number>() });
    }
  };

  private handleDeleteSelected = async (): Promise<void> => {
    const { tableName } = this.props;
    const { rows, schema, selectedRows } = this.state;

    if (selectedRows.size === 0) {
      return;
    }

    // Find the primary key column
    const primaryKeyColumn = schema?.columns.find((c) => c.isPrimaryKey);
    if (!primaryKeyColumn) {
      this.setState({ error: `Cannot delete: no primary key found for table` });
      return;
    }

    // Get the primary key values for selected rows
    const selectedIndices = Array.from(selectedRows);
    const primaryKeyValues = selectedIndices
      .filter((index) => rows[index] !== undefined)
      .map((index) => rows[index][primaryKeyColumn.name]);

    if (primaryKeyValues.length === 0) {
      this.setState({ error: `Cannot delete: selected rows not loaded` });
      return;
    }

    // Confirm deletion
    const confirmMessage = `Are you sure you want to delete ${primaryKeyValues.length} row${primaryKeyValues.length === 1 ? `` : `s`}?`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Build and execute DELETE query
      const placeholders = primaryKeyValues.map((value) =>
        typeof value === `string` ? `'${value.replace(/'/g, `''`)}'` : value
      ).join(`, `);
      const deleteQuery = `DELETE FROM "${tableName}" WHERE "${primaryKeyColumn.name}" IN (${placeholders})`;

      await apiService.executeQuery(deleteQuery);

      // Clear selection and reload data
      this.setState({ selectedRows: new Set<number>() });
      await this.loadInitialData();
    } catch (error) {
      this.setState({
        error: error instanceof Error ? error.message : `Failed to delete rows`,
      });
    }
  };

  private handleCellUpdate = async (rowIndex: number, column: string, value: unknown): Promise<void> => {
    const { tableName } = this.props;
    const { rows, schema } = this.state;

    const row = rows[rowIndex];
    if (!row) {
      throw new Error(`Row not found at index ${rowIndex}`);
    }

    // Find the primary key column
    const primaryKeyColumn = schema?.columns.find((c) => c.isPrimaryKey);
    if (!primaryKeyColumn) {
      throw new Error(`Cannot update: no primary key found for table`);
    }

    // Find the column info to determine type
    const columnInfo = schema?.columns.find((c) => c.name === column);
    const dataType = columnInfo?.dataType?.toUpperCase() || ``;
    const isBooleanColumn = dataType.includes(`BOOLEAN`) || dataType.includes(`BOOL`);
    const isNumericColumn = dataType.includes(`INT`) || dataType.includes(`REAL`) || dataType.includes(`FLOAT`) || dataType.includes(`DOUBLE`) || dataType.includes(`DECIMAL`) || dataType.includes(`NUMERIC`);

    const primaryKeyValue = row[primaryKeyColumn.name];

    // Build UPDATE query with proper value formatting
    let escapedValue: string;
    if (value === `` || value === null || value === undefined) {
      escapedValue = `NULL`;
    } else if (isBooleanColumn || isNumericColumn) {
      // Boolean and numeric values should not be quoted
      escapedValue = String(value);
    } else {
      // String values need to be quoted and escaped
      escapedValue = `'${String(value).replace(/'/g, `''`)}'`;
    }

    const escapedPrimaryKey = typeof primaryKeyValue === `string`
      ? `'${primaryKeyValue.replace(/'/g, `''`)}'`
      : primaryKeyValue;

    const updateQuery = `UPDATE "${tableName}" SET "${column}" = ${escapedValue} WHERE "${primaryKeyColumn.name}" = ${escapedPrimaryKey}`;

    await apiService.executeQuery(updateQuery);

    // Update local state immediately for responsive UI
    this.setState((previousState) => {
      const newRows = [...previousState.rows];
      // Convert boolean values for local state
      let localValue: unknown = value;
      if (isBooleanColumn) {
        localValue = value === `1` || value === 1 || value === true;
      } else if (value === ``) {
        localValue = null;
      }
      newRows[rowIndex] = { ...newRows[rowIndex], [column]: localValue };
      return { rows: newRows };
    });
  };

  private getFilteredRows = (): Record<string, unknown>[] => {
    const { rows, appliedSearchQuery } = this.state;

    if (!appliedSearchQuery.trim()) {
      return rows;
    }

    const query = appliedSearchQuery.toLowerCase();
    return rows.filter((row) =>
      Object.values(row).some((value) => {
        if (value === null || value === undefined) {
          return false;
        }
        return String(value).toLowerCase().includes(query);
      })
    );
  };

  render(): React.ReactNode {
    const { className } = this.props;
    const { loading, switching, error, rows, columns, schema, total, loadingMore, sortBy, sortOrder, searchQuery, appliedSearchQuery, searchOnType, selectedRows } = this.state;
    const filteredRows = this.getFilteredRows();

    if (loading) {
      return (
        <div className={cn(`flex h-full items-center justify-center`, className)}>
          <div className={`text-center`}>
            <div className={`mb-2 text-lg font-semibold text-gray-700 dark:text-gray-300`}>
              Loading table data...
            </div>
            <div className={`h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400`} />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={cn(`flex h-full items-center justify-center`, className)}>
          <div className={`rounded-lg border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20`}>
            <div className={`mb-2 text-lg font-semibold text-red-900 dark:text-red-200`}>
              Error Loading Table
            </div>
            <div className={`text-red-700 dark:text-red-300`}>{error}</div>
          </div>
        </div>
      );
    }

    if (rows.length === 0 && !switching) {
      return (
        <div className={cn(`flex h-full items-center justify-center`, className)}>
          <div className={`text-center text-gray-500 dark:text-gray-400`}>
            No rows found in this table.
          </div>
        </div>
      );
    }

    const isFiltered = appliedSearchQuery.trim().length > 0;
    const displayTotal = isFiltered ? filteredRows.length : total;

    return (
      <div className={cn(`relative flex h-full flex-col`, className)}>
        {/* Top bar with search */}
        <div className={`flex items-center gap-4 border-b border-border bg-card px-4 py-3`}>
          <div className={`relative flex-1 max-w-md flex items-center gap-2`}>
            <div className={`relative flex-1`}>
              <input
                type={`text`}
                placeholder={`Search in table...`}
                value={searchQuery}
                onChange={this.handleSearchChange}
                onKeyDown={this.handleSearchKeyDown}
                className={`w-full rounded-md border border-input bg-background px-3 py-2 pl-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring`}
              />
              <Search
                className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`}
                size={16}
              />
            </div>
            {!searchOnType && (
              <button
                onClick={this.applySearch}
                className={`rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors`}
                title={`Apply search`}
              >
                Search
              </button>
            )}
          </div>
          {/* Live search toggle */}
          <div className={`flex items-center gap-2`}>
            <label
              htmlFor={`live-search-toggle`}
              className={`text-sm font-medium text-muted-foreground cursor-pointer select-none`}
            >
              Live search
            </label>
            <Switch
              id={`live-search-toggle`}
              checked={searchOnType}
              onCheckedChange={this.handleSearchModeToggle}
            />
          </div>
          {selectedRows.size > 0 && (
            <button
              onClick={this.handleDeleteSelected}
              className={`rounded-md p-2 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30`}
              title={`Delete ${selectedRows.size} selected rows`}
            >
              <svg
                className={`h-5 w-5`}
                fill={`none`}
                stroke={`currentColor`}
                viewBox={`0 0 24 24`}
              >
                <path strokeLinecap={`round`} strokeLinejoin={`round`} strokeWidth={2} d={`M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16`} />
              </svg>
            </button>
          )}
          <div className={`ml-auto text-sm text-muted-foreground`}>
            {selectedRows.size > 0 && (
              <span className={`mr-4 font-medium text-foreground`}>
                {selectedRows.size} selected
              </span>
            )}
            {isFiltered ? (
              <span>{filteredRows.length} of {total} rows</span>
            ) : (
              <span>{total} rows</span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className={`relative flex-1`}>
          {switching && (
            <div className={`absolute inset-0 z-20 flex items-center justify-center bg-background/80`}>
              <div className={`h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 dark:border-gray-600 dark:border-t-blue-400`} />
            </div>
          )}
          <VirtualizedTable
            columns={columns}
            rows={filteredRows}
            schema={schema}
            tableName={this.props.tableName}
            total={displayTotal}
            hasMore={!isFiltered && rows.length < total}
            loadingMore={loadingMore}
            onLoadMore={isFiltered ? undefined : this.loadMoreRows}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={this.handleSort}
            selectedRows={selectedRows}
            onRowSelect={this.handleRowSelect}
            onSelectAll={this.handleSelectAll}
            onCellUpdate={this.handleCellUpdate}
          />
        </div>
      </div>
    );
  }
}

export default TableViewer;
