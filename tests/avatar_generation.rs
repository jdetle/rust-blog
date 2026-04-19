//! Integration tests for avatar generation — both legacy SVG path and new regional-collage PNG path.
//!
//! Spins up the full Axum router in-process with:
//!   - wiremock servers standing in for Anthropic Messages API and OpenAI Images API
//!   - MemoryProfileStore instead of Cosmos DB
//!
//! No network calls and no database required. Runs on every PR via `cargo test --features test-support`.
//!
//! Run locally:
//!   cargo test --features test-support avatar_generation

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
const CANNED_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><circle cx="64" cy="64" r="50" fill="#4a90d9"/></svg>"##;

/// Minimal valid PNG header base64-encoded (1×1 transparent PNG, 68 bytes).
const CANNED_PNG_B64: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

fn anthropic_svg_response(persona: &str, svg: &str) -> serde_json::Value {
    json!({
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": format!("PERSONA: {}\nSVG: {}", persona, svg)
        }],
        "model": "claude-haiku-4-5-20251001",
        "stop_reason": "end_turn",
        "usage": { "input_tokens": 10, "output_tokens": 50 }
    })
}

fn anthropic_collage_response(persona: &str, art_direction: &str) -> serde_json::Value {
    json!({
        "id": "msg_test2",
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": format!("PERSONA: {}\nART_DIRECTION: {}", persona, art_direction)
        }],
        "model": "claude-haiku-4-5-20251001",
        "stop_reason": "end_turn",
        "usage": { "input_tokens": 12, "output_tokens": 30 }
    })
}

fn openai_image_response(b64: &str) -> serde_json::Value {
    json!({
        "created": 1234567890u64,
        "data": [{ "b64_json": b64 }]
    })
}

// ── Setup helpers ─────────────────────────────────────────────────────

/// Spin up router with legacy SVG path (no OpenAI). Returns (base_url, anthropic_mock, store).
async fn setup_legacy() -> (String, MockServer, Arc<MemoryProfileStore>) {
    let mock_server = MockServer::start().await;
    let store = Arc::new(MemoryProfileStore::new());
    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = store.clone();

    let anthropic = Arc::new(AnthropicClient::new(
        "test-key".to_string(),
        Some(mock_server.uri()),
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

    (format!("http://{addr}"), mock_server, store)
}

/// Spin up router with new PNG collage path (Anthropic + OpenAI mocked).
/// Returns (base_url, anthropic_mock, openai_mock, store).
async fn setup_collage() -> (String, MockServer, MockServer, Arc<MemoryProfileStore>) {
    let anthropic_mock = MockServer::start().await;
    let openai_mock = MockServer::start().await;
    let store = Arc::new(MemoryProfileStore::new());
    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = store.clone();

    let anthropic = Arc::new(AnthropicClient::new(
        "test-key".to_string(),
        Some(anthropic_mock.uri()),
    ));
    // OpenAI client points at the mock server's base URL with the images path.
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

// ── Common tests ──────────────────────────────────────────────────────

#[tokio::test]
async fn health_check_returns_ok() {
    let (base, _mock, _store) = setup_legacy().await;
    let res = reqwest::get(format!("{base}/health")).await.unwrap();
    assert_eq!(res.status(), 200);
}

#[tokio::test]
async fn missing_fingerprint_returns_bad_request() {
    let (base, _mock, _store) = setup_legacy().await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 400);
}

// ── Legacy SVG tests ──────────────────────────────────────────────────

#[tokio::test]
async fn legacy_generates_svg_avatar_and_stores_it() {
    let (base, mock_server, store) = setup_legacy().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_svg_response(CANNED_PERSONA, CANNED_SVG)),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": "abc123" }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 200);
    let body: serde_json::Value = res.json().await.unwrap();
    assert_eq!(body["cached"], false);
    assert!(body["avatar_svg"].as_str().unwrap().starts_with("<svg"));
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));
    assert_eq!(body["avatar_url"], serde_json::Value::Null);

    let stored = store.get_stored("abc123").await.unwrap();
    assert!(!stored.avatar_svg.is_empty());

    mock_server.verify().await;
}

#[tokio::test]
async fn legacy_second_request_served_from_cache() {
    let (base, mock_server, _store) = setup_legacy().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_svg_response(CANNED_PERSONA, CANNED_SVG)),
        )
        .expect(1)
        .mount(&mock_server)
        .await;

    let client = reqwest::Client::new();
    let payload = json!({ "fingerprint": "idempotent-fp" });

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
    assert_eq!(second_body["avatar_svg"], first_body["avatar_svg"]);

    mock_server.verify().await;
}

#[tokio::test]
async fn script_injection_in_anthropic_response_returns_bad_gateway() {
    let (base, mock_server, _store) = setup_legacy().await;

    let malicious_svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_svg_response(CANNED_PERSONA, malicious_svg)),
        )
        .mount(&mock_server)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": "bad-svg-fp" }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 502);
}

#[tokio::test]
async fn data_uri_in_svg_href_returns_bad_gateway() {
    let (base, mock_server, _store) = setup_legacy().await;

    let malicious_svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<h1>xss</h1>"/></svg>"#;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_svg_response(CANNED_PERSONA, malicious_svg)),
        )
        .mount(&mock_server)
        .await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({ "fingerprint": "data-uri-fp" }))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 502);
}

// ── Regional collage PNG tests ─────────────────────────────────────────

#[tokio::test]
async fn collage_generates_png_avatar_url() {
    let (base, anthropic_mock, openai_mock, store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response(
                CANNED_PERSONA,
                "Ukiyo-e woodblock waves in indigo",
            )),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(openai_image_response(CANNED_PNG_B64)),
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
    let avatar_url = body["avatar_url"].as_str().unwrap();
    assert!(avatar_url.starts_with("data:image/png;base64,"));
    assert_eq!(body["avatar_svg"], serde_json::Value::Null);
    assert!(body["persona_guess"].as_str().unwrap().contains("curious builder"));

    let stored = store.get_stored("collage-fp-001").await.unwrap();
    assert!(!stored.avatar_png.is_empty());
    // avatar_session_id now holds the UTC date (YYYY-MM-DD) for daily caching.
    let today_utc = Utc::now().format("%Y-%m-%d").to_string();
    assert_eq!(stored.avatar_session_id, today_utc);

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_same_session_returns_from_cache_without_api_calls() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response(
                CANNED_PERSONA,
                "Austin psychedelic concert-poster geometry",
            )),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(openai_image_response(CANNED_PNG_B64)),
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

    // Same session_id — should return cached (no further API calls).
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

    // Verify Anthropic + OpenAI each called exactly once.
    anthropic_mock.verify().await;
    openai_mock.verify().await;
}

#[tokio::test]
async fn collage_same_day_different_session_serves_from_cache() {
    let (base, anthropic_mock, openai_mock, _store) = setup_collage().await;

    // Expect exactly ONE Anthropic + ONE OpenAI call: once-per-day cache means
    // the second request (different PostHog session, same calendar day) is served
    // from the stored PNG without calling either API again.
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(anthropic_collage_response(
                CANNED_PERSONA,
                "Lagos Afrobeats album-art brightness",
            )),
        )
        .expect(1)
        .mount(&anthropic_mock)
        .await;

    Mock::given(method("POST"))
        .and(path("/v1/images/generations"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(openai_image_response(CANNED_PNG_B64)),
        )
        .expect(1)
        .mount(&openai_mock)
        .await;

    let client = reqwest::Client::new();
    let fp = "regen-test-fp";

    // First visit — session-ccc.
    let first = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": fp,
            "session_id": "session-ccc",
            "user_context": { "city": "Lagos", "country": "Nigeria" }
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(first.status(), 200);
    assert_eq!(first.json::<serde_json::Value>().await.unwrap()["cached"], false);

    // Second visit — different session (session-ddd) same day — must be a cache hit.
    let second = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({
            "fingerprint": fp,
            "session_id": "session-ddd",
            "user_context": { "city": "Lagos", "country": "Nigeria" }
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(second.status(), 200);
    assert_eq!(second.json::<serde_json::Value>().await.unwrap()["cached"], true);

    anthropic_mock.verify().await;
    openai_mock.verify().await;
}
