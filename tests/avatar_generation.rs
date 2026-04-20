//! Integration tests for the single-composite-image avatar flow.
//!
//! Spins up the full Axum router in-process with:
//!   - WireMock servers standing in for Anthropic Messages API and OpenAI Images API
//!   - MemoryProfileStore instead of Cosmos DB
//!
//! No network calls and no database required.
//! Run locally: cargo test --features test-support avatar_generation

#![cfg(feature = "test-support")]

use std::sync::Arc;

use async_trait::async_trait;
use axum::Router;
use chrono::Utc;
use rust_blog::analytics::{MemoryProfileStore, ProfileStore, UserProfile};
use rust_blog::anthropic::AnthropicClient;
use rust_blog::api::AppState;
use rust_blog::openai_images::OpenAiImagesClient;
use serde_json::json;
use tokio::net::TcpListener;
use wiremock::matchers::{method, path};
use wiremock::{Match, Mock, MockServer, Request, ResponseTemplate};

// ── Canned responses ─────────────────────────────────────────────────

const CANNED_PERSONA: &str = "Probably a curious builder who reads long posts — just a guess.";

/// Minimal valid PNG header base64-encoded (1×1 transparent PNG, 68 bytes).
const CANNED_PNG_B64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

fn anthropic_collage_response() -> serde_json::Value {
    json!({
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": format!(
                "PERSONA: {}\nART_DIRECTION: Ukiyo-e indigo woodblock waves meet crisp M3 geometry in silver, midnight watercolour mood, circuit archetype in teal and copper.",
                CANNED_PERSONA
            )
        }],
        "model": "claude-haiku-4-5-20251001",
        "stop_reason": "end_turn",
        "usage": { "input_tokens": 20, "output_tokens": 60 }
    })
}

fn anthropic_observations_response() -> serde_json::Value {
    json!({
        "id": "msg_obs",
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": "• You are browsing from Tokyo, Japan.\n• Your browser is Firefox 124 on macOS.\n• Your GPU is Apple M3.\n• Dark mode is enabled.\n• You are on a residential connection.\n• Your screen is 2560x1664."
        }],
        "model": "claude-haiku-4-5-20251001",
        "stop_reason": "end_turn",
        "usage": { "input_tokens": 15, "output_tokens": 40 }
    })
}

fn openai_image_response(b64: &str) -> serde_json::Value {
    json!({
        "created": 1234567890u64,
        "data": [{ "b64_json": b64 }]
    })
}

struct MissingJsonField(&'static str);

impl Match for MissingJsonField {
    fn matches(&self, request: &Request) -> bool {
        let Ok(body) = serde_json::from_slice::<serde_json::Value>(&request.body) else {
            return false;
        };
        body.get(self.0).is_none()
    }
}

struct FailingProfileStore;

#[async_trait]
impl ProfileStore for FailingProfileStore {
    async fn get_profile(
        &self,
        _id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>> {
        Err("profile lookup failed".into())
    }

    async fn upsert_persona_avatar(
        &self,
        _id: &str,
        _avatar_session_id: &str,
        _persona: &str,
        _png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Err("profile upsert failed".into())
    }
}

// ── Setup helpers ─────────────────────────────────────────────────────

/// Spin up router with Anthropic + OpenAI both mocked (composite image path).
async fn setup_collage() -> (String, MockServer, MockServer, Arc<MemoryProfileStore>) {
    let anthropic_mock = MockServer::start().await;
    let openai_mock = MockServer::start().await;
    let store = Arc::new(MemoryProfileStore::new());
    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = store.clone();

    let anthropic = Arc::new(AnthropicClient::new(
        "test-key".to_string(),
        Some(anthropic_mock.uri()),
    ));
    let openai_url = format!("{}/v1/images/generations", openai_mock.uri());
    let openai = Arc::new(OpenAiImagesClient::new("oai-test-key".to_string(), Some(openai_url)));

    let state = AppState {
        db: None,
        posthog: None,
        anthropic: Some(anthropic),
        openai: Some(openai),
        profile_store,
    };

    let app: Router = rust_blog::build_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (format!("http://{addr}"), anthropic_mock, openai_mock, store)
}

async fn setup_collage_with_store(
    profile_store: Arc<dyn ProfileStore>,
) -> (String, MockServer, MockServer) {
    let anthropic_mock = MockServer::start().await;
    let openai_mock = MockServer::start().await;

    let anthropic = Arc::new(AnthropicClient::new(
        "test-key".to_string(),
        Some(anthropic_mock.uri()),
    ));
    let openai_url = format!("{}/v1/images/generations", openai_mock.uri());
    let openai = Arc::new(OpenAiImagesClient::new("oai-test-key".to_string(), Some(openai_url)));

    let state = AppState {
        db: None,
        posthog: None,
        anthropic: Some(anthropic),
        openai: Some(openai),
        profile_store,
    };

    let app: Router = rust_blog::build_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (format!("http://{addr}"), anthropic_mock, openai_mock)
}

/// Spin up router with only Anthropic mocked (no OpenAI) — used for observations test.
async fn setup_anthropic_only() -> (String, MockServer, Arc<MemoryProfileStore>) {
    let anthropic_mock = MockServer::start().await;
    let store = Arc::new(MemoryProfileStore::new());
    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = store.clone();

    let anthropic = Arc::new(AnthropicClient::new(
        "test-key".to_string(),
        Some(anthropic_mock.uri()),
    ));

    let state = AppState {
        db: None,
        posthog: None,
        anthropic: Some(anthropic),
        openai: None,
        profile_store,
    };

    let app: Router = rust_blog::build_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    (format!("http://{addr}"), anthropic_mock, store)
}

// ── Common tests ──────────────────────────────────────────────────────

#[tokio::test]
async fn health_check_returns_ok() {
    let (base, _amock, _omock, _store) = setup_collage().await;
    let res = reqwest::get(format!("{base}/health")).await.unwrap();
    assert_eq!(res.status(), 200);
}

#[tokio::test]
async fn missing_fingerprint_returns_bad_request() {
    let (base, _amock, _omock, _store) = setup_collage().await;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 400);
}

#[tokio::test]
async fn no_openai_returns_503() {
    let (base, _amock, _store) = setup_anthropic_only().await;
    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": "fp-no-openai" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 503);
}

// ── Single composite image tests ──────────────────────────────────────

#[tokio::test]
async fn single_composite_image_generated() {
    let (base, anthropic_mock, openai_mock, store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    // OpenAI is called exactly once (single composite image).
    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": "collage-fp-001",
            "session_id": "session-aaa",
            "user_context": {
                "city": "Tokyo",
                "country": "Japan",
                "browser": "Firefox 124",
                "languages": "ja"
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));

    let url = body["avatar_url"].as_str().unwrap();
    assert!(url.starts_with("data:image/png;base64,"), "must be a data URI");

    // Verify PNG stored in the profile.
    let stored = store.get_stored("collage-fp-001").await.unwrap();
    assert!(!stored.avatar_png.is_empty(), "avatar_png must be stored");

    let today_utc = Utc::now().format("%Y-%m-%d").to_string();
    assert_eq!(stored.avatar_session_id, today_utc, "session date must be today");

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_generation_uses_gpt_image_default_base64_response() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    // Exactly 1 OpenAI call (single composite); verify no response_format field.
    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .and(MissingJsonField("response_format"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": "gpt-image-default-b64-fp",
            "session_id": "session-default-b64",
            "user_context": {
                "city": "Austin",
                "country": "United States",
                "browser": "Chrome 135"
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert!(
        body["avatar_url"].as_str().unwrap().starts_with("data:image/png;base64,"),
        "must be a data URI"
    );

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_generation_returns_persona_guess_when_images_fail() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    // 1 OpenAI call (single composite), returns billing error.
    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(ResponseTemplate::new(400).set_body_json(json!({
            "error": {
                "message": "Billing hard limit has been reached.",
                "type": "billing_limit_user_error",
                "code": "billing_hard_limit_reached"
            }
        })))
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": "persona-only-fp",
            "session_id": "session-persona-only",
            "user_context": {
                "city": "Austin",
                "country": "United States",
                "browser": "Chrome 135"
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert_eq!(body["image_generation_failed"], true);
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));
    assert_eq!(body["avatar_url"].as_str().unwrap(), "");

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_generation_returns_persona_guess_when_image_validation_fails() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;
    let oversized_b64 = "A".repeat(3 * 1024 * 1024 + 1);

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    // 1 OpenAI call returning an oversized/invalid PNG.
    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(openai_image_response(&oversized_b64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": "persona-validation-fp",
            "session_id": "session-persona-validation",
            "user_context": {
                "city": "Austin",
                "country": "United States",
                "browser": "Chrome 135"
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert_eq!(body["image_generation_failed"], true);
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));
    assert_eq!(body["avatar_url"].as_str().unwrap(), "");

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_second_request_served_from_cache() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    // Exactly one Anthropic + one OpenAI call for the first request.
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let payload = json!({
        "fingerprint": "cache-test-fp",
        "session_id": "session-bbb",
        "user_context": { "city": "Austin", "country": "United States" }
    });

    let first = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(first.status(), 200);
    let first_body: serde_json::Value = first.json().await.unwrap();
    assert_eq!(first_body["cached"], false);

    let second = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(second.status(), 200);
    let second_body: serde_json::Value = second.json().await.unwrap();
    assert_eq!(second_body["cached"], true);
    assert_eq!(second_body["avatar_url"], first_body["avatar_url"]);

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_same_day_different_session_serves_from_cache() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let fp = "regen-test-fp";

    let first = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": fp, "session_id": "session-ccc", "user_context": { "city": "Lagos", "country": "Nigeria" } }))
        .send()
        .await
        .unwrap();
    assert_eq!(first.status(), 200);
    assert_eq!(first.json::<serde_json::Value>().await.unwrap()["cached"], false);

    // Different session, same day — must be a cache hit.
    let second = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": fp, "session_id": "session-ddd", "user_context": { "city": "Lagos", "country": "Nigeria" } }))
        .send()
        .await
        .unwrap();
    assert_eq!(second.status(), 200);
    assert_eq!(second.json::<serde_json::Value>().await.unwrap()["cached"], true);

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_generation_succeeds_when_profile_store_errors() {
    let (base, anthropic_mock, openai_mock) =
        setup_collage_with_store(Arc::new(FailingProfileStore)).await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": "profile-store-failure-fp",
            "session_id": "session-profile-store-failure",
            "user_context": {
                "city": "Austin",
                "country": "United States",
                "browser": "Chrome 135"
            }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert!(
        body["avatar_url"].as_str().unwrap().starts_with("data:image/png;base64,"),
        "must return a valid data URI even when profile store errors"
    );
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

// ── Observations tests ────────────────────────────────────────────────

#[tokio::test]
async fn observations_endpoint_returns_bullet_list() {
    let (base, anthropic_mock, _store) = setup_anthropic_only().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_observations_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/observations"))
        .json(&json!({
            "fingerprint": "obs-fp",
            "user_context": { "city": "Tokyo", "country": "Japan", "browser": "Firefox 124" }
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    let obs = body["observations"].as_array().unwrap();
    assert_eq!(obs.len(), 6, "must return exactly 6 observations");
    assert!(obs[0].as_str().unwrap().contains("Tokyo"), "first obs must mention Tokyo");

    anthropic_mock.verify().await;
}

#[tokio::test]
async fn observations_without_anthropic_returns_503() {
    // Build a router with NO Anthropic configured.
    let store = Arc::new(MemoryProfileStore::new());
    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = store.clone();
    let state = AppState {
        db: None,
        posthog: None,
        anthropic: None,
        openai: None,
        profile_store,
    };
    let app: Router = rust_blog::build_router(state);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let base = format!("http://{addr}");

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/observations"))
        .json(&json!({ "fingerprint": "x" }))
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 503);
}
