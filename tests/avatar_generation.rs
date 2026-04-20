//! Integration tests for the 4-image regional-collage avatar flow.
//!
//! Spins up the full Axum router in-process with:
//!   - WireMock servers standing in for Anthropic Messages API and OpenAI Images API
//!   - MemoryProfileStore instead of Cosmos DB
//!
//! No network calls and no database required.
//! Run locally: cargo test --features test-support avatar_generation

#![cfg(feature = "test-support")]

use std::sync::Arc;

use axum::Router;
use chrono::Utc;
use rust_blog::analytics::MemoryProfileStore;
use rust_blog::anthropic::AnthropicClient;
use rust_blog::api::AppState;
use rust_blog::openai_images::OpenAiImagesClient;
use serde_json::json;
use tokio::net::TcpListener;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

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
                "PERSONA: {}\nART_1: Ukiyo-e woodblock indigo waves.\nART_2: Crisp Bauhaus geometry in steel.\nART_3: Midnight watercolour washes.\nART_4: Abstract circuit diagrams in teal.",
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

// ── Setup helpers ─────────────────────────────────────────────────────

/// Spin up router with Anthropic + OpenAI both mocked (4-image collage path).
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

// ── 4-image collage tests ─────────────────────────────────────────────

#[tokio::test]
async fn collage_generates_four_avatar_urls() {
    let (base, anthropic_mock, openai_mock, store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response()),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    // OpenAI is called 4 times (one per image slot).
    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(4)
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

    let urls = body["avatar_urls"].as_array().unwrap();
    assert_eq!(urls.len(), 4, "must return exactly 4 avatar URLs");
    for url in urls {
        assert!(
            url.as_str().unwrap().starts_with("data:image/png;base64,"),
            "each URL must be a data URI"
        );
    }

    // Verify all 4 PNGs stored in the profile.
    let stored = store.get_stored("collage-fp-001").await.unwrap();
    assert!(!stored.avatar_png.is_empty(), "slot 1 must be stored");
    assert!(!stored.avatar_png_2.is_empty(), "slot 2 must be stored");
    assert!(!stored.avatar_png_3.is_empty(), "slot 3 must be stored");
    assert!(!stored.avatar_png_4.is_empty(), "slot 4 must be stored");

    let today_utc = Utc::now().format("%Y-%m-%d").to_string();
    assert_eq!(stored.avatar_session_id, today_utc, "session date must be today");

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_second_request_served_from_cache() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    // Exactly one Anthropic + four OpenAI calls for the first request.
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
        .expect(4)
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
    assert_eq!(second_body["avatar_urls"], first_body["avatar_urls"]);

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
        .expect(4)
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
