import { PureComponent } from 'react';
import { X } from 'lucide-react';
import { SavedQuery } from '../types/database';
import { savedQueriesService } from '../services/SavedQueriesService';

interface SavedQueriesProps {
  onLoadQuery: (sql: string) => void;
}

interface SavedQueriesState {
  queries: SavedQuery[];
  loading: boolean;
}

/**
 * SavedQueries - A class-based component that displays a list of saved queries.
 * Allows loading, deleting, importing, and exporting saved queries.
 */
export default class SavedQueries extends PureComponent<SavedQueriesProps, SavedQueriesState> {
  private fileInputRef: HTMLInputElement | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(props: SavedQueriesProps) {
    super(props);
    this.state = {
      queries: [],
      loading: true,
    };
  }

  componentDidMount(): void {
    this.loadQueries();
    this.unsubscribe = savedQueriesService.subscribe(this.loadQueries);
  }

  componentWillUnmount(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  private loadQueries = (): void => {
    try {
      const queries = savedQueriesService.getAll();
      this.setState({ queries, loading: false });
    } catch (error) {
      console.error(`Failed to load saved queries:`, error);
      this.setState({ loading: false });
    }
  };

  private handleLoadQuery = (sql: string): void => {
    this.props.onLoadQuery(sql);
  };

  private handleDeleteQuery = (event: React.MouseEvent, id: string): void => {
    event.stopPropagation();
    try {
      savedQueriesService.delete(id);
      this.loadQueries();
    } catch (error) {
      console.error(`Failed to delete query:`, error);
    }
  };

  private handleExport = (): void => {
    try {
      const json = savedQueriesService.exportToJson();
      const blob = new Blob([json], { type: `application/json` });
      const url = URL.createObjectURL(blob);
      const link = document.createElement(`a`);
      link.href = url;
      link.download = `saved-queries-${new Date().toISOString().split(`T`)[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Failed to export queries:`, error);
      alert(`Failed to export queries`);
    }
  };

  private handleImport = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        savedQueriesService.importFromJson(json);
        this.loadQueries();
        alert(`Queries imported successfully`);
      } catch (error) {
        console.error(`Failed to import queries:`, error);
        alert(`Failed to import queries: ${error instanceof Error ? error.message : `Unknown error`}`);
      }
    };
    reader.readAsText(file);
  };

  private triggerFileInput = (): void => {
    this.fileInputRef?.click();
  };

  render() {
    const { queries, loading } = this.state;

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
          <h2 className={`text-lg font-semibold text-foreground`}>Saved Queries</h2>
          <div className={`flex gap-1`}>
            <button
              onClick={this.handleExport}
              disabled={queries.length === 0}
              className={`inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none`}
              title={`Export saved queries to JSON file`}
            >
              <svg
                xmlns={`http://www.w3.org/2000/svg`}
                width={`16`}
                height={`16`}
                viewBox={`0 0 24 24`}
                fill={`none`}
                stroke={`currentColor`}
                strokeWidth={`2`}
                strokeLinecap={`round`}
                strokeLinejoin={`round`}
              >
                <path d={`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`} />
                <polyline points={`7 10 12 15 17 10`} />
                <line x1={`12`} y1={`15`} x2={`12`} y2={`3`} />
              </svg>
            </button>
            <button
              onClick={this.triggerFileInput}
              className={`inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none`}
              title={`Import saved queries from JSON file`}
            >
              <svg
                xmlns={`http://www.w3.org/2000/svg`}
                width={`16`}
                height={`16`}
                viewBox={`0 0 24 24`}
                fill={`none`}
                stroke={`currentColor`}
                strokeWidth={`2`}
                strokeLinecap={`round`}
                strokeLinejoin={`round`}
              >
                <path d={`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`} />
                <polyline points={`17 8 12 3 7 8`} />
                <line x1={`12`} y1={`3`} x2={`12`} y2={`15`} />
              </svg>
            </button>
            <input
              ref={(ref) => {
                this.fileInputRef = ref;
              }}
              type={`file`}
              accept={`.json`}
              onChange={this.handleImport}
              style={{ display: `none` }}
            />
          </div>
        </div>

        {queries.length === 0 ? (
          <p className={`text-center text-muted-foreground text-sm py-4`}>No saved queries</p>
        ) : (
          <ul className={`flex flex-col gap-2`}>
            {queries.map((query) => (
              <li
                key={query.id}
                onClick={() => this.handleLoadQuery(query.sql)}
                className={`group cursor-pointer rounded-md border border-border bg-muted p-3 transition-colors hover:bg-accent hover:border-accent`}
              >
                {/* Header row with name and delete button */}
                <div className={`mb-1 flex items-center justify-between gap-2`}>
                  <p className={`text-sm font-medium text-foreground truncate`}>{query.name}</p>
                  <button
                    onClick={(event) => this.handleDeleteQuery(event, query.id)}
                    className={`rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive`}
                    title={`Delete this query`}
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* SQL preview */}
                <p className={`break-all text-xs font-mono text-foreground line-clamp-2`}>
                  {query.sql}
                </p>

                {/* Created date */}
                <p className={`mt-1 text-xs text-muted-foreground`}>
                  {new Date(query.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}
