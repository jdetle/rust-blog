//! HTTP API for the blog service: health check, event ingestion, user event queries, and Vercel drain.

use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use tokio::time::{Duration, timeout};
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

const PROFILE_STORE_TIMEOUT: Duration = Duration::from_secs(2);

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
                serde_json::Value::String(format!(
                    "data:image/png;base64,{}",
                    profile.avatar_png
                ))
            } else {
                serde_json::Value::Null
            };
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "summary": profile.llm_summary,
                    "updated_at": profile.updated_at,
                    "persona_guess": profile.persona_guess,
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
/// Requires OpenAI to be configured (503 otherwise). Generates one 1024×1024 composite PNG
/// via gpt-image-1 with persona + fused art-direction derived from Claude Haiku.
/// The image is stored and returned as a data URI.
///
/// Cache: hit when `avatar_png` is non-empty AND `avatar_session_id == today_utc`.
/// One image is generated per calendar day (UTC).
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

    let prior = match timeout(PROFILE_STORE_TIMEOUT, state.profile_store.get_profile(&lookup_id)).await {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(lookup_id = %lookup_id, "profile lookup timed out; continuing without cache");
            Ok(None)
        }
    };
    let prior_persona: Option<String> = match &prior {
        Ok(Some(p)) if !p.persona_guess.is_empty() => Some(p.persona_guess.clone()),
        _ => None,
    };

    // ── Cache check ──────────────────────────────────────────────────
    let today_utc = Utc::now().format("%Y-%m-%d").to_string();

    if let Ok(Some(existing)) = &prior {
        let same_day = existing.avatar_session_id == today_utc;
        if !existing.avatar_png.is_empty() && same_day {
            let url = format!("data:image/png;base64,{}", existing.avatar_png);
            return (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": existing.persona_guess,
                    "avatar_url": url,
                    "cached": true
                })),
            )
                .into_response();
        }
    }

    // ── Activity enrichment (best-effort, 2s timeout) ──────────────────
    let mut ctx = body.user_context.clone();
    if let Some(ref db) = state.db {
        match timeout(
            PROFILE_STORE_TIMEOUT,
            db.query_events_by_user(&lookup_id, 20),
        )
        .await
        {
            Ok(Ok(events)) if !events.is_empty() => {
                ctx.recent_event_count = Some(events.len() as u32);
                let mut seen = std::collections::HashSet::new();
                ctx.recent_paths = events
                    .iter()
                    .filter_map(|e| {
                        // Extract path from page_url, skipping root "/"
                        let url = &e.page_url;
                        let path = if let Some(idx) = url.find("://") {
                            let after_scheme = &url[idx + 3..];
                            after_scheme
                                .find('/')
                                .map(|i| after_scheme[i..].to_string())
                                .unwrap_or_else(|| "/".to_string())
                        } else {
                            url.clone()
                        };
                        if path == "/" || path.is_empty() {
                            None
                        } else {
                            Some(path)
                        }
                    })
                    .filter(|p| seen.insert(p.clone()))
                    .take(5)
                    .collect();
                ctx.last_event_type = events.first().map(|e| e.event_type.clone());
                if events.len() >= 2 {
                    let latest = events.iter().map(|e| e.event_time).max().unwrap_or(0);
                    let earliest = events.iter().map(|e| e.event_time).min().unwrap_or(0);
                    let mins = ((latest - earliest) / 60_000) as u32;
                    if mins > 0 {
                        ctx.session_minutes = Some(mins);
                    }
                }
            }
            Err(_) => {
                tracing::warn!(
                    lookup_id = %lookup_id,
                    "activity query timed out; continuing without enrichment"
                );
            }
            _ => {}
        }
    }

    // ── Generate composite image ──────────────────────────────────────
    let fp = body.fingerprint.as_str();
    match avatar::generate_regional_collage(openai, anthropic, fp, &ctx, prior_persona.as_deref())
        .await
    {
        Ok(result) => {
            if result.image_generation_failed {
                if let Some(image_error) = result.image_error {
                    tracing::warn!(error = %image_error, "composite image generation failed");
                }
                return (
                    StatusCode::OK,
                    Json(serde_json::json!({
                        "persona_guess": result.persona,
                        "avatar_url": "",
                        "cached": false,
                        "image_generation_failed": true
                    })),
                )
                    .into_response();
            }

            let Some(png) = result.png else {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({"error": "Avatar generation failed"})),
                )
                    .into_response();
            };

            match timeout(
                PROFILE_STORE_TIMEOUT,
                state
                    .profile_store
                    .upsert_persona_avatar(&lookup_id, &today_utc, &result.persona, &png),
            )
            .await
            {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::warn!(error = %e, "upsert avatar failed; returning uncached result");
                }
                Err(_) => {
                    tracing::warn!(
                        lookup_id = %lookup_id,
                        "avatar upsert timed out; returning uncached result"
                    );
                }
            }
            let url = format!("data:image/png;base64,{png}");
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "persona_guess": result.persona,
                    "avatar_url": url,
                    "cached": false
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!(error = %e, "composite image generation failed");
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
