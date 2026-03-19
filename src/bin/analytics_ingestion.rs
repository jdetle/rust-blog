//! Analytics ingestion service — runs as a parallel daemon alongside the Next.js frontend.
//! Exposes HTTP API for user event queries and runs Clarity/PostHog → Cosmos aggregation loop.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{routing::{get, post}, Router};
use dotenvy::dotenv;
use rust_blog::aggregate::{spawn_aggregation_loop, Aggregator};
use rust_blog::analytics::AnalyticsDb;
use rust_blog::api::{self, cors_layer};
use rust_blog::forward::PostHogForwarder;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "analytics_ingestion=info,tower_http=info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    dotenv().ok();

    let contact_point = std::env::var("COSMOS_CONTACT_POINT")
        .unwrap_or_else(|_| "jd-analytics.cassandra.cosmos.azure.com".to_string());
    let username = std::env::var("COSMOS_USERNAME").unwrap_or_else(|_| "jd-analytics".to_string());
    let password = std::env::var("COSMOS_PASSWORD")
        .expect("COSMOS_PASSWORD must be set for analytics ingestion");

    let posthog_api_key = std::env::var("POSTHOG_API_KEY")
        .expect("POSTHOG_API_KEY must be set for analytics ingestion");
    let clarity_token = std::env::var("CLARITY_EXPORT_TOKEN").ok();
    let vercel_token = std::env::var("VERCEL_TOKEN").ok();
    let google_creds_path = std::env::var("GOOGLE_APPLICATION_CREDENTIALS").ok();
    let meta_token = std::env::var("META_ACCESS_TOKEN").ok();

    tracing::info!("connecting to Cosmos DB");
    let db = AnalyticsDb::connect(&contact_point, &username, &password)
        .await
        .map_err(|e| anyhow::anyhow!("Cosmos DB: {}", e))?;
    let db = Arc::new(db);

    let posthog = Some(Arc::new(PostHogForwarder::new(posthog_api_key.clone())));
    let state = api::AppState {
        db: db.clone(),
        posthog,
    };
    let aggregator = Arc::new(Aggregator::new(
        db,
        posthog_api_key,
        clarity_token,
        vercel_token,
        google_creds_path,
        meta_token,
    ));

    let app = Router::new()
        .route("/health", get(api::health))
        .route("/api/events", post(api::ingest_event))
        .route("/user-events", get(api::user_events))
        .with_state(state)
        .layer(cors_layer());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("listening on http://{}", listener.local_addr()?);

    spawn_aggregation_loop(aggregator);

    axum::serve(listener, app).await?;
    Ok(())
}
