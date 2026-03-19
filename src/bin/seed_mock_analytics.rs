//! Seeds mock analytics events into the aggregator via HTTP.
//! Run with: cargo run --bin seed-mock-analytics
//! Requires ANALYTICS_API_URL (default http://localhost:8080) and a running aggregator.

use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use rust_blog::mock::{generate_all_incoming_events, generate_all_vercel_drain_payloads};

const DEFAULT_DAYS_BACK: i64 = 14;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let base_url = std::env::var("ANALYTICS_API_URL")
        .unwrap_or_else(|_| "http://localhost:8080".to_string());
    let base_url = base_url.trim_end_matches('/');

    let days_back: i64 = std::env::var("SEED_DAYS_BACK")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_DAYS_BACK);

    let mut rng = ChaCha8Rng::seed_from_u64(42);

    let client = reqwest::Client::new();

    println!("Seeding mock analytics to {} (events over last {} days)", base_url, days_back);

    let use_custom = std::env::var("SEED_USE_CUSTOM").unwrap_or_else(|_| "true".into()) != "false";
    let use_vercel = std::env::var("SEED_USE_VERCEL").unwrap_or_else(|_| "true".into()) != "false";

    if use_custom {
        let events = generate_all_incoming_events(days_back, &mut rng);
        let events_url = format!("{}/api/events", base_url);
        let mut stored = 0;
        for ev in &events {
            let res = client
                .post(&events_url)
                .json(ev)
                .send()
                .await?;
            if res.status().is_success() {
                stored += 1;
            } else {
                eprintln!("POST {} failed: {}", events_url, res.status());
            }
        }
        println!("  Custom /api/events: {} events sent", stored);
    }

    if use_vercel {
        let payloads = generate_all_vercel_drain_payloads(days_back, &mut rng);
        let drain_url = format!("{}/api/drain/vercel", base_url);
        let mut total_stored = 0;
        for payload in &payloads {
            let res = client
                .post(&drain_url)
                .json(payload)
                .send()
                .await?;
            if res.status().is_success() {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    total_stored += json.get("stored").and_then(|v| v.as_u64()).unwrap_or(0);
                }
            } else {
                eprintln!("POST {} failed: {}", drain_url, res.status());
            }
        }
        println!("  Vercel drain: {} events stored", total_stored);
    }

    println!("Done.");
    Ok(())
}
