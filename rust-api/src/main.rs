//! rust-api — minimal HTTP service for Azure Container Apps (see `scripts/deploy-rust-api.sh`).

use std::collections::HashMap;
use std::net::SocketAddr;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
struct AppState {
    service_name: &'static str,
}

#[derive(Serialize)]
struct HealthBody<'a> {
    status: &'a str,
    service: &'a str,
}

#[derive(Serialize)]
struct InfoBody {
    service: String,
    version: String,
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    env: HashMap<String, String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("rust_api=info".parse()?)
                .add_directive("tower_http=info".parse()?),
        )
        .json()
        .init();

    let state = AppState {
        service_name: "rust-api",
    };

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/v1/info", get(info))
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "rust_api listening");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn root(State(s): State<AppState>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": s.service_name,
        "message": "ok",
    }))
}

async fn health(State(s): State<AppState>) -> Json<HealthBody<'static>> {
    Json(HealthBody {
        status: "ok",
        service: s.service_name,
    })
}

async fn ready() -> StatusCode {
    StatusCode::OK
}

async fn info(State(s): State<AppState>) -> Json<InfoBody> {
    let mut env = HashMap::new();
    for key in ["APP_NAME", "ENVIRONMENT", "PRISM_INGEST_URL", "OTEL_SERVICE_NAME"] {
        if let Ok(v) = std::env::var(key) {
            env.insert(key.to_string(), v);
        }
    }
    Json(InfoBody {
        service: s.service_name.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        env,
    })
}
