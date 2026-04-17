//! blog-service — unified HTTP API for jdetle.com.
//!
//! Consolidates what was formerly two separate services:
//!   - `analytics-ingestion` (Cosmos DB events, avatar generation, LLM summarization)
//!   - `rust-api`            (health / ready / v1/info skeleton)
//!
//! In production, all env vars must be set. When the `test-support` feature is
//! compiled in (never in production; see Cargo.toml `[features]`) and the env var
//! `BLOG_SERVICE_DB=memory` is set, Cosmos DB connect is skipped and an in-memory
//! profile store is used instead — enabling integration tests without a live database.

use std::net::SocketAddr;
use std::sync::Arc;

use dotenvy::dotenv;
use rust_blog::aggregate::{spawn_aggregation_loop, Aggregator};
use rust_blog::analytics::AnalyticsDb;
use rust_blog::anthropic::AnthropicClient;
use rust_blog::api::AppState;
use rust_blog::forward::PostHogForwarder;
use rust_blog::summarize;
use s10_rust::{S10Client, S10Layer};
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "blog_service=info,tower_http=info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenv().ok();

    // ---------------------------------------------------------------------------
    // Optional in-memory mode for integration tests (test-support feature only).
    // ---------------------------------------------------------------------------
    #[cfg(feature = "test-support")]
    if std::env::var("BLOG_SERVICE_DB").as_deref() == Ok("memory") {
        return run_memory_mode().await;
    }

    // ---------------------------------------------------------------------------
    // Production: real Cosmos DB + aggregation + summarization.
    // ---------------------------------------------------------------------------
    let contact_point = std::env::var("COSMOS_CONTACT_POINT")
        .unwrap_or_else(|_| "jd-analytics.cassandra.cosmos.azure.com".to_string());
    let username =
        std::env::var("COSMOS_USERNAME").unwrap_or_else(|_| "jd-analytics".to_string());
    let password = std::env::var("COSMOS_PASSWORD").ok();

    let posthog_api_key = std::env::var("POSTHOG_API_KEY").ok();
    let clarity_token = std::env::var("CLARITY_EXPORT_TOKEN").ok();
    let vercel_token = std::env::var("VERCEL_TOKEN").ok();
    let google_creds_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS").ok();
    let meta_token = std::env::var("META_ACCESS_TOKEN").ok();

    let anthropic_key = std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.is_empty());
    let anthropic_base_url = std::env::var("ANTHROPIC_BASE_URL").ok();
    let anthropic = anthropic_key
        .as_deref()
        .map(|k| Arc::new(AnthropicClient::new(k.to_string(), anthropic_base_url)));

    let (db, posthog, profile_store, aggregator) = if let Some(pw) = password {
        tracing::info!("connecting to Cosmos DB");
        match AnalyticsDb::connect(&contact_point, &username, &pw).await {
            Ok(analytics_db) => {
                let db = Arc::new(analytics_db);
                let posthog = posthog_api_key
                    .as_deref()
                    .map(|k| Arc::new(PostHogForwarder::new(k.to_string())));
                let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = db.clone();
                let agg = posthog_api_key.map(|k| {
                    Arc::new(Aggregator::new(
                        db.clone(),
                        k,
                        clarity_token,
                        vercel_token,
                        google_creds_path,
                        meta_token,
                    ))
                });
                (Some(db), posthog, profile_store, agg)
            }
            Err(e) => {
                tracing::warn!(
                    "Cosmos DB connection failed ({}); starting in degraded mode",
                    e
                );
                let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> =
                    Arc::new(rust_blog::analytics::NoopProfileStore);
                (None, None, profile_store, None)
            }
        }
    } else {
        tracing::warn!("COSMOS_PASSWORD not set; starting in degraded mode (DB unavailable)");
        let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> =
            Arc::new(rust_blog::analytics::NoopProfileStore);
        (None, None, profile_store, None)
    };

    let state = AppState {
        db: db.clone(),
        posthog,
        anthropic: anthropic.clone(),
        profile_store,
    };

    let app = rust_blog::build_router(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{}", listener.local_addr()?);

    if let Some(agg) = aggregator {
        spawn_aggregation_loop(agg);
    }

    let summarize_enabled =
        std::env::var("SUMMARIZE_ENABLED").unwrap_or_else(|_| "true".into()) != "false";
    if let (Some(db_arc), Some(client)) = (db, anthropic.filter(|_| summarize_enabled)) {
        tracing::info!("summarization enabled, spawning loop");
        summarize::spawn_summarization_loop(db_arc, client, "jdetle-blog".to_string());
    }

    // Wire s10 observability — wraps the axum router in S10Layer so every
    // request emits a span envelope to s10-ingest.
    let s10_url = std::env::var("S10_INGEST_URL").unwrap_or_default();
    let s10_key = std::env::var("S10_INGEST_KEY").unwrap_or_default();
    if !s10_url.is_empty() && !s10_key.is_empty() {
        let s10_client = S10Client::new(s10_url, s10_key);
        let app_with_s10 = app.layer(S10Layer::new(s10_client.clone()));
        s10_rust::event!("service_started")
            .send(&s10_client)
            .await;
        axum::serve(listener, app_with_s10).await?;
    } else {
        tracing::warn!("S10_INGEST_URL/S10_INGEST_KEY not set — s10 telemetry disabled");
        axum::serve(listener, app).await?;
    }

    Ok(())
}

/// Runs the service with an in-memory profile store. Only reachable when the
/// `test-support` feature is compiled in and `BLOG_SERVICE_DB=memory` is set.
#[cfg(feature = "test-support")]
async fn run_memory_mode() -> anyhow::Result<()> {
    use rust_blog::analytics::MemoryProfileStore;

    tracing::warn!("BLOG_SERVICE_DB=memory — using in-memory store (test-support mode)");

    let anthropic_key = std::env::var("ANTHROPIC_API_KEY").ok().filter(|k| !k.is_empty());
    let anthropic_base_url = std::env::var("ANTHROPIC_BASE_URL").ok();
    let anthropic = anthropic_key
        .as_deref()
        .map(|k| Arc::new(AnthropicClient::new(k.to_string(), anthropic_base_url)));

    let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> =
        Arc::new(MemoryProfileStore::new());

    let state = AppState {
        db: None,
        posthog: None,
        anthropic,
        profile_store,
    };

    let app = rust_blog::build_router(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{} (memory mode)", listener.local_addr()?);
    axum::serve(listener, app).await?;
    Ok(())
}
