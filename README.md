# axum-sql-viewer

[![Crates.io](https://img.shields.io/crates/v/axum-sql-viewer.svg?style=flat)](https://crates.io/crates/axum-sql-viewer)
[![Documentation](https://docs.rs/axum-sql-viewer/badge.svg?style=flat)](https://docs.rs/axum-sql-viewer)
[![License](https://img.shields.io/crates/l/axum-sql-viewer.svg?style=flat)](https://github.com/firstdorsal/axum-sql-viewer/blob/main/LICENSE)

A development tool for viewing and querying SQL databases in web browsers, easily integrable as an Axum layer. Drop in a single line of code to get a full-featured database browser for your application.

> **Note:** Currently supports [SQLite](https://www.sqlite.org/) and [PostgreSQL](https://www.postgresql.org/) databases via [SQLx](https://github.com/launchbadge/sqlx).

> [!WARNING]
> **Development Use Only** - This tool is intended for local development and debugging purposes. It is **not suitable for production** environments because:
>
> - **No authentication** - The viewer is publicly accessible to anyone who can reach the endpoint
> - **Full database access** - Exposes complete schema, data, and allows raw SQL execution (including INSERT/UPDATE/DELETE)
> - **Potential data exposure** - All database contents are viewable through the web interface
>
> If you need production database management, use proper database administration tools with appropriate security controls.

![Table Browser Screenshot](./assets/screenshot-tables.png)

![Query Editor Screenshot](./assets/screenshot-query.png)

## Features

- **Table Browser** - Browse all tables with infinite scrolling and virtual rendering
- **Column Sorting** - Click column headers to sort ascending/descending
- **Column Resizing** - Drag column borders to resize
- **Row Selection** - Select rows for batch operations
- **Schema Viewer** - View table structure, primary keys, foreign keys, and indexes
- **Raw SQL Execution** - Execute arbitrary SQL queries with results display
- **Query History** - Automatically saves executed queries for quick re-use
- **Saved Queries** - Save frequently used queries with custom names
- **Import/Export** - Export saved queries to JSON, import from files
- **Dark/Light Theme** - Toggle between themes based on preference
- **Embedded Frontend** - No separate frontend deployment needed; assets are embedded in the binary

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
axum-sql-viewer = "0.1"
```

### Feature Flags

- `sqlite` - Enable SQLite support (enabled by default)
- `postgres` - Enable PostgreSQL support (enabled by default)

To use only one database:

```toml
[dependencies]
axum-sql-viewer = { version = "0.1", default-features = false, features = ["sqlite"] }
```

## Quick Start

### SQLite

```rust
use axum::{Router, routing::get};
use axum_sql_viewer::SqlViewerLayer;
use sqlx::SqlitePool;

#[tokio::main]
async fn main() {
    let pool = SqlitePool::connect("sqlite:./my_database.db")
        .await
        .unwrap();

    let app = Router::new()
        .route("/", get(|| async { "Hello World" }))
        // Add the SQL viewer at /sql-viewer
        .merge(SqlViewerLayer::sqlite("/sql-viewer", pool).into_router());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();

    println!("SQL Viewer available at http://localhost:3000/sql-viewer");

    axum::serve(listener, app).await.unwrap();
}
```

### PostgreSQL

```rust
use axum::{Router, routing::get};
use axum_sql_viewer::SqlViewerLayer;
use sqlx::PgPool;

#[tokio::main]
async fn main() {
    let pool = PgPool::connect("postgres://user:password@localhost/mydb")
        .await
        .unwrap();

    let app = Router::new()
        .route("/", get(|| async { "Hello World" }))
        .merge(SqlViewerLayer::postgres("/sql-viewer", pool).into_router());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await
        .unwrap();

    axum::serve(listener, app).await.unwrap();
}
```

That's it! Navigate to `http://localhost:3000/sql-viewer` to browse your database.

## Configuration

### Custom Base Path

Mount the viewer at any path:

```rust
SqlViewerLayer::sqlite("/admin/database", pool)  // Viewer at /admin/database
SqlViewerLayer::sqlite("/debug/sql", pool)       // Viewer at /debug/sql
```

## API Endpoints

The following HTTP endpoints are available under your configured base path:

| Endpoint | Method | Description |
| --- | --- | --- |
| `/` | GET | Serves the web dashboard |
| `/api/health` | GET | Health check endpoint |
| `/api/tables` | GET | List all tables in the database |
| `/api/tables/:name` | GET | Get table schema information |
| `/api/tables/:name/rows` | GET | Fetch rows with pagination and sorting |
| `/api/query` | POST | Execute a raw SQL query |

### Query Parameters for `/api/tables/:name/rows`

- `limit` - Number of rows to fetch (default: 100)
- `offset` - Number of rows to skip (default: 0)
- `sort_column` - Column name to sort by
- `sort_order` - Sort direction: `ascending` or `descending`

### Execute Raw Query

```bash
curl -X POST http://localhost:3000/sql-viewer/api/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM users WHERE active = true"}'
```

## Development

### Prerequisites

- Rust 1.70+
- Node.js 18+ and pnpm (for frontend development)

### Building

```bash
# Build the entire project (includes frontend)
cargo build

# Run the example server
cargo run -p example-server
```

### Frontend Development

```bash
cd axum-sql-viewer/frontend
pnpm install
pnpm dev  # Start dev server with hot reload
```

## How It Works

1. **SqlViewerLayer** wraps your SQLx connection pool and provides HTTP endpoints
2. The web dashboard is served as embedded static assets (no external files needed)
3. Database schema is discovered dynamically at runtime
4. Virtual scrolling enables browsing large tables efficiently
5. All state (query history, saved queries, theme) is stored in browser localStorage

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
