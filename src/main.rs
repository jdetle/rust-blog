mod blog;
mod rate_limit;

use std::net::SocketAddr;

use axum::{http::StatusCode, middleware, response::Html, routing::get, Router};
use blog::{get_post, list_posts};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

async fn root() -> Result<Html<String>, StatusCode> {
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/root.html");
    std::fs::read_to_string(&path)
        .map(Html)
        .map_err(|_| StatusCode::NOT_FOUND)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "rust_blog=debug,tower_http=debug".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let limiter = rate_limit::create();

    let app = Router::new()
        .route("/", get(root))
        .route("/posts", get(list_posts))
        .route("/posts/:quarter/:slug", get(get_post))
        .layer(middleware::from_fn_with_state(limiter, rate_limit::enforce));

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind TCP listener");

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("server error");
}
