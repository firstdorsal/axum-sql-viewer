import { PureComponent } from 'react';

interface ThemeToggleProps {}

interface ThemeToggleState {
  isDarkMode: boolean;
}

/**
 * ThemeToggle - A class-based component that provides dark/light mode toggling.
 * Persists theme preference to localStorage and applies the 'dark' class to document.documentElement.
 */
export default class ThemeToggle extends PureComponent<ThemeToggleProps, ThemeToggleState> {
  private readonly STORAGE_KEY = `axum-sql-viewer:theme`;

  constructor(props: ThemeToggleProps) {
    super(props);
    this.state = {
      isDarkMode: false,
    };
  }

  componentDidMount(): void {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem(this.STORAGE_KEY);

    let isDarkMode = false;

    if (savedTheme) {
      // Use saved preference
      isDarkMode = savedTheme === `dark`;
    } else {
      // Check system preference
      isDarkMode = window.matchMedia(`(prefers-color-scheme: dark)`).matches;
    }

    this.setState({ isDarkMode }, () => {
      this.applyTheme(isDarkMode);
    });
  }

  private applyTheme = (isDarkMode: boolean): void => {
    const htmlElement = document.documentElement;

    if (isDarkMode) {
      htmlElement.classList.add(`dark`);
      localStorage.setItem(this.STORAGE_KEY, `dark`);
    } else {
      htmlElement.classList.remove(`dark`);
      localStorage.setItem(this.STORAGE_KEY, `light`);
    }
  };

  private handleToggleTheme = (): void => {
    const newIsDarkMode = !this.state.isDarkMode;
    this.setState({ isDarkMode: newIsDarkMode }, () => {
      this.applyTheme(newIsDarkMode);
    });
  };

  render() {
    const { isDarkMode } = this.state;

    return (
      <button
        onClick={this.handleToggleTheme}
        className={`inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none`}
        aria-label={isDarkMode ? `Switch to light mode` : `Switch to dark mode`}
        title={isDarkMode ? `Switch to light mode` : `Switch to dark mode`}
      >
        {isDarkMode ? (
          // Sun icon for dark mode (click to switch to light)
          <svg
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
            <circle cx={`12`} cy={`12`} r={`5`}></circle>
            <line x1={`12`} y1={`1`} x2={`12`} y2={`3`}></line>
            <line x1={`12`} y1={`21`} x2={`12`} y2={`23`}></line>
            <line x1={`4.22`} y1={`4.22`} x2={`5.64`} y2={`5.64`}></line>
            <line x1={`18.36`} y1={`18.36`} x2={`19.78`} y2={`19.78`}></line>
            <line x1={`1`} y1={`12`} x2={`3`} y2={`12`}></line>
            <line x1={`21`} y1={`12`} x2={`23`} y2={`12`}></line>
            <line x1={`4.22`} y1={`19.78`} x2={`5.64`} y2={`18.36`}></line>
            <line x1={`18.36`} y1={`5.64`} x2={`19.78`} y2={`4.22`}></line>
          </svg>
        ) : (
          // Moon icon for light mode (click to switch to dark)
          <svg
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
            <path d={`M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z`}></path>
          </svg>
        )}
      </button>
    );
  }
}
