import React from 'react';
import { apiService } from '../services/ApiService';
import { TableInfo } from '../types/database';

interface TableListProps {
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
}

interface TableListState {
  tables: TableInfo[];
  loading: boolean;
  error: string | null;
}

/**
 * TableList component - displays a sidebar list of available database tables
 * Class-based PureComponent for performance optimization
 */
class TableList extends React.PureComponent<TableListProps, TableListState> {
  state: TableListState = {
    tables: [],
    loading: true,
    error: null,
  };

  /**
   * Fetch tables from API when component mounts
   */
  async componentDidMount(): Promise<void> {
    try {
      const response = await apiService.getTables();
      this.setState({
        tables: response.tables,
        loading: false,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to fetch tables`;
      this.setState({
        loading: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Handle table selection
   */
  private handleTableSelect = (tableName: string): void => {
    this.props.onTableSelect(tableName);
  };

  /**
   * Render loading spinner
   */
  private renderLoadingSpinner = (): React.ReactNode => {
    return (
      <div className={`flex items-center justify-center py-8 px-4`}>
        <div className={`flex items-center gap-3`}>
          <div className={`h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent`}></div>
          <span className={`text-sm font-medium text-gray-600 dark:text-gray-300`}>Loading tables...</span>
        </div>
      </div>
    );
  };

  /**
   * Render error message
   */
  private renderError = (): React.ReactNode => {
    const { error } = this.state;
    return (
      <div className={`mx-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950`}>
        <p className={`text-sm font-medium text-red-800 dark:text-red-200`}>Error loading tables</p>
        <p className={`mt-1 text-xs text-red-700 dark:text-red-300`}>{error}</p>
      </div>
    );
  };

  /**
   * Render table list items
   */
  private renderTableItems = (): React.ReactNode => {
    const { tables } = this.state;
    const { selectedTable } = this.props;

    if (tables.length === 0) {
      return (
        <div className={`px-4 py-6 text-center`}>
          <p className={`text-sm text-gray-500 dark:text-gray-400`}>No tables found</p>
        </div>
      );
    }

    return (
      <ul className={`space-y-1 py-2 px-2`}>
        {tables.map((table) => (
          <li key={table.name}>
            <button
              onClick={() => this.handleTableSelect(table.name)}
              className={`w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                selectedTable === table.name
                  ? `bg-accent text-accent-foreground`
                  : `text-muted-foreground hover:bg-accent/50 hover:text-foreground`
              }`}
              type={`button`}
            >
              <span className={`truncate`}>{table.name}</span>
              {table.rowCount != null && (
                <span className={`flex-shrink-0 text-xs text-muted-foreground`}>
                  {table.rowCount.toLocaleString()}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  render(): React.ReactNode {
    const { loading, error } = this.state;

    return (
      <div className={`flex flex-col h-full overflow-y-auto`}>
        {loading && this.renderLoadingSpinner()}
        {error && this.renderError()}
        {!loading && !error && this.renderTableItems()}
      </div>
    );
  }
}

export default TableList;
