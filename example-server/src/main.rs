use axum::{extract::State, http::StatusCode, routing::get, Router};
use axum_sql_viewer::SqlViewerLayer;
use sqlx::sqlite::SqlitePool;
use tower_http::cors::CorsLayer;

mod database;

#[derive(Clone)]
struct ApplicationState {
    pool: SqlitePool,
}

#[tokio::main]
async fn main() {
    // Initialize SQLite database
    // Use path relative to example-server crate
    let database_url = "sqlite:./data/example.db?mode=rwc";
    let pool = SqlitePool::connect(database_url)
        .await
        .expect("Failed to connect to SQLite database");

    // Run database setup and seed sample data
    database::setup(&pool)
        .await
        .expect("Failed to setup database");

    let application_state = ApplicationState { pool: pool.clone() };

    // Create the Axum application router
    // Note: SqlViewerLayer must be merged before with_state() since it returns a stateless Router
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/api/health", get(health_handler))
        .with_state(application_state)
        .merge(SqlViewerLayer::sqlite("/sql-viewer", pool).into_router())
        .layer(CorsLayer::permissive());

    // Bind to local address and start server
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .expect("Failed to bind to port 3000");

    println!("Server running at http://127.0.0.1:3000");
    println!("Health check at http://127.0.0.1:3000/api/health");
    println!("SQL Viewer available at http://127.0.0.1:3000/sql-viewer");

    axum::serve(listener, app).await.expect("Server error");
}

async fn root_handler() -> &'static str {
    "Welcome to axum-sql-viewer example server"
}

async fn health_handler(
    State(state): State<ApplicationState>,
) -> Result<(StatusCode, &'static str), StatusCode> {
    // Try to verify database connectivity
    sqlx::query("SELECT 1")
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok((StatusCode::OK, "Server is healthy"))
}
