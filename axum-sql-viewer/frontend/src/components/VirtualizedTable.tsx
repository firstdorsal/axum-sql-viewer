import React from 'react';
import { VariableSizeList as List } from 'react-window';
import { ArrowUp, ArrowDown, KeyRound, Calendar } from 'lucide-react';
import { TableSchema } from '../types/database';
import { cn } from '../lib/utils';

interface VirtualizedTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  className?: string;
  schema?: TableSchema | null;
  tableName?: string;
  total?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  sortBy?: string | null;
  sortOrder?: `ascending` | `descending` | null;
  onSort?: (column: string) => void;
  selectedRows?: Set<number>;
  onRowSelect?: (rowIndex: number, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
  onCellUpdate?: (rowIndex: number, column: string, value: unknown) => Promise<void>;
}

const COLUMN_WIDTHS_STORAGE_KEY = `sql-viewer-column-widths`;

interface VirtualizedTableState {
  columnWidths: Record<string, number>;
  editingCell: { rowIndex: number; column: string; value: string; originalValue: string } | null;
  containerWidth: number;
  containerHeight: number;
  scrollLeft: number;
}

const DEFAULT_COLUMN_WIDTH = 150;
const DEFAULT_ROW_HEIGHT = 40;
const HEADER_HEIGHT = 48;
const CHECKBOX_COLUMN_WIDTH = 48;

class VirtualizedTable extends React.PureComponent<VirtualizedTableProps, VirtualizedTableState> {
  private listReference = React.createRef<List>();
  private listOuterElement: HTMLDivElement | null = null;
  private resizeStartX = 0;
  private resizeColumn: string | null = null;
  private resizeInitialWidth = 0;
  private containerReference = React.createRef<HTMLDivElement>();
  private resizeObserver: ResizeObserver | null = null;
  private pendingColumnWidths: Record<string, number> | null = null;
  private dateTimeInputReference = React.createRef<HTMLInputElement>();

  state: VirtualizedTableState = {
    columnWidths: {},
    editingCell: null,
    containerWidth: 0,
    containerHeight: 600,
    scrollLeft: 0,
  };

  componentDidMount(): void {
    // Initialize column widths
    this.initializeColumnWidths();

    document.addEventListener(`mousemove`, this.handleMouseMove);
    document.addEventListener(`mouseup`, this.handleMouseUp);

    // Set up ResizeObserver to track container dimensions
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const isFirstMeasurement = this.state.containerWidth === 0;

        this.setState({
          containerWidth: width,
          containerHeight: height,
        }, () => {
          // Reinitialize column widths on first measurement
          if (isFirstMeasurement && width > 0) {
            this.initializeColumnWidths();
          }
        });
      }
    });

    if (this.containerReference.current) {
      this.resizeObserver.observe(this.containerReference.current);
    }
  }

  componentDidUpdate(previousProps: VirtualizedTableProps): void {
    // Reinitialize column widths if columns change
    if (previousProps.columns !== this.props.columns) {
      this.initializeColumnWidths();
      this.setState({ editingCell: null, scrollLeft: 0 });
    }

    // Reset editing cell if rows change
    if (previousProps.rows !== this.props.rows) {
      this.setState({ editingCell: null });
    }
  }

  componentWillUnmount(): void {
    document.removeEventListener(`mousemove`, this.handleMouseMove);
    document.removeEventListener(`mouseup`, this.handleMouseUp);

    if (this.listOuterElement) {
      this.listOuterElement.removeEventListener(`scroll`, this.handleNativeScroll);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private setListOuterElement = (element: HTMLDivElement | null): void => {
    // Remove listener from old element
    if (this.listOuterElement) {
      this.listOuterElement.removeEventListener(`scroll`, this.handleNativeScroll);
    }

    this.listOuterElement = element;

    // Add listener to new element
    if (this.listOuterElement) {
      this.listOuterElement.addEventListener(`scroll`, this.handleNativeScroll);
    }
  };

  private handleNativeScroll = (): void => {
    if (this.listOuterElement) {
      const newScrollLeft = this.listOuterElement.scrollLeft;
      if (newScrollLeft !== this.state.scrollLeft) {
        this.setState({ scrollLeft: newScrollLeft });
      }
    }
  };

  private loadSavedColumnWidths = (): Record<string, Record<string, number>> => {
    try {
      const stored = localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error(`Failed to load column widths from localStorage:`, error);
    }
    return {};
  };

  private saveColumnWidths = (tableName: string, widths: Record<string, number>): void => {
    try {
      const allWidths = this.loadSavedColumnWidths();
      allWidths[tableName] = widths;
      localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(allWidths));
    } catch (error) {
      console.error(`Failed to save column widths to localStorage:`, error);
    }
  };

  private initializeColumnWidths = (): void => {
    const { columns, tableName } = this.props;
    const { containerWidth } = this.state;

    // Try to load saved widths for this table
    if (tableName) {
      const savedWidths = this.loadSavedColumnWidths();
      const tableWidths = savedWidths[tableName];
      if (tableWidths) {
        // Check if all current columns have saved widths
        const allColumnsSaved = columns.every((column) => tableWidths[column] !== undefined);
        if (allColumnsSaved) {
          this.setState({ columnWidths: tableWidths }, () => {
            // Notify List component to recalculate with new widths
            if (this.listReference.current) {
              this.listReference.current.resetAfterIndex(0);
            }
          });
          return;
        }
      }
    }

    // Calculate width per column to fill the container
    // Scrollbar takes ~17px, checkbox column takes CHECKBOX_COLUMN_WIDTH (only if selection is enabled)
    const scrollbarWidth = 17;
    const showSelection = !!this.props.onRowSelect;
    const checkboxWidth = showSelection ? CHECKBOX_COLUMN_WIDTH : 0;
    const availableWidth = containerWidth > 0 ? containerWidth - scrollbarWidth - checkboxWidth : columns.length * DEFAULT_COLUMN_WIDTH;
    const widthPerColumn = Math.max(DEFAULT_COLUMN_WIDTH, Math.floor(availableWidth / columns.length));

    const columnWidths: Record<string, number> = {};
    columns.forEach((column) => {
      columnWidths[column] = widthPerColumn;
    });

    this.setState({ columnWidths }, () => {
      // Notify List component to recalculate with new widths
      if (this.listReference.current) {
        this.listReference.current.resetAfterIndex(0);
      }
    });
  };

  private handleColumnResize = (column: string, width: number): void => {
    const newColumnWidths = {
      ...this.state.columnWidths,
      [column]: Math.max(50, width),
    };

    this.setState({ columnWidths: newColumnWidths });

    // Store the pending widths for saving on mouseup
    this.pendingColumnWidths = newColumnWidths;

    // Reset list cache to recalculate column widths
    if (this.listReference.current) {
      this.listReference.current.resetAfterIndex(0);
    }
  };

  private handleResizeStart = (event: React.MouseEvent, column: string): void => {
    event.preventDefault();
    this.resizeStartX = event.clientX;
    this.resizeColumn = column;
    this.resizeInitialWidth = this.state.columnWidths[column] || DEFAULT_COLUMN_WIDTH;
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (this.resizeColumn) {
      const delta = event.clientX - this.resizeStartX;
      const newWidth = this.resizeInitialWidth + delta;
      this.handleColumnResize(this.resizeColumn, newWidth);
    }
  };

  private handleMouseUp = (): void => {
    // Save column widths when resize is complete
    if (this.resizeColumn && this.props.tableName && this.pendingColumnWidths) {
      this.saveColumnWidths(this.props.tableName, this.pendingColumnWidths);
    }
    this.resizeColumn = null;
    this.pendingColumnWidths = null;
  };

  private handleResizeDoubleClick = (column: string): void => {
    const { columns, tableName } = this.props;
    const { containerWidth } = this.state;

    // Calculate the default width (accounting for checkbox column)
    const scrollbarWidth = 17;
    const availableWidth = containerWidth > 0 ? containerWidth - scrollbarWidth - CHECKBOX_COLUMN_WIDTH : columns.length * DEFAULT_COLUMN_WIDTH;
    const defaultWidth = Math.max(DEFAULT_COLUMN_WIDTH, Math.floor(availableWidth / columns.length));

    // Reset column to default width
    const newColumnWidths = {
      ...this.state.columnWidths,
      [column]: defaultWidth,
    };

    this.setState({ columnWidths: newColumnWidths });

    // Save the updated widths
    if (tableName) {
      this.saveColumnWidths(tableName, newColumnWidths);
    }

    // Reset list cache
    if (this.listReference.current) {
      this.listReference.current.resetAfterIndex(0);
    }
  };

  private handleCellClick = (rowIndex: number, column: string): void => {
    const { rows } = this.props;
    const row = rows[rowIndex];
    if (!row) return;

    const value = row[column];
    const stringValue = value === null || value === undefined ? `` : String(value);

    this.setState({
      editingCell: { rowIndex, column, value: stringValue, originalValue: stringValue },
    });
  };

  private handleEditChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { editingCell } = this.state;
    if (!editingCell) return;

    this.setState({
      editingCell: { ...editingCell, value: event.target.value },
    });
  };

  private handleEditSave = async (): Promise<void> => {
    const { editingCell } = this.state;
    const { onCellUpdate, schema } = this.props;
    if (!editingCell || !onCellUpdate) {
      this.setState({ editingCell: null });
      return;
    }

    // Skip update if value hasn't changed
    if (editingCell.value === editingCell.originalValue) {
      this.setState({ editingCell: null });
      return;
    }

    // Validate datetime values before saving
    const columnInfo = schema?.columns.find((c) => c.name === editingCell.column);
    const dataType = columnInfo?.dataType?.toUpperCase() || ``;
    const isDateTimeColumn = dataType.includes(`DATETIME`) || dataType.includes(`TIMESTAMP`);

    if (isDateTimeColumn && editingCell.value) {
      const date = new Date(editingCell.value);
      if (isNaN(date.getTime())) {
        console.error(`Invalid datetime value: ${editingCell.value}`);
        this.setState({ editingCell: null });
        return;
      }
    }

    try {
      await onCellUpdate(editingCell.rowIndex, editingCell.column, editingCell.value);
    } catch (error) {
      console.error(`Failed to save cell:`, error);
    }

    this.setState({ editingCell: null });
  };

  private handleEditCancel = (): void => {
    this.setState({ editingCell: null });
  };

  private handleEditKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === `Enter`) {
      event.preventDefault();
      this.handleEditSave();
    } else if (event.key === `Escape`) {
      event.preventDefault();
      this.handleEditCancel();
    }
  };

  private formatDateTimeForInput = (value: string): string => {
    if (!value) return ``;
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return ``;
      // Format as YYYY-MM-DDTHH:mm for datetime-local input
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, `0`);
      const day = String(date.getDate()).padStart(2, `0`);
      const hours = String(date.getHours()).padStart(2, `0`);
      const minutes = String(date.getMinutes()).padStart(2, `0`);
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return ``;
    }
  };

  private handleDateTimeInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const { editingCell } = this.state;
    if (!editingCell) return;

    const dateValue = event.target.value;
    if (!dateValue) return;

    // Convert datetime-local value to ISO string format
    const date = new Date(dateValue);
    const isoString = date.toISOString().replace(`T`, ` `).slice(0, 19);

    this.setState({
      editingCell: { ...editingCell, value: isoString },
    });
  };

  private handleShowDatePicker = (): void => {
    if (this.dateTimeInputReference.current) {
      this.dateTimeInputReference.current.showPicker();
    }
  };

  private handleBooleanToggle = async (rowIndex: number, column: string, currentValue: unknown): Promise<void> => {
    const { onCellUpdate } = this.props;
    if (!onCellUpdate) return;

    // Toggle the boolean value
    const newValue = !this.isTruthy(currentValue);
    try {
      await onCellUpdate(rowIndex, column, newValue ? `1` : `0`);
    } catch (error) {
      console.error(`Failed to toggle boolean:`, error);
    }
  };

  private isTruthy = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === `boolean`) return value;
    if (typeof value === `number`) return value !== 0;
    if (typeof value === `string`) {
      const lower = value.toLowerCase();
      return lower === `true` || lower === `1` || lower === `yes`;
    }
    return Boolean(value);
  };

  private handleScroll = ({ scrollOffset }: { scrollOffset: number }): void => {
    const { rows, total, hasMore, onLoadMore, loadingMore } = this.props;
    const { containerHeight } = this.state;

    if (!onLoadMore || !hasMore || loadingMore) {
      return;
    }

    // Calculate which row index is currently visible at the bottom of the viewport
    const visibleEndIndex = Math.ceil((scrollOffset + containerHeight - HEADER_HEIGHT) / DEFAULT_ROW_HEIGHT);

    // Load more when we're within 20 rows of the last loaded row
    if (visibleEndIndex >= rows.length - 20 && (total === undefined || rows.length < total)) {
      onLoadMore();
    }
  };

  private getItemSize = (_index: number): number => {
    return DEFAULT_ROW_HEIGHT;
  };

  private renderCell = (value: unknown, _column: string, _rowIndex: number): React.ReactNode => {
    // Handle NULL values
    if (value === null || value === undefined) {
      return (
        <span className={`italic text-gray-400 dark:text-gray-500`}>NULL</span>
      );
    }

    // Handle BLOB/binary data
    if (value instanceof ArrayBuffer || (typeof value === `object` && value.constructor.name === `Uint8Array`)) {
      const bytes = value instanceof ArrayBuffer ? value.byteLength : (value as Uint8Array).length;
      return (
        <span className={`inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200`}>
          [BLOB: {bytes} bytes]
        </span>
      );
    }

    // Handle objects (might be JSON)
    if (typeof value === `object`) {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    // Handle strings and other primitives
    return String(value);
  };

  private renderRow = ({ index, style, data }: { index: number; style: React.CSSProperties; data: { rows: Record<string, unknown>[]; selectedRows: Set<number> | undefined; editingCell: { rowIndex: number; column: string; value: string; originalValue: string } | null; containerWidth: number } }): React.ReactElement => {
    const { columns, onRowSelect } = this.props;
    const { columnWidths } = this.state;
    const { editingCell } = data;
    const row = data.rows[index];
    const isSelected = data.selectedRows?.has(index) ?? false;

    // Handle not-yet-loaded rows with a loading placeholder
    const showSelection = !!onRowSelect;

    // Calculate total width of all columns to ensure row border extends full width
    const totalContentWidth = columns.reduce((sum, col) => sum + (columnWidths[col] || DEFAULT_COLUMN_WIDTH), 0) + (showSelection ? CHECKBOX_COLUMN_WIDTH : 0);

    if (!row) {
      return (
        <div style={{ ...style, minWidth: totalContentWidth }} className={`border-b border-gray-200 dark:border-gray-700`}>
          <div className={`flex min-w-full items-center`}>
            {/* Checkbox placeholder */}
            {showSelection && (
              <div
                style={{ width: CHECKBOX_COLUMN_WIDTH }}
                className={`flex flex-shrink-0 items-center justify-center border-r border-gray-200 dark:border-gray-700`}
              >
                <div className={`h-4 w-4 animate-pulse rounded bg-gray-200 dark:bg-gray-700`} />
              </div>
            )}
            {columns.map((column) => {
              const width = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
              return (
                <div
                  key={column}
                  style={{ width }}
                  className={`flex-shrink-0 border-r border-gray-200 px-3 py-2 last:border-r-0 dark:border-gray-700`}
                >
                  <div className={`h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-700`} />
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...style, minWidth: totalContentWidth }} className={cn(`border-b border-gray-200 dark:border-gray-700`, isSelected && `bg-blue-50 dark:bg-blue-900/30`)}>
        <div className={`flex h-full min-w-full`}>
          {/* Checkbox column */}
          {showSelection && (
            <div
              style={{ width: CHECKBOX_COLUMN_WIDTH }}
              className={`flex flex-shrink-0 items-center justify-center border-r border-gray-200 dark:border-gray-700`}
            >
              <input
                type={`checkbox`}
                checked={isSelected}
                onChange={(event) => onRowSelect?.(index, event.target.checked)}
                className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700`}
              />
            </div>
          )}
          {columns.map((column) => {
            const width = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
            const isEditing = editingCell?.rowIndex === index && editingCell?.column === column;
            const columnInfo = this.props.schema?.columns.find((c) => c.name === column);
            const dataType = columnInfo?.dataType?.toUpperCase() || ``;
            const isBooleanColumn = dataType.includes(`BOOLEAN`) || dataType.includes(`BOOL`);
            const isDateTimeColumn = dataType.includes(`DATETIME`) || dataType.includes(`TIMESTAMP`);
            const cellValue = row[column];

            return (
              <div
                key={column}
                style={{ width }}
                className={cn(
                  `flex flex-shrink-0 items-center overflow-hidden border-r border-gray-200 px-1 last:border-r-0 dark:border-gray-700`,
                  isEditing && `bg-blue-500/10 ring-1 ring-inset ring-blue-500`
                )}
              >
                {isBooleanColumn ? (
                  <div className={`flex w-full items-center justify-center`}>
                    <input
                      type={`checkbox`}
                      checked={this.isTruthy(cellValue)}
                      onChange={() => this.handleBooleanToggle(index, column, cellValue)}
                      className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700`}
                    />
                  </div>
                ) : isEditing && isDateTimeColumn ? (
                  <div className={`flex h-full w-full items-center gap-1`}>
                    <input
                      type={`text`}
                      value={editingCell.value}
                      onChange={this.handleEditChange}
                      onKeyDown={this.handleEditKeyDown}
                      onBlur={this.handleEditSave}
                      autoFocus
                      className={`h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-sm text-gray-900 focus:outline-none dark:text-gray-100`}
                    />
                    <input
                      type={`datetime-local`}
                      ref={this.dateTimeInputReference}
                      value={this.formatDateTimeForInput(editingCell.value)}
                      onChange={this.handleDateTimeInputChange}
                      className={`sr-only`}
                    />
                    <button
                      type={`button`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        this.handleShowDatePicker();
                      }}
                      className={`flex h-6 w-6 flex-shrink-0 cursor-pointer items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700`}
                    >
                      <Calendar size={16} className={`text-gray-500 dark:text-gray-400`} />
                    </button>
                  </div>
                ) : isEditing ? (
                  <input
                    type={`text`}
                    value={editingCell.value}
                    onChange={this.handleEditChange}
                    onKeyDown={this.handleEditKeyDown}
                    onBlur={this.handleEditSave}
                    autoFocus
                    className={`h-full w-full border-0 bg-transparent px-1 text-sm text-gray-900 focus:outline-none dark:text-gray-100`}
                  />
                ) : (
                  <button
                    onClick={() => this.handleCellClick(index, column)}
                    className={`w-full truncate px-2 text-left text-sm text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400`}
                  >
                    {this.renderCell(cellValue, column, index)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  private renderHeader = (): React.ReactElement => {
    const { columns, sortBy, sortOrder, schema, onSort, rows, selectedRows, onSelectAll, onRowSelect, total } = this.props;
    const { columnWidths, scrollLeft } = this.state;

    // Use total for "all selected" check to account for unloaded rows
    const totalCount = total ?? rows.length;
    const allSelected = totalCount > 0 && selectedRows && selectedRows.size === totalCount;
    const someSelected = selectedRows && selectedRows.size > 0 && selectedRows.size < totalCount;
    const showSelection = !!onRowSelect;

    return (
      <div
        className={`sticky top-0 z-10 overflow-hidden border-b-2 border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800`}
        style={{ height: HEADER_HEIGHT }}
      >
        <div
          className={`flex h-full`}
          style={{ marginLeft: -scrollLeft }}
        >
        {/* Checkbox column header */}
        {showSelection && (
          <div
            style={{ width: CHECKBOX_COLUMN_WIDTH }}
            className={`flex flex-shrink-0 items-center justify-center border-r border-gray-300 dark:border-gray-600`}
          >
            <input
              type={`checkbox`}
              checked={allSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someSelected ?? false;
                }
              }}
              onChange={(event) => onSelectAll?.(event.target.checked)}
              className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700`}
            />
          </div>
        )}
        {columns.map((column) => {
          const width = columnWidths[column] || DEFAULT_COLUMN_WIDTH;
          const isSorted = sortBy === column;
          const columnInfo = schema?.columns.find((c) => c.name === column);

          return (
            <div
              key={column}
              style={{ width }}
              className={`relative h-full flex-shrink-0 border-r border-gray-300 last:border-r-0 dark:border-gray-600`}
            >
              <div className={`flex h-full items-center justify-center px-3`}>
                <button
                  onClick={() => onSort?.(column)}
                  className={`flex-1 text-left font-semibold text-gray-900 hover:text-blue-600 dark:text-gray-100 dark:hover:text-blue-400`}
                  disabled={!onSort}
                >
                  <div className={`flex items-center gap-2`}>
                    <span className={`truncate`}>{column}</span>
                    {columnInfo?.isPrimaryKey && (
                      <KeyRound
                        size={14}
                        className={`flex-shrink-0`}
                        title={`Primary Key`}
                      />
                    )}
                    {isSorted && (
                      sortOrder === `ascending` ? (
                        <ArrowUp size={14} className={`flex-shrink-0`} />
                      ) : (
                        <ArrowDown size={14} className={`flex-shrink-0`} />
                      )
                    )}
                  </div>
                  {columnInfo && (
                    <div className={`text-xs font-normal text-gray-500 dark:text-gray-400`}>
                      {columnInfo.dataType}
                    </div>
                  )}
                </button>
              </div>
              <div
                onMouseDown={(event) => this.handleResizeStart(event, column)}
                onDoubleClick={() => this.handleResizeDoubleClick(column)}
                className={`absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize group`}
              >
                <div className={`absolute right-1 top-0 h-full w-0.5 bg-transparent group-hover:bg-blue-500 dark:group-hover:bg-blue-400`} />
              </div>
            </div>
          );
        })}
        </div>
      </div>
    );
  };

  render(): React.ReactNode {
    const { className, rows, columns, total, sortBy, sortOrder, selectedRows } = this.props;
    const { columnWidths, containerWidth, containerHeight, editingCell } = this.state;

    if (rows.length === 0) {
      return (
        <div ref={this.containerReference} className={cn(`flex h-full items-center justify-center`, className)}>
          <div className={`text-center text-gray-500 dark:text-gray-400`}>
            No rows to display.
          </div>
        </div>
      );
    }

    // Wait for container dimensions before rendering the table to prevent flicker
    if (containerWidth === 0 || containerHeight === 0) {
      return (
        <div ref={this.containerReference} className={cn(`h-full`, className)} />
      );
    }

    // Wait for columnWidths to be initialized for current columns to prevent header/body width mismatch
    const columnWidthsValid = columns.length > 0 && columns.every((column) => columnWidths[column] !== undefined);
    if (!columnWidthsValid) {
      return (
        <div ref={this.containerReference} className={cn(`h-full`, className)} />
      );
    }

    const listHeight = Math.max(containerHeight - HEADER_HEIGHT, 100);

    // Use total for itemCount to get proper scrollbar sizing
    const itemCount = total ?? rows.length;

    return (
      <div ref={this.containerReference} className={cn(`flex h-full flex-col`, className)}>
        {this.renderHeader()}
        <div className={`flex-1 overflow-hidden`}>
          <List
            key={`${sortBy ?? ``}-${sortOrder ?? ``}-${total ?? rows.length}-${columns.length}-${rows[0] ? String(Object.values(rows[0])[0]) : ``}`}
            ref={this.listReference}
            outerRef={this.setListOuterElement}
            height={listHeight}
            itemCount={itemCount}
            itemSize={this.getItemSize}
            itemData={{ rows, selectedRows, editingCell, containerWidth }}
            width={containerWidth}
            onScroll={this.handleScroll}
          >
            {this.renderRow}
          </List>
        </div>
      </div>
    );
  }
}

export default VirtualizedTable;
