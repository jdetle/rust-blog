//! Integration test: a user on their second visit gets a summary of their analytics data.
//!
//! Simulates the flow:
//! 1. First visit: user's events are stored
//! 2. Summarization runs (we simulate by directly upserting a profile)
//! 3. Second visit: GET /user-profile returns the summary
//!
//! Requires COSMOS_CONTACT_POINT, COSMOS_USERNAME, COSMOS_PASSWORD.
//! Skip with: cargo test second_visit -- --skip second_visit
//! Run with: cargo test second_visit_summary -- --ignored (when Cosmos is configured)
//! Requires COSMOS_CONTACT_POINT, COSMOS_USERNAME, COSMOS_PASSWORD.

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rust_blog::analytics::{AnalyticsDb, AnalyticsEvent};
use rust_blog::mock::{generate_incoming_events, MockPersona};
use std::sync::Arc;

const TEST_FINGERPRINT: &str = "fp_test_second_visit_001";

fn cosmos_configured() -> bool {
    std::env::var("COSMOS_CONTACT_POINT").is_ok()
        && std::env::var("COSMOS_USERNAME").is_ok()
        && std::env::var("COSMOS_PASSWORD").is_ok()
}

#[tokio::test]
#[ignore] // Requires Cosmos DB; run with: cargo test second_visit_summary -- --ignored
async fn second_visit_returns_summary() {
    dotenvy::dotenv().ok();

    if !cosmos_configured() {
        eprintln!("Skipping: COSMOS_* env vars not set");
        return;
    }

    let contact_point = std::env::var("COSMOS_CONTACT_POINT")
        .unwrap_or_else(|_| "jd-analytics.cassandra.cosmos.azure.com".into());
    let username = std::env::var("COSMOS_USERNAME").unwrap_or_else(|_| "jd-analytics".into());
    let password = std::env::var("COSMOS_PASSWORD").expect("COSMOS_PASSWORD required");

    let db = AnalyticsDb::connect(&contact_point, &username, &password)
        .await
        .expect("connect to Cosmos");
    let db = Arc::new(db);

    let persona = MockPersona {
        fingerprint: TEST_FINGERPRINT.to_string(),
        device_id: 99999999,
        user_agent: "Mozilla/5.0 (test) TestBrowser/1.0".to_string(),
        referrer: "https://example.com/".to_string(),
        page_sequence: vec!["/", "/posts", "/posts/rust-blog"],
        event_types: vec!["pageview", "pageview", "pageview"],
    };

    let mut rng = ChaCha8Rng::seed_from_u64(12345);

    // First visit: store mock events
    let incoming = generate_incoming_events(&persona, 7, &mut rng);
    for ev in &incoming {
        let analytics_ev = AnalyticsEvent::from_incoming(ev.clone(), "test");
        db.insert_event(&analytics_ev).await.expect("insert event");
    }

    // Simulate summarization completed after first visit (LLM produced a summary)
    let summary = "Tech-oriented visitor who found the site via example.com. \
        Browsed the homepage, posts index, and a Rust-related post. \
        Likely interested in software engineering content.";
    db.upsert_user_profile(TEST_FINGERPRINT, summary)
        .await
        .expect("upsert profile");

    // Second visit: user queries their profile and gets the summary
    let profile = db
        .get_user_profile(TEST_FINGERPRINT)
        .await
        .expect("get profile");

    let p = profile.expect("profile should exist");
    assert!(
        !p.llm_summary.is_empty(),
        "second visit should return a summary"
    );
    assert!(
        p.llm_summary.contains("Tech-oriented") || p.llm_summary.contains("visitor"),
        "summary should describe the user; got: {}",
        p.llm_summary
    );
    assert!(p.updated_at > 0, "updated_at should be set");
}
