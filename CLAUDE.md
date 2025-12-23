# Development

## Frontend Development Server

For development, use the running dev server at http://localhost:5174/

This provides hot module replacement for faster iteration on frontend changes. Do NOT run `pnpm build` during development - the dev server automatically reloads when files change.

## Backend Server

The example server runs at http://127.0.0.1:3000/

- Health check: http://127.0.0.1:3000/api/health
- SQL Viewer: http://127.0.0.1:3000/sql-viewer

## Code Style

- Use React 19 class-based PureComponents
- No abbreviations in code (use `ascending` not `asc`, etc.)
- Use react-window VariableSizeList for virtualized scrolling
