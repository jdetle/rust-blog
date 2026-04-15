//! HTTP API for the analytics ingestion service: health check, event ingestion, user event queries, and Vercel drain.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use crate::analytics::{AnalyticsDb, AnalyticsEvent, IncomingEvent};
use crate::avatar;
use crate::forward::PostHogForwarder;
use crate::vercel_drain::VercelDrainPayload;
use serde::Serialize;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<AnalyticsDb>,
    pub posthog: Option<Arc<PostHogForwarder>>,
    /// Used for LLM summary (background) and on-demand SVG avatar generation.
    pub anthropic_api_key: Option<String>,
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

#[derive(serde::Deserialize)]
pub struct UserProfileQuery {
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub distinct_id: String,
    #[serde(default)]
    pub fingerprint: String,
}

#[derive(serde::Deserialize)]
pub struct GenerateAvatarBody {
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub distinct_id: String,
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

pub async fn user_profile(
    State(state): State<AppState>,
    Query(params): Query<UserProfileQuery>,
) -> impl IntoResponse {
    let lookup_id = if !params.user_id.is_empty() {
        params.user_id.clone()
    } else if !params.distinct_id.is_empty() {
        params.distinct_id.clone()
    } else if !params.fingerprint.is_empty() {
        params.fingerprint.clone()
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Provide user_id, distinct_id, or fingerprint"})),
        )
            .into_response();
    };

    match state.db.get_user_profile(&lookup_id).await {
        Ok(Some(profile)) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "summary": profile.llm_summary,
                "updated_at": profile.updated_at,
                "persona_guess": profile.persona_guess,
                "avatar_svg": profile.avatar_svg,
            })),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "summary": null,
                "updated_at": null,
                "persona_guess": null,
                "avatar_svg": null
            })),
        )
            .into_response(),
        Err(e) => {
            tracing::error!(error = %e, "user profile query failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to query profile"})),
            )
                .into_response()
        }
    }
}

/// POST body: fingerprint and/or distinct_id / user_id. Generates a fictional SVG avatar via Anthropic
/// and stores `persona_guess` + `avatar_svg` in `user_profiles`. Idempotent if avatar already set.
pub async fn user_profile_generate_avatar(
    State(state): State<AppState>,
    Json(body): Json<GenerateAvatarBody>,
) -> impl IntoResponse {
    let lookup_id = if !body.user_id.is_empty() {
        body.user_id.clone()
    } else if !body.distinct_id.is_empty() {
        body.distinct_id.clone()
    } else if !body.fingerprint.is_empty() {
        body.fingerprint.clone()
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Provide user_id, distinct_id, or fingerprint"})),
        )
            .into_response();
    };

    let Some(ref api_key) = state.anthropic_api_key else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Avatar generation not configured"})),
        )
            .into_response();
    };

    let prior = state.db.get_user_profile(&lookup_id).await;
    let summary_hint: Option<String> = match &prior {
        Ok(Some(p)) if !p.llm_summary.is_empty() => Some(p.llm_summary.clone()),
        _ => None,
    };

    if let Ok(Some(existing)) = &prior {
        if !existing.avatar_svg.is_empty() {
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": existing.persona_guess,
                    "avatar_svg": existing.avatar_svg,
                    "cached": true
                })),
            )
                .into_response();
        }
    }

    let client = reqwest::Client::new();
    match avatar::generate_fake_avatar(api_key, &lookup_id, summary_hint.as_deref(), &client).await {
        Ok((persona, svg)) => {
            if let Err(e) = state
                .db
                .upsert_persona_avatar(&lookup_id, &persona, &svg)
                .await
            {
                tracing::error!(error = %e, "upsert persona avatar failed");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": "Failed to store avatar"})),
                )
                    .into_response();
            }
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": persona,
                    "avatar_svg": svg,
                    "cached": false
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!(error = %e, "avatar generation failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "Avatar generation failed"})),
            )
                .into_response()
        }
    }
}

pub async fn vercel_drain(
    State(state): State<AppState>,
    Json(payload): Json<VercelDrainPayload>,
) -> impl IntoResponse {
    let events = payload.events();
    let mut stored = 0;
    for ev in events {
        let analytics_ev = ev.to_analytics_event();
        if let Err(e) = state.db.insert_event(&analytics_ev).await {
            tracing::error!(error = %e, "failed to store Vercel drain event");
        } else {
            stored += 1;
        }
    }
    (StatusCode::ACCEPTED, Json(serde_json::json!({ "stored": stored }))).into_response()
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
