//! Frontend asset serving
//!
//! This module handles serving the embedded React SPA with proper caching,
//! MIME types, and base path injection for routing.

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use include_dir::{include_dir, Dir};
use std::sync::Arc;

// Embed the frontend dist directory at compile time
static FRONTEND_DISTRIBUTION: Dir = include_dir!("$CARGO_MANIFEST_DIR/frontend/dist");

/// State for frontend serving (stores base path for routing)
#[derive(Clone)]
pub struct FrontendState {
    pub base_path: Arc<String>,
}

impl FrontendState {
    /// Create a new frontend state with the given base path
    pub fn new(base_path: String) -> Self {
        Self {
            base_path: Arc::new(base_path),
        }
    }
}

/// Create a router for serving frontend assets
///
/// This returns a Router that serves:
/// - GET / -> index.html with injected <base href> tag
/// - GET /assets/* -> static assets with long-term caching
///
/// # Arguments
///
/// * `base_path` - The base URL path where the frontend is mounted (e.g., "/sql-viewer")
pub fn create_frontend_router(base_path: String) -> Router {
    let state = FrontendState::new(base_path);

    // Note: Axum 0.8 uses {*wildcard} syntax for wildcard captures
    Router::new()
        .route("/", get(serve_index_page))
        .route("/assets/{*path}", get(serve_static_asset))
        .with_state(state)
}

/// Serve the index.html file at the root path
///
/// This handler serves the main HTML file and injects a <base href> tag
/// to ensure all relative asset paths work correctly regardless of the
/// mount point.
///
/// Caching: max-age=3600 (1 hour) for index.html
async fn serve_index_page(State(state): State<FrontendState>) -> Response {
    // Try to serve embedded index.html, fallback to placeholder
    if let Some(file) = FRONTEND_DISTRIBUTION.get_file("index.html") {
        let mut contents = String::from_utf8_lossy(file.contents()).to_string();

        // Inject base tag with absolute path to make assets work correctly
        // This ensures assets load from the correct base path
        if let Some(head_position) = contents.find("<head>") {
            let insert_position = head_position + "<head>".len();
            let base_tag = format!("\n    <base href=\"{}/\">", state.base_path);
            contents.insert_str(insert_position, &base_tag);
        }

        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "public, max-age=3600") // 1 hour cache
            .body(Body::from(contents))
            .unwrap()
    } else {
        serve_fallback_page()
    }
}

/// Serve static assets with proper MIME types
///
/// This handler serves files from the embedded assets directory with
/// appropriate content types and long-term caching headers.
///
/// Caching: max-age=31536000 (1 year) for static assets
async fn serve_static_asset(Path(path): Path<String>) -> Response {
    // Path already has the wildcard part extracted (e.g., "index-Dm3cA5i_.js")
    // We need to prepend "assets/" to match the embedded directory structure from Vite
    let asset_path = format!("assets/{}", path);

    // Try to serve from embedded assets
    if let Some(file) = FRONTEND_DISTRIBUTION.get_file(&asset_path) {
        let contents = file.contents();
        let mime_type = mime_guess::from_path(&asset_path)
            .first_or_octet_stream()
            .to_string();

        Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, mime_type)
            .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable") // 1 year cache
            .body(Body::from(contents))
            .unwrap()
    } else {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .body(Body::from(format!("Asset not found: {}", asset_path)))
            .unwrap()
    }
}

/// Fallback handler for when frontend assets are not built yet
///
/// This page is shown when the frontend/dist directory is not present
/// or index.html is not found. It provides clear instructions on how
/// to build the frontend.
fn serve_fallback_page() -> Response {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>axum-sql-viewer - Frontend Not Built</title>
    <style>
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 100px auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            margin-top: 0;
            font-size: 2em;
        }
        h2 {
            color: #555;
            font-size: 1.3em;
            margin-top: 30px;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        code {
            background: #f5f5f5;
            padding: 3px 8px;
            border-radius: 4px;
            font-family: 'Courier New', Consolas, monospace;
            font-size: 0.9em;
            color: #e83e8c;
        }
        pre {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 20px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: 'Courier New', Consolas, monospace;
            line-height: 1.5;
        }
        .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .warning strong {
            color: #856404;
            display: block;
            margin-bottom: 8px;
            font-size: 1.1em;
        }
        .warning p {
            color: #856404;
            margin: 0;
        }
        ul {
            line-height: 1.8;
        }
        li code {
            background: #e9ecef;
            color: #495057;
        }
        .info {
            background: #d1ecf1;
            border-left: 4px solid #17a2b8;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
            color: #0c5460;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 axum-sql-viewer</h1>

        <div class="warning">
            <strong>⚠️ Frontend Not Built</strong>
            <p>The frontend has not been built yet. To use axum-sql-viewer, you need to build the React frontend.</p>
        </div>

        <h2>📦 Development Setup</h2>
        <p>To build the frontend during development:</p>
        <pre>cd axum-sql-viewer/frontend
pnpm install
pnpm build</pre>

        <h2>🚀 Using Pre-built Package</h2>
        <div class="info">
            <p>If you're using the crate from crates.io, the frontend should already be included. If you see this message, please report it as a bug on GitHub.</p>
        </div>

        <h2>🔌 API Endpoints</h2>
        <p>The REST API is still available for direct access:</p>
        <ul>
            <li><code>GET /api/tables</code> - List all tables in the database</li>
            <li><code>GET /api/tables/:name</code> - Get table schema information</li>
            <li><code>GET /api/tables/:name/rows</code> - Fetch rows with pagination and filtering</li>
            <li><code>GET /api/tables/:name/count</code> - Get total row count</li>
            <li><code>POST /api/query</code> - Execute raw SQL queries</li>
        </ul>

        <h2>📚 Documentation</h2>
        <p>For more information, visit:</p>
        <ul>
            <li><a href="https://docs.rs/axum-sql-viewer" target="_blank">Documentation on docs.rs</a></li>
            <li><a href="https://github.com/firstdorsal/axum-sql-viewer" target="_blank">GitHub Repository</a></li>
        </ul>

        <h2>⚠️ Security Warning</h2>
        <div class="warning">
            <strong>Development Tool Only</strong>
            <p>This tool exposes your entire database and should NEVER be used in production or on public networks. It has no authentication or authorization built in.</p>
        </div>
    </div>
</body>
</html>
"#;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache") // Don't cache fallback page
        .body(Body::from(html))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frontend_state_creation() {
        let state = FrontendState::new("/sql-viewer".to_string());
        assert_eq!(*state.base_path, "/sql-viewer");
    }

    #[test]
    fn test_mime_type_guessing() {
        use mime_guess::from_path;

        // JavaScript files
        let javascript_mime = from_path("application.js").first_or_octet_stream();
        assert_eq!(javascript_mime.as_ref(), "text/javascript");

        // CSS files
        let css_mime = from_path("styles.css").first_or_octet_stream();
        assert_eq!(css_mime.as_ref(), "text/css");

        // HTML files
        let html_mime = from_path("index.html").first_or_octet_stream();
        assert_eq!(html_mime.as_ref(), "text/html");

        // Image files
        let png_mime = from_path("image.png").first_or_octet_stream();
        assert_eq!(png_mime.as_ref(), "image/png");

        let svg_mime = from_path("icon.svg").first_or_octet_stream();
        assert_eq!(svg_mime.as_ref(), "image/svg+xml");

        // Font files
        let woff2_mime = from_path("font.woff2").first_or_octet_stream();
        assert_eq!(woff2_mime.as_ref(), "font/woff2");
    }

    #[test]
    fn test_fallback_page_has_content() {
        let response = serve_fallback_page();
        assert_eq!(response.status(), StatusCode::OK);

        // Verify content-type header
        let content_type = response.headers().get(header::CONTENT_TYPE);
        assert!(content_type.is_some());
        assert_eq!(content_type.unwrap(), "text/html; charset=utf-8");
    }

    #[test]
    fn test_router_creation() {
        let router = create_frontend_router("/sql-viewer".to_string());
        // Just verify it compiles and can be created
        drop(router);
    }
}
