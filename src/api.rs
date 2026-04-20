//! HTTP API for the blog service: health check, event ingestion, user event queries, and Vercel drain.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use crate::analytics::{AnalyticsDb, AnalyticsEvent, IncomingEvent, ProfileStore};
use crate::anthropic::AnthropicClient;
use crate::avatar::{self, UserContext};
use crate::forward::PostHogForwarder;
use crate::openai_images::OpenAiImagesClient;
use crate::vercel_drain::VercelDrainPayload;
use serde::Serialize;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

/// Application state shared across all handlers.
///
/// `db` is `None` only in test mode (`test-support` feature + `BLOG_SERVICE_DB=memory`),
/// where only the avatar handler is exercised and the full Cosmos DB is not available.
/// Handlers that require `db` return 503 when it is absent rather than panicking.
#[derive(Clone)]
pub struct AppState {
    pub db: Option<Arc<AnalyticsDb>>,
    pub posthog: Option<Arc<PostHogForwarder>>,
    /// Shared Anthropic client for persona derivation and session summarization.
    pub anthropic: Option<Arc<AnthropicClient>>,
    /// OpenAI Images client for regional-collage PNG generation.
    /// When `None`, the handler falls back to the legacy SVG path via Anthropic.
    pub openai: Option<Arc<OpenAiImagesClient>>,
    /// Profile storage used exclusively by the avatar handler; swappable for tests.
    pub profile_store: Arc<dyn ProfileStore>,
}

/// Convenience macro: returns 503 if `db` is not configured.
macro_rules! require_db {
    ($state:expr) => {
        match $state.db.as_ref() {
            Some(db) => db,
            None => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(serde_json::json!({"error": "Database not configured"})),
                )
                    .into_response()
            }
        }
    };
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
    /// PostHog session ID — used for per-session cache invalidation.
    #[serde(default)]
    pub session_id: String,
    /// Rich browser/edge signals forwarded from the client for prompt enrichment.
    #[serde(default)]
    pub user_context: UserContext,
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
    let db = require_db!(state);
    let event = AnalyticsEvent::from_incoming(payload, "custom");

    if let Err(e) = db.insert_event(&event).await {
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
    let db = require_db!(state);
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
    let events: Vec<_> = match db.query_events_by_user(&lookup_id, params.limit).await {
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
    let db = require_db!(state);
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

    match db.get_user_profile(&lookup_id).await {
        Ok(Some(profile)) => {
            let avatar_urls = if !profile.avatar_png.is_empty() {
                serde_json::Value::Array(
                    profile_to_avatar_urls(&profile)
                        .into_iter()
                        .map(|u| match u {
                            Some(s) => serde_json::Value::String(s),
                            None => serde_json::Value::Null,
                        })
                        .collect(),
                )
            } else {
                serde_json::Value::Null
            };
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "summary": profile.llm_summary,
                    "updated_at": profile.updated_at,
                    "persona_guess": profile.persona_guess,
                    "avatar_urls": avatar_urls,
                })),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "summary": null,
                "updated_at": null,
                "persona_guess": null,
                "avatar_urls": null,
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

/// POST body: fingerprint and/or distinct_id / user_id, optional session_id + user_context.
///
/// Requires OpenAI to be configured (503 otherwise). Generates four 1024×1024 regional-artist
/// collage PNGs via gpt-image-1 in parallel, with persona + art-directions derived from
/// Claude Haiku. All four images are stored and returned as data URIs.
///
/// Cache: hit when slot 1 (`avatar_png`) is non-empty AND `avatar_session_id == today_utc`.
/// One set of four images is generated per calendar day (UTC).
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

    let Some(ref anthropic) = state.anthropic else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Avatar generation not configured"})),
        )
            .into_response();
    };

    let Some(ref openai) = state.openai else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "OpenAI not configured — 4-image collage requires gpt-image-1"})),
        )
            .into_response();
    };

    let prior = state.profile_store.get_profile(&lookup_id).await;
    let prior_persona: Option<String> = match &prior {
        Ok(Some(p)) if !p.persona_guess.is_empty() => Some(p.persona_guess.clone()),
        _ => None,
    };

    // ── Cache check ──────────────────────────────────────────────────
    let today_utc = Utc::now().format("%Y-%m-%d").to_string();

    if let Ok(Some(existing)) = &prior {
        let same_day = existing.avatar_session_id == today_utc;
        if !existing.avatar_png.is_empty() && same_day {
            let urls = profile_to_avatar_urls(existing);
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": existing.persona_guess,
                    "avatar_urls": urls,
                    "cached": true
                })),
            )
                .into_response();
        }
    }

    // ── Generate 4 images ────────────────────────────────────────────
    let fp = body.fingerprint.as_str();
    let ctx = &body.user_context;
    match avatar::generate_regional_collage(openai, anthropic, fp, ctx, prior_persona.as_deref())
        .await
    {
        Ok((persona, pngs)) => {
            if let Err(e) = state
                .profile_store
                .upsert_persona_avatar(&lookup_id, &today_utc, &persona, &pngs)
                .await
            {
                tracing::error!(error = %e, "upsert 4-image avatar failed");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": "Failed to store avatar"})),
                )
                    .into_response();
            }
            let urls: Vec<String> = pngs
                .iter()
                .map(|b| format!("data:image/png;base64,{b}"))
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": persona,
                    "avatar_urls": urls,
                    "cached": false
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!(error = %e, "4-image collage generation failed");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": "Avatar generation failed"})),
            )
                .into_response()
        }
    }
}

/// POST body for the observations endpoint.
#[derive(serde::Deserialize)]
pub struct ObservationsBody {
    #[serde(default)]
    pub fingerprint: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub distinct_id: String,
    #[serde(default)]
    pub user_context: UserContext,
}

/// POST /user-profile/observations — returns 6 factual bullet observations about the visitor's
/// analytics signals, generated by Claude Haiku. The client reveals these one-by-one during the
/// ~40 s image-generation wait to keep the page alive and interesting.
pub async fn user_profile_observations(
    State(state): State<AppState>,
    Json(body): Json<ObservationsBody>,
) -> impl IntoResponse {
    let Some(ref anthropic) = state.anthropic else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error": "Observation service not configured"})),
        )
            .into_response();
    };

    match avatar::generate_observations(anthropic, &body.user_context).await {
        Ok(observations) => (
            StatusCode::OK,
            Json(serde_json::json!({ "observations": observations })),
        )
            .into_response(),
        Err(e) => {
            tracing::warn!(error = %e, "observations generation failed");
            (
                StatusCode::OK,
                Json(serde_json::json!({ "observations": [] })),
            )
                .into_response()
        }
    }
}

/// Build `avatar_urls` array from a cached profile (all 4 slots as data URIs).
fn profile_to_avatar_urls(p: &crate::analytics::UserProfile) -> Vec<Option<String>> {
    vec![
        if p.avatar_png.is_empty() { None } else { Some(format!("data:image/png;base64,{}", p.avatar_png)) },
        if p.avatar_png_2.is_empty() { None } else { Some(format!("data:image/png;base64,{}", p.avatar_png_2)) },
        if p.avatar_png_3.is_empty() { None } else { Some(format!("data:image/png;base64,{}", p.avatar_png_3)) },
        if p.avatar_png_4.is_empty() { None } else { Some(format!("data:image/png;base64,{}", p.avatar_png_4)) },
    ]
}

pub async fn vercel_drain(
    State(state): State<AppState>,
    Json(payload): Json<VercelDrainPayload>,
) -> impl IntoResponse {
    let db = require_db!(state);
    let events = payload.events();
    let mut stored = 0;
    for ev in events {
        let analytics_ev = ev.to_analytics_event();
        if let Err(e) = db.insert_event(&analytics_ev).await {
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
