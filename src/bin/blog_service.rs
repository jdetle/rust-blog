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
use rust_blog::openai_images::OpenAiImagesClient;
use rust_blog::summarize;
use tokio::net::TcpListener;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::EnvFilter;

fn main() -> anyhow::Result<()> {
    // Load `.env` before anything that reads the process environment (Sentry, DB, etc.).
    dotenv().ok();

    // Sentry docs recommend initializing the SDK before the async runtime. Tracing is set up
    // first so `sentry::integrations::tracing` can forward spans once `sentry::init` runs.
    let env_filter = EnvFilter::new(
        std::env::var("RUST_LOG").unwrap_or_else(|_| "blog_service=info,tower_http=info".into()),
    );
    let _sentry = {
        let dsn = std::env::var("SENTRY_DSN")
            .ok()
            .filter(|s| !s.is_empty())
            .and_then(|s| s.parse().ok());
        let traces_sample_rate = std::env::var("SENTRY_TRACES_SAMPLE_RATE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0);
        let send_default_pii = std::env::var("SENTRY_SEND_DEFAULT_PII")
            .map(|s| s == "1" || s.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        tracing_subscriber::registry()
            .with(env_filter)
            .with(sentry::integrations::tracing::layer())
            .with(tracing_subscriber::fmt::layer())
            .init();

        sentry::init(sentry::ClientOptions {
            dsn,
            release: sentry::release_name!(),
            environment: std::env::var("SENTRY_ENVIRONMENT").ok().map(Into::into),
            traces_sample_rate,
            send_default_pii,
            ..Default::default()
        })
    };

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(async_main())?;
    Ok(())
}

async fn async_main() -> anyhow::Result<()> {
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
    let username = std::env::var("COSMOS_USERNAME").unwrap_or_else(|_| "jd-analytics".to_string());
    let password = std::env::var("COSMOS_PASSWORD").ok();

    let posthog_project_key = std::env::var("POSTHOG_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());
    let posthog_personal_key = std::env::var("POSTHOG_PERSONAL_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());
    let clarity_token = std::env::var("CLARITY_EXPORT_TOKEN").ok();
    let web_analytics_drain_token = std::env::var("WEB_ANALYTICS_DRAIN_TOKEN").ok();
    let google_creds_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS").ok();
    let meta_token = std::env::var("META_ACCESS_TOKEN").ok();

    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());
    let anthropic_base_url = std::env::var("ANTHROPIC_BASE_URL").ok();
    let anthropic = anthropic_key
        .as_deref()
        .map(|k| Arc::new(AnthropicClient::new(k.to_string(), anthropic_base_url)));

    let collage_enabled = std::env::var("AVATAR_COLLAGE_ENABLED")
        .unwrap_or_else(|_| "false".into())
        .trim()
        .eq_ignore_ascii_case("true");
    let openai_key = std::env::var("OPENAI_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());
    let openai_base_url = std::env::var("OPENAI_IMAGES_BASE_URL").ok();
    let openai: Option<Arc<OpenAiImagesClient>> = if collage_enabled {
        openai_key.map(|k| Arc::new(OpenAiImagesClient::new(k, openai_base_url)))
    } else {
        None
    };

    let (db, posthog, profile_store, aggregator) = if let Some(pw) = password {
        tracing::info!("connecting to Cosmos DB");
        match AnalyticsDb::connect(&contact_point, &username, &pw).await {
            Ok(analytics_db) => {
                let db = Arc::new(analytics_db);
                let posthog = posthog_project_key
                    .as_ref()
                    .map(|k| Arc::new(PostHogForwarder::new(k.clone())));
                let profile_store: Arc<dyn rust_blog::analytics::ProfileStore> = db.clone();
                // Events list API requires a personal API key; project key is only valid for /capture/.
                let posthog_pull_key = posthog_personal_key
                    .clone()
                    .or_else(|| posthog_project_key.clone());
                let agg = posthog_pull_key.map(|k| {
                    if posthog_personal_key.is_none() && k.starts_with("phc_") {
                        tracing::warn!(
                            "POSTHOG_PERSONAL_API_KEY is unset; PostHog event export uses POSTHOG_API_KEY — \
                             listing events typically returns 403 until you set a personal key (phx_…) with query:read"
                        );
                    }
                    Arc::new(Aggregator::new(
                        db.clone(),
                        k,
                        clarity_token,
                        web_analytics_drain_token,
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
        openai,
        profile_store,
        avatar_today_override: None,
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

    axum::serve(listener, app).await?;
    // Ensure the Sentry client flushes; the main guard is dropped with `main`'s return.
    Ok(())
}

/// Runs the service with an in-memory profile store. Only reachable when the
/// `test-support` feature is compiled in and `BLOG_SERVICE_DB=memory` is set.
#[cfg(feature = "test-support")]
async fn run_memory_mode() -> anyhow::Result<()> {
    use rust_blog::analytics::MemoryProfileStore;

    tracing::warn!("BLOG_SERVICE_DB=memory — using in-memory store (test-support mode)");

    let anthropic_key = std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .filter(|k| !k.is_empty());
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
        openai: None,
        profile_store,
        avatar_today_override: None,
    };

    let app = rust_blog::build_router(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(
        "listening on http://{} (memory mode)",
        listener.local_addr()?
    );
    axum::serve(listener, app).await?;
    Ok(())
}
