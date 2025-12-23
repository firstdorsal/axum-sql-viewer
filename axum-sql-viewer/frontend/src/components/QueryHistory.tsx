import { PureComponent } from 'react';
import { X } from 'lucide-react';
import { QueryHistoryEntry } from '../types/database';
import { queryHistoryService } from '../services/QueryHistoryService';

interface QueryHistoryProps {
  onLoadQuery: (sql: string) => void;
}

interface QueryHistoryState {
  history: QueryHistoryEntry[];
  loading: boolean;
  showClearConfirm: boolean;
}

/**
 * QueryHistory - A class-based component that displays a list of recent query executions.
 * Shows SQL preview, execution time, and success indicator for each entry.
 */
export default class QueryHistory extends PureComponent<QueryHistoryProps, QueryHistoryState> {
  private unsubscribe: (() => void) | null = null;

  constructor(props: QueryHistoryProps) {
    super(props);
    this.state = {
      history: [],
      loading: true,
      showClearConfirm: false,
    };
  }

  componentDidMount(): void {
    this.loadHistory();
    this.unsubscribe = queryHistoryService.subscribe(this.loadHistory);
  }

  componentWillUnmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private loadHistory = (): void => {
    try {
      const history = queryHistoryService.getAll();
      this.setState({ history, loading: false });
    } catch (error) {
      console.error(`Failed to load query history:`, error);
      this.setState({ loading: false });
    }
  };

  private handleLoadQuery = (sql: string): void => {
    this.props.onLoadQuery(sql);
  };

  private handleClearAll = (): void => {
    this.setState({ showClearConfirm: true });
  };

  private handleConfirmClear = (): void => {
    try {
      queryHistoryService.clear();
      this.loadHistory();
    } catch (error) {
      console.error(`Failed to clear query history:`, error);
    }
    this.setState({ showClearConfirm: false });
  };

  private handleCancelClear = (): void => {
    this.setState({ showClearConfirm: false });
  };

  private handleDeleteEntry = (event: React.MouseEvent, id: string): void => {
    event.stopPropagation();
    queryHistoryService.delete(id);
  };

  render() {
    const { history, loading, showClearConfirm } = this.state;

    if (loading) {
      return (
        <div className={`flex items-center justify-center p-4`}>
          <svg
            className={`animate-spin`}
            xmlns={`http://www.w3.org/2000/svg`}
            width={`20`}
            height={`20`}
            viewBox={`0 0 24 24`}
            fill={`none`}
            stroke={`currentColor`}
            strokeWidth={`2`}
            strokeLinecap={`round`}
            strokeLinejoin={`round`}
          >
            <line x1={`12`} y1={`2`} x2={`12`} y2={`6`}></line>
            <line x1={`12`} y1={`18`} x2={`12`} y2={`22`}></line>
            <line x1={`4.22`} y1={`4.22`} x2={`7.07`} y2={`7.07`}></line>
            <line x1={`16.93`} y1={`16.93`} x2={`19.78`} y2={`19.78`}></line>
            <line x1={`2`} y1={`12`} x2={`6`} y2={`12`}></line>
            <line x1={`18`} y1={`12`} x2={`22`} y2={`12`}></line>
            <line x1={`4.22`} y1={`19.78`} x2={`7.07`} y2={`16.93`}></line>
            <line x1={`16.93`} y1={`7.07`} x2={`19.78`} y2={`4.22`}></line>
          </svg>
        </div>
      );
    }

    return (
      <div className={`flex flex-col gap-4 p-4`}>
        <div className={`flex items-center justify-between`}>
          <h2 className={`text-lg font-semibold text-foreground`}>Query History</h2>
          <button
            onClick={this.handleClearAll}
            disabled={history.length === 0}
            className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
            title={`Clear all query history`}
          >
            Clear All
          </button>
        </div>

        {history.length === 0 ? (
          <p className={`text-center text-muted-foreground text-sm py-4`}>No query history</p>
        ) : (
          <ul className={`flex flex-col gap-2`}>
            {history.map((entry) => (
              <li
                key={entry.id}
                onClick={() => this.handleLoadQuery(entry.sql)}
                className={`group cursor-pointer rounded-md border border-border bg-muted p-3 transition-colors hover:bg-accent hover:border-accent`}
              >
                {/* Header row with status and metadata */}
                <div className={`mb-1 flex items-center justify-between gap-2`}>
                  <div className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground`}>
                    {entry.success ? (
                      <span className={`text-green-600`}>Success</span>
                    ) : (
                      <span className={`text-red-600`}>Failed</span>
                    )}
                    <span>{new Date(entry.executedAt).toLocaleTimeString()}</span>
                    <span>{entry.executionTimeMilliseconds}ms</span>
                    {entry.rowCount != null && (
                      <span>{entry.rowCount} rows</span>
                    )}
                  </div>
                  <button
                    onClick={(event) => this.handleDeleteEntry(event, entry.id)}
                    className={`rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive`}
                    title={`Delete this query`}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* SQL preview */}
                <p className={`break-all text-xs font-mono text-foreground line-clamp-2`}>
                  {entry.sql}
                </p>

                {/* Error message if any */}
                {entry.error && (
                  <p className={`mt-1 text-xs text-destructive line-clamp-1`}>{entry.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Clear confirmation modal */}
        {showClearConfirm && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50`}>
            <div className={`w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg`}>
              <h3 className={`mb-2 text-lg font-semibold`}>Clear Query History</h3>
              <p className={`mb-4 text-sm text-muted-foreground`}>
                Are you sure you want to delete all query history? This action cannot be undone.
              </p>
              <div className={`flex justify-end gap-2`}>
                <button
                  onClick={this.handleCancelClear}
                  className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground`}
                >
                  Cancel
                </button>
                <button
                  onClick={this.handleConfirmClear}
                  className={`inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90`}
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
