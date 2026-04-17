//! Service info routes: `/`, `/ready`, `/v1/info`.
//!
//! These were previously served by the standalone `rust-api` crate. They are
//! now mounted directly in `blog-service` so both the analytics path and the
//! info/health path are served from a single binary.
//!
//! The `service` field in `InfoBody` intentionally retains the value `"rust-api"`
//! for the first deploy cycle so that any downstream consumers of the JSON
//! (e.g. Prism dashboards, alerting rules) are not silently broken.
//! It will be renamed to `"blog-service"` in a follow-up PR once consumers
//! are confirmed to be unaffected.

use axum::{http::StatusCode, Json};
use std::collections::HashMap;

pub async fn root() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "service": "rust-api",
        "message": "ok",
    }))
}

pub async fn ready() -> StatusCode {
    StatusCode::OK
}

pub async fn info() -> Json<serde_json::Value> {
    let mut env: HashMap<String, String> = HashMap::new();
    for key in ["APP_NAME", "ENVIRONMENT", "PRISM_INGEST_URL", "OTEL_SERVICE_NAME"] {
        if let Ok(v) = std::env::var(key) {
            env.insert(key.to_string(), v);
        }
    }
    Json(serde_json::json!({
        "service": "rust-api",
        "version": env!("CARGO_PKG_VERSION"),
        "env": env,
    }))
}
