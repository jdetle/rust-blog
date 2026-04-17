//! Integration tests for avatar SVG generation.
//!
//! Spins up the full Axum router in-process with:
//!   - a `wiremock` server standing in for the Anthropic Messages API
//!   - a `MemoryProfileStore` instead of Cosmos DB
//!
//! No network calls to Anthropic and no database required. Runs on every PR via `cargo test`.
//!
//! Run locally:
//!   cargo test --features test-support avatar_generation

#![cfg(feature = "test-support")]

use std::sync::Arc;

use axum::Router;
use rust_blog::analytics::MemoryProfileStore;
use rust_blog::anthropic::AnthropicClient;
use rust_blog::api::AppState;
use serde_json::json;
use tokio::net::TcpListener;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const CANNED_PERSONA: &str = "Probably a curious builder who reads long posts — just a guess.";
const CANNED_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><circle cx="64" cy="64" r="50" fill="#4a90d9"/></svg>"##;

/// A valid Anthropic Messages API response body containing persona + SVG.
fn anthropic_response(persona: &str, svg: &str) -> serde_json::Value {
    json!({
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "content": [{
            "type": "text",
            "text": format!("PERSONA: {}\nSVG: {}", persona, svg)
        }],
        "model": "claude-3-5-sonnet-20241022",
        "stop_reason": "end_turn",
        "usage": { "input_tokens": 10, "output_tokens": 50 }
    })
}

/// Spin up the router with a mock Anthropic server and in-memory store.
/// Returns (base_url, mock_server, profile_store).
async fn setup() -> (String, MockServer, Arc<MemoryProfileStore>) {
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

#[tokio::test]
async fn health_check_returns_ok() {
    let (base, _mock, _store) = setup().await;
    let res = reqwest::get(format!("{base}/health")).await.unwrap();
    assert_eq!(res.status(), 200);
}

#[tokio::test]
async fn generates_avatar_and_stores_it() {
    let (base, mock_server, store) = setup().await;

    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_response(CANNED_PERSONA, CANNED_SVG)),
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

    // Verify persisted to store.
    let stored = store.get_stored("abc123").await.unwrap();
    assert!(!stored.avatar_svg.is_empty());

    mock_server.verify().await;
}

#[tokio::test]
async fn second_request_is_served_from_cache_without_calling_anthropic() {
    let (base, mock_server, _store) = setup().await;

    // Register stub with expect(1) — a second Anthropic call would fail the assertion.
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_response(CANNED_PERSONA, CANNED_SVG)),
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

    // Verify Anthropic was called exactly once.
    mock_server.verify().await;
}

#[tokio::test]
async fn script_injection_in_anthropic_response_returns_bad_gateway() {
    let (base, mock_server, _store) = setup().await;

    let malicious_svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_response(CANNED_PERSONA, malicious_svg)),
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
    let (base, mock_server, _store) = setup().await;

    let malicious_svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<h1>xss</h1>"/></svg>"#;
    Mock::given(method("POST"))
        .and(path("/v1/messages"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(anthropic_response(CANNED_PERSONA, malicious_svg)),
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

#[tokio::test]
async fn missing_fingerprint_returns_bad_request() {
    let (base, _mock, _store) = setup().await;

    let client = reqwest::Client::new();
    let res = client
        .post(format!("{base}/user-profile/generate-avatar"))
        .json(&json!({}))
        .send()
        .await
        .unwrap();

    assert_eq!(res.status(), 400);
}
