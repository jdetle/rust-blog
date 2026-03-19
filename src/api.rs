//! HTTP API for the analytics ingestion service: health check, event ingestion, and user event queries.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use crate::analytics::{AnalyticsDb, AnalyticsEvent, IncomingEvent};
use crate::forward::PostHogForwarder;
use serde::Serialize;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<AnalyticsDb>,
    pub posthog: Option<Arc<PostHogForwarder>>,
}

#[derive(serde::Deserialize)]
pub struct UserEventsQuery {
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    50
}

#[derive(Serialize)]
pub struct UserEventDto {
    pub event_id: String,
    pub event_type: String,
    pub source: String,
    pub page_url: String,
    pub event_time: i64,
    pub event_date: String,
}

impl From<&AnalyticsEvent> for UserEventDto {
    fn from(e: &AnalyticsEvent) -> Self {
        Self {
            event_id: e.event_id.to_string(),
            event_type: e.event_type.clone(),
            source: e.source.clone(),
            page_url: e.page_url.clone(),
            event_time: e.event_time,
            event_date: e.event_date.format("%Y-%m-%d").to_string(),
        }
    }
}

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

pub async fn ingest_event(
    State(state): State<AppState>,
    Json(payload): Json<IncomingEvent>,
) -> impl IntoResponse {
    let event = AnalyticsEvent::from_incoming(payload, "custom");

    if let Err(e) = state.db.insert_event(&event).await {
        tracing::error!(error = %e, "failed to insert event");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Failed to store event"})),
        )
            .into_response();
    }

    if let Some(ref fwd) = state.posthog {
        let forwarder = Arc::clone(fwd);
        let ev = event.clone();
        tokio::spawn(async move {
            forwarder.forward(&ev).await;
        });
    }

    (StatusCode::ACCEPTED, Json(serde_json::json!({"event_id": event.event_id.to_string()})))
        .into_response()
}

pub async fn user_events(
    State(state): State<AppState>,
    Query(params): Query<UserEventsQuery>,
) -> impl IntoResponse {
    let lookup_id = if !params.user_id.is_empty() {
        params.user_id.clone()
    } else if !params.fingerprint.is_empty() {
        params.fingerprint.clone()
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Provide user_id or fingerprint"})),
        )
            .into_response();
    };
    let events: Vec<_> = match state.db.query_events_by_user(&lookup_id, params.limit).await {
        Ok(ev) => ev,
        Err(e) => {
            tracing::error!(error = %e, "user events query failed");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to query events"})),
            )
                .into_response();
        }
    };

    let dtos: Vec<UserEventDto> = events.iter().map(UserEventDto::from).collect();
    (StatusCode::OK, Json(serde_json::json!({ "events": dtos }))).into_response()
}

pub fn cors_layer() -> CorsLayer {
    let origins = [
        "https://jdetle.com".parse().unwrap(),
        "https://www.jdetle.com".parse().unwrap(),
        "http://localhost:3000".parse().unwrap(),
    ];
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods(Any)
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
}
