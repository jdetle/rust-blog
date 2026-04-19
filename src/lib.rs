//! `rust-blog` library crate — shared analytics logic, HTTP handlers, and service assembly.

pub mod aggregate;
pub mod aggregate_mapping;
pub mod analytics;
pub mod anthropic;
pub mod api;
pub mod avatar;
pub mod event_sink;
pub mod forward;
pub mod info;
pub mod mock;
pub mod openai_images;
pub mod summarize;
pub mod vercel_drain;

use axum::{routing::{get, post}, Router};

/// Build the full Axum router from the given application state.
///
/// Exported so that integration tests can construct the same router as the
/// production binary without having to start a Cosmos DB or spawn background tasks.
/// Tests pass `AppState { db: None, anthropic: Some(mock_client), profile_store: Arc::new(MemoryProfileStore::new()), .. }`.
pub fn build_router(state: api::AppState) -> Router {
    Router::new()
        .route("/health", get(api::health))
        .route("/", get(info::root))
        .route("/ready", get(info::ready))
        .route("/v1/info", get(info::info))
        .route("/api/events", post(api::ingest_event))
        .route("/api/drain/vercel", post(api::vercel_drain))
        .route("/user-events", get(api::user_events))
        .route("/user-profile", get(api::user_profile))
        .route(
            "/user-profile/generate-avatar",
            post(api::user_profile_generate_avatar),
        )
        .with_state(state)
        .layer(api::cors_layer())
}
