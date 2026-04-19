//! HTTP API for the blog service: health check, event ingestion, user event queries, and Vercel drain.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
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
            let avatar_url = if !profile.avatar_png.is_empty() {
                Some(format!("data:image/png;base64,{}", profile.avatar_png))
            } else {
                None
            };
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "summary": profile.llm_summary,
                    "updated_at": profile.updated_at,
                    "persona_guess": profile.persona_guess,
                    "avatar_svg": if profile.avatar_svg.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(profile.avatar_svg) },
                    "avatar_url": avatar_url,
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
                "avatar_svg": null,
                "avatar_url": null,
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
/// If OpenAI is configured, generates a 1024×1024 regional-artist collage PNG via gpt-image-1
/// (with persona derived from Claude Haiku). Otherwise falls back to the legacy SVG path.
///
/// Cache logic: a hit occurs when `existing.avatar_png` is non-empty AND either:
///   - `body.session_id` is empty (fall back to fingerprint-level: any existing PNG is reused), or
///   - `existing.avatar_session_id == body.session_id` (same PostHog session).
/// A new session always forces regeneration.
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

    let prior = state.profile_store.get_profile(&lookup_id).await;
    let summary_hint: Option<String> = match &prior {
        Ok(Some(p)) if !p.llm_summary.is_empty() => Some(p.llm_summary.clone()),
        _ => None,
    };
    let prior_persona: Option<String> = match &prior {
        Ok(Some(p)) if !p.persona_guess.is_empty() => Some(p.persona_guess.clone()),
        _ => None,
    };

    // ── Cache check ──────────────────────────────────────────────────
    if let Ok(Some(existing)) = &prior {
        let has_png = !existing.avatar_png.is_empty();
        let has_svg = !existing.avatar_svg.is_empty();

        if state.openai.is_some() {
            // New path: cache on PNG + session match.
            let same_session = body.session_id.is_empty()
                || existing.avatar_session_id == body.session_id;
            if has_png && same_session {
                let avatar_url =
                    format!("data:image/png;base64,{}", existing.avatar_png);
                return (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "persona_guess": existing.persona_guess,
                        "avatar_url": avatar_url,
                        "avatar_svg": serde_json::Value::Null,
                        "cached": true
                    })),
                )
                    .into_response();
            }
        } else {
            // Legacy path: cache on any existing SVG (original behaviour).
            if has_svg {
                return (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "persona_guess": existing.persona_guess,
                        "avatar_svg": existing.avatar_svg,
                        "avatar_url": serde_json::Value::Null,
                        "cached": true
                    })),
                )
                    .into_response();
            }
        }
    }

    // ── Generate ─────────────────────────────────────────────────────
    if let Some(ref openai) = state.openai {
        // New regional-collage path.
        let fp = body.fingerprint.as_str();
        let ctx = &body.user_context;
        match avatar::generate_regional_collage(
            openai,
            anthropic,
            fp,
            ctx,
            prior_persona.as_deref(),
        )
        .await
        {
            Ok((persona, data_uri)) => {
                // Strip the data-URI prefix before storing (only the raw b64 goes in DB).
                let png_b64 = data_uri
                    .strip_prefix("data:image/png;base64,")
                    .unwrap_or(&data_uri)
                    .to_string();
                if let Err(e) = state
                    .profile_store
                    .upsert_persona_avatar(
                        &lookup_id,
                        &body.session_id,
                        &persona,
                        &png_b64,
                        "",
                    )
                    .await
                {
                    tracing::error!(error = %e, "upsert persona avatar (png) failed");
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
                        "avatar_url": format!("data:image/png;base64,{png_b64}"),
                        "avatar_svg": serde_json::Value::Null,
                        "cached": false
                    })),
                )
                    .into_response()
            }
            Err(e) => {
                tracing::warn!(error = %e, "regional collage generation failed");
                (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({"error": "Avatar generation failed"})),
                )
                    .into_response()
            }
        }
    } else {
        // Legacy SVG path.
        match avatar::generate_fake_avatar(anthropic, &lookup_id, summary_hint.as_deref()).await {
            Ok((persona, svg)) => {
                if let Err(e) = state
                    .profile_store
                    .upsert_persona_avatar(&lookup_id, "", &persona, "", &svg)
                    .await
                {
                    tracing::error!(error = %e, "upsert persona avatar (svg) failed");
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
                        "avatar_url": serde_json::Value::Null,
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
