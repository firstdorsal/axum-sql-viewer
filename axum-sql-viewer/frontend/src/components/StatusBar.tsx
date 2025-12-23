import { PureComponent } from 'react';

interface StatusBarProps {
  loadedCount: number;
  totalCount: number;
  loading: boolean;
}

interface StatusBarState {}

/**
 * StatusBar - A class-based component that displays the current loading status and row counts.
 * Shows "Showing X of Y rows" with a spinner when loading.
 */
export default class StatusBar extends PureComponent<StatusBarProps, StatusBarState> {
  render() {
    const { loadedCount, totalCount, loading } = this.props;

    return (
      <div className={`flex items-center justify-between border-b border-border bg-background padding-2 text-foreground`}>
        <div className={`flex items-center gap-2`}>
          {loading && (
            <div className={`inline-block`}>
              <svg
                className={`animate-spin`}
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
          )}
          <span className={`text-sm font-medium`}>
            Showing {loadedCount} of {totalCount} rows
          </span>
        </div>
      </div>
    );
  }
}
