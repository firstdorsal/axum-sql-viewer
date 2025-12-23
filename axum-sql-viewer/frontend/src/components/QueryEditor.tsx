import React from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, Decoration, DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { sql } from '@codemirror/lang-sql';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { QueryResult } from '../types/database';
import { apiService } from '../services/ApiService';
import { savedQueriesService } from '../services/SavedQueriesService';
import { queryHistoryService } from '../services/QueryHistoryService';

/**
 * State effect to set error line highlighting
 */
const setErrorLine = StateEffect.define<{ line: number; from: number; to: number } | null>();

/**
 * Line decoration for error highlighting
 */
const errorLineDecoration = Decoration.line({ class: `cm-error-line` });

/**
 * Mark decoration for error token highlighting
 */
const errorTokenDecoration = Decoration.mark({ class: `cm-error-token` });

/**
 * State field to track error line decoration
 */
const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLine)) {
        if (effect.value === null) {
          return Decoration.none;
        }
        const { line, from, to } = effect.value;
        const lineStart = transaction.state.doc.line(line).from;
        const decorationList = [errorLineDecoration.range(lineStart)];
        // Add token highlight if we have a valid range
        if (from >= 0 && to > from) {
          decorationList.push(errorTokenDecoration.range(from, to));
        }
        return Decoration.set(decorationList, true);
      }
    }
    // Clear decorations on document changes
    if (transaction.docChanged) {
      return Decoration.none;
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Props for the QueryEditor component
 */
interface QueryEditorProps {
  onQueryResult: (result: QueryResult, responseTimeMilliseconds: number) => void;
  initialQuery?: string;
  queryLoadTimestamp?: number;
  onQueryChange?: (sql: string) => void;
}

/**
 * State for the QueryEditor component
 */
interface QueryEditorState {
  sql: string;
  executing: boolean;
  lastResult: QueryResult | null;
  error: string | null;
  executionTime: number | null;
  showSaveDialog: boolean;
  queryName: string;
}

/**
 * SQL query editor component with CodeMirror 6
 * Provides syntax highlighting, query execution, and saving functionality
 */
class QueryEditor extends React.PureComponent<QueryEditorProps, QueryEditorState> {
  private editorView: EditorView | null = null;
  private editorContainer: React.RefObject<HTMLDivElement>;

  constructor(props: QueryEditorProps) {
    super(props);
    this.editorContainer = React.createRef();
    this.state = {
      sql: props.initialQuery ?? ``,
      executing: false,
      lastResult: null,
      error: null,
      executionTime: null,
      showSaveDialog: false,
      queryName: ``,
    };
  }

  componentDidMount(): void {
    this.initializeEditor();
  }

  componentDidUpdate(previousProps: QueryEditorProps): void {
    // Update editor content when queryLoadTimestamp changes (query loaded from history/saved)
    if (previousProps.queryLoadTimestamp !== this.props.queryLoadTimestamp && this.props.initialQuery !== undefined) {
      if (this.editorView) {
        this.editorView.dispatch({
          changes: {
            from: 0,
            to: this.editorView.state.doc.length,
            insert: this.props.initialQuery,
          },
        });
        this.setState({ sql: this.props.initialQuery });
      }
    }
  }

  componentWillUnmount(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  /**
   * Initialize the CodeMirror editor
   */
  private initializeEditor = (): void => {
    if (!this.editorContainer.current) {
      return;
    }

    // Create a syntax highlighting style with distinct colors
    const sqlHighlightStyle = HighlightStyle.define([
      { tag: tags.keyword, color: `#3b82f6`, fontWeight: `bold` },
      { tag: tags.operator, color: `#f472b6` },
      { tag: tags.string, color: `#22c55e` },
      { tag: tags.number, color: `#f97316` },
      { tag: tags.comment, color: `#6b7280`, fontStyle: `italic` },
      { tag: tags.function(tags.variableName), color: `#8b5cf6` },
      { tag: tags.typeName, color: `#06b6d4` },
      { tag: tags.null, color: `#ef4444` },
      { tag: tags.bool, color: `#ef4444` },
      { tag: tags.punctuation, color: `#9ca3af` },
    ]);

    const startState = EditorState.create({
      doc: this.state.sql,
      extensions: [
        sql(),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        syntaxHighlighting(sqlHighlightStyle),
        errorLineField,
        keymap.of([
          {
            key: `Mod-Enter`,
            run: () => {
              this.executeQuery();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newSql = update.state.doc.toString();
            this.setState({ sql: newSql, error: null });
          }
        }),
        EditorView.theme({
          '&': {
            height: `100%`,
            border: `1px solid hsl(var(--border))`,
            borderRadius: `0.5rem`,
            backgroundColor: `hsl(var(--background))`,
            color: `hsl(var(--foreground))`,
            outline: `none`,
          },
          '&.cm-focused': {
            outline: `none`,
          },
          '.cm-scroller': {
            overflow: `auto`,
            fontFamily: `ui-monospace, monospace`,
          },
          '.cm-content': {
            padding: `0.75rem`,
            caretColor: `hsl(var(--foreground))`,
          },
          '.cm-cursor, .cm-dropCursor': {
            borderLeftColor: `hsl(var(--foreground))`,
          },
          '.cm-gutters': {
            backgroundColor: `hsl(var(--muted))`,
            color: `hsl(var(--muted-foreground))`,
            border: `none`,
          },
          '.cm-activeLineGutter': {
            backgroundColor: `hsl(var(--accent))`,
          },
          '.cm-activeLine': {
            backgroundColor: `hsl(var(--accent) / 0.3)`,
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: `hsl(var(--accent))`,
          },
          '.cm-error-line': {
            backgroundColor: `rgba(239, 68, 68, 0.15)`,
          },
          '.cm-error-token': {
            backgroundColor: `rgba(239, 68, 68, 0.3)`,
            borderBottom: `2px wavy #ef4444`,
          },
        }),
      ],
    });

    this.editorView = new EditorView({
      state: startState,
      parent: this.editorContainer.current,
    });
  };

  /**
   * Parse SQL error message and find the error location
   * SQLite errors often contain patterns like: near "TOKEN": syntax error
   */
  private parseErrorLocation = (errorMessage: string, sqlText: string): { line: number; from: number; to: number } | null => {
    // Try to extract the problematic token from SQLite error messages
    // Pattern: near "TOKEN": syntax error
    const nearMatch = errorMessage.match(/near\s+"([^"]+)"/i);
    if (nearMatch) {
      const token = nearMatch[1];
      const tokenIndex = sqlText.indexOf(token);
      if (tokenIndex >= 0) {
        // Find which line this token is on
        const textBeforeToken = sqlText.substring(0, tokenIndex);
        const lineNumber = (textBeforeToken.match(/\n/g) || []).length + 1;
        return {
          line: lineNumber,
          from: tokenIndex,
          to: tokenIndex + token.length,
        };
      }
    }

    // Try to find "at position N" or similar patterns
    const positionMatch = errorMessage.match(/at\s+position\s+(\d+)/i);
    if (positionMatch) {
      const position = parseInt(positionMatch[1], 10);
      if (position >= 0 && position < sqlText.length) {
        const textBeforePosition = sqlText.substring(0, position);
        const lineNumber = (textBeforePosition.match(/\n/g) || []).length + 1;
        // Highlight a small range around the position
        return {
          line: lineNumber,
          from: position,
          to: Math.min(position + 1, sqlText.length),
        };
      }
    }

    // Default to first line if no specific location found
    return { line: 1, from: -1, to: -1 };
  };

  /**
   * Highlight the error line in the editor
   */
  private highlightErrorLine = (errorMessage: string): void => {
    if (!this.editorView) {
      return;
    }

    const sqlText = this.editorView.state.doc.toString();
    const location = this.parseErrorLocation(errorMessage, sqlText);

    if (location) {
      this.editorView.dispatch({
        effects: setErrorLine.of(location),
      });
    }
  };

  /**
   * Clear error line highlighting
   */
  private clearErrorHighlight = (): void => {
    if (!this.editorView) {
      return;
    }

    this.editorView.dispatch({
      effects: setErrorLine.of(null),
    });
  };

  /**
   * Execute the SQL query
   */
  private executeQuery = async (): Promise<void> => {
    const sql = this.state.sql.trim();

    if (!sql) {
      this.setState({ error: `Please enter a SQL query` });
      return;
    }

    // Clear any previous error highlighting
    this.clearErrorHighlight();

    this.setState({
      executing: true,
      error: null,
      executionTime: null,
    });

    const startTime = performance.now();

    try {
      const result = await apiService.executeQuery(sql);
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      // Add to query history
      queryHistoryService.add({
        sql,
        executedAt: new Date().toISOString(),
        executionTimeMilliseconds: result.executionTimeMilliseconds,
        success: !result.error,
        error: result.error,
        rowCount: result.rows.length,
      });

      if (result.error) {
        this.setState({
          executing: false,
          error: result.error,
          executionTime,
        });
        // Highlight the error location in the editor
        this.highlightErrorLine(result.error);
      } else {
        this.setState({
          executing: false,
          lastResult: result,
          executionTime,
        });
        this.props.onQueryResult(result, executionTime);
      }
    } catch (error) {
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      const errorMessage = error instanceof Error ? error.message : `Unknown error occurred`;

      // Add failed query to history
      queryHistoryService.add({
        sql,
        executedAt: new Date().toISOString(),
        executionTimeMilliseconds: executionTime,
        success: false,
        error: errorMessage,
      });

      this.setState({
        executing: false,
        error: errorMessage,
        executionTime,
      });
      // Highlight the error location in the editor
      this.highlightErrorLine(errorMessage);
    }
  };

  /**
   * Clear the editor content
   */
  private clearEditor = (): void => {
    if (this.editorView) {
      this.clearErrorHighlight();
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: ``,
        },
      });
      this.setState({
        sql: ``,
        error: null,
        executionTime: null,
        lastResult: null,
      });
    }
  };

  /**
   * Show the save query dialog
   */
  private showSaveDialog = (): void => {
    if (!this.state.sql.trim()) {
      this.setState({ error: `Cannot save an empty query` });
      return;
    }
    this.setState({ showSaveDialog: true, queryName: `` });
  };

  /**
   * Save the current query with the provided name
   */
  private saveQuery = (): void => {
    const name = this.state.queryName.trim();
    const sql = this.state.sql.trim();

    if (!name) {
      this.setState({ error: `Please enter a name for the query` });
      return;
    }

    if (!sql) {
      this.setState({ error: `Cannot save an empty query` });
      return;
    }

    try {
      savedQueriesService.save(name, sql);
      this.setState({
        showSaveDialog: false,
        queryName: ``,
        error: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to save query`;
      this.setState({ error: errorMessage });
    }
  };

  /**
   * Cancel the save dialog
   */
  private cancelSave = (): void => {
    this.setState({ showSaveDialog: false, queryName: `` });
  };

  render(): React.ReactNode {
    const { executing, error, showSaveDialog, queryName } = this.state;

    return (
      <div className={`flex h-full flex-col`}>
        {/* Toolbar */}
        <div className={`mb-4 flex gap-2`}>
            <button
              onClick={this.executeQuery}
              disabled={executing}
              className={`inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50`}
              title={`Execute query (Ctrl/Cmd+Enter)`}
            >
              {executing ? (
                <>
                  <svg
                    className={`mr-2 h-4 w-4 animate-spin`}
                    xmlns={`http://www.w3.org/2000/svg`}
                    fill={`none`}
                    viewBox={`0 0 24 24`}
                  >
                    <circle
                      className={`opacity-25`}
                      cx={`12`}
                      cy={`12`}
                      r={`10`}
                      stroke={`currentColor`}
                      strokeWidth={`4`}
                    />
                    <path
                      className={`opacity-75`}
                      fill={`currentColor`}
                      d={`M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z`}
                    />
                  </svg>
                  Executing...
                </>
              ) : (
                <>
                  <svg
                    className={`mr-2 h-4 w-4`}
                    xmlns={`http://www.w3.org/2000/svg`}
                    viewBox={`0 0 24 24`}
                    fill={`none`}
                    stroke={`currentColor`}
                    strokeWidth={`2`}
                    strokeLinecap={`round`}
                    strokeLinejoin={`round`}
                  >
                    <polygon points={`5 3 19 12 5 21 5 3`} />
                  </svg>
                  Run
                </>
              )}
            </button>

            <button
              onClick={this.showSaveDialog}
              disabled={executing}
              className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`}
              title={`Save query`}
            >
              <svg
                className={`mr-2 h-4 w-4`}
                xmlns={`http://www.w3.org/2000/svg`}
                viewBox={`0 0 24 24`}
                fill={`none`}
                stroke={`currentColor`}
                strokeWidth={`2`}
                strokeLinecap={`round`}
                strokeLinejoin={`round`}
              >
                <path d={`M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z`} />
                <polyline points={`17 21 17 13 7 13 7 21`} />
                <polyline points={`7 3 7 8 15 8`} />
              </svg>
              Save
            </button>

            <button
              onClick={this.clearEditor}
              disabled={executing}
              className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50`}
              title={`Clear editor`}
            >
              <svg
                className={`mr-2 h-4 w-4`}
                xmlns={`http://www.w3.org/2000/svg`}
                viewBox={`0 0 24 24`}
                fill={`none`}
                stroke={`currentColor`}
                strokeWidth={`2`}
                strokeLinecap={`round`}
                strokeLinejoin={`round`}
              >
                <path d={`M3 6h18`} />
                <path d={`M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6`} />
                <path d={`M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2`} />
              </svg>
              Clear
            </button>
        </div>

        {/* Editor container */}
        <div ref={this.editorContainer} className={`min-h-0 flex-1`} />

        {/* Error message */}
        {error && (
          <div className={`mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive`}>
            <div className={`mb-1 font-semibold`}>Error</div>
            <div className={`font-mono`}>{error}</div>
          </div>
        )}

        {/* Save dialog */}
        {showSaveDialog && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50`}>
            <div className={`w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg`}>
              <h3 className={`mb-4 text-lg font-semibold`}>Save Query</h3>
              <div className={`mb-4`}>
                <label htmlFor={`query-name`} className={`mb-2 block text-sm font-medium`}>
                  Query Name
                </label>
                <input
                  id={`query-name`}
                  type={`text`}
                  value={queryName}
                  onChange={(event) => this.setState({ queryName: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === `Enter`) {
                      this.saveQuery();
                    } else if (event.key === `Escape`) {
                      this.cancelSave();
                    }
                  }}
                  placeholder={`Enter a name for this query`}
                  className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`}
                  autoFocus
                />
              </div>
              <div className={`flex justify-end gap-2`}>
                <button
                  onClick={this.cancelSave}
                  className={`inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground`}
                >
                  Cancel
                </button>
                <button
                  onClick={this.saveQuery}
                  className={`inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}

export default QueryEditor;
