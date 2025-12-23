import { PureComponent } from 'react';
import { QueryResult } from '../types/database';
import VirtualizedTable from './VirtualizedTable';

interface QueryResultsProps {
  result: QueryResult | null;
  responseTimeMilliseconds: number | null;
}

interface QueryResultsState {}

/**
 * QueryResults - A class-based component that displays query execution results in a table format.
 * Shows execution time, affected rows, and any errors that occurred.
 */
export default class QueryResults extends PureComponent<QueryResultsProps, QueryResultsState> {

  render() {
    const { result } = this.props;

    if (!result) {
      return (
        <div className={`flex items-center justify-center p-8 text-muted-foreground`}>
          <p>No query results to display. Execute a query to see results.</p>
        </div>
      );
    }

    if (result.error) {
      return (
        <div className={`p-4`}>
          <div className={`rounded-lg border border-destructive bg-destructive/10 p-4`}>
            <h3 className={`text-sm font-semibold text-destructive mb-2`}>
              Query Error
            </h3>
            <p className={`text-sm text-destructive whitespace-pre-wrap`}>{result.error}</p>
          </div>
        </div>
      );
    }

    const { responseTimeMilliseconds } = this.props;

    return (
      <div className={`flex h-full flex-col`}>
        {/* Results Metadata */}
        <div className={`flex items-center gap-4 border-b border-border bg-card px-4 py-2 text-sm text-muted-foreground`}>
          <span>SQL execution: {result.executionTimeMilliseconds}ms</span>
          {responseTimeMilliseconds !== null && (
            <>
              <span className={`opacity-50`}>|</span>
              <span>Total response: {responseTimeMilliseconds}ms</span>
            </>
          )}
          <span className={`opacity-50`}>|</span>
          <span>Affected rows: {result.affectedRows}</span>
          <span className={`opacity-50`}>|</span>
          <span>{result.rows.length} rows returned</span>
        </div>

        {/* Results Table */}
        {result.rows.length === 0 ? (
          <div className={`flex flex-1 items-center justify-center text-muted-foreground`}>
            <p>No rows returned from query.</p>
          </div>
        ) : (
          <div className={`flex-1`}>
            <VirtualizedTable
              columns={result.columns}
              rows={result.rows}
            />
          </div>
        )}
      </div>
    );
  }
}
