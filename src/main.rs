mod blog;

use std::net::SocketAddr;

use axum::{response::Html, routing::get, Router};
use blog::{get_post, list_posts};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

async fn root() -> Html<String> {
    // Load the root HTML from disk; if it fails, fall back to a simple string.
    let html = std::fs::read_to_string("src/root.html").unwrap_or_else(|_| "Rust Blog".to_string());
    Html(html)
}

#[tokio::main]
async fn main() {
    // Set up basic logging
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "rust_blog=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Build our application with some routes
    let app = Router::new()
        .route("/posts", get(list_posts))
        .route("/posts/:id", get(get_post))
        .route("/", get(root));

    // Run it
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    tracing::info!("listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");

    axum::serve(listener, app)
        .await
        .expect("server error");
}


