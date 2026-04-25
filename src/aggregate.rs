use crate::aggregate_mapping::{clarity_row_to_event, posthog_raw_to_event};
use crate::analytics::AnalyticsDb;
use crate::event_sink::EventSink;
use chrono::Utc;
use reqwest::Client;
use std::sync::Arc;
use uuid::Uuid;

const CLARITY_EXPORT_URL: &str = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

const DEFAULT_POSTHOG_HOST: &str = "https://us.posthog.com";

pub struct Aggregator {
    db: Arc<dyn EventSink>,
    client: Client,
    clarity_export_url: String,
    posthog_events_url: String,
    clarity_token: Option<String>,
    posthog_api_key: String,
    web_analytics_drain_token: Option<String>,
    google_creds_path: Option<String>,
    meta_token: Option<String>,
}

impl Aggregator {
    pub fn new(
        db: Arc<AnalyticsDb>,
        posthog_api_key: String,
        clarity_token: Option<String>,
        web_analytics_drain_token: Option<String>,
        google_creds_path: Option<String>,
        meta_token: Option<String>,
    ) -> Self {
        let clarity_export_url =
            std::env::var("CLARITY_EXPORT_URL").unwrap_or_else(|_| CLARITY_EXPORT_URL.to_string());
        let host = std::env::var("POSTHOG_HOST")
            .unwrap_or_else(|_| DEFAULT_POSTHOG_HOST.to_string())
            .trim_end_matches('/')
            .to_string();
        let project_id = std::env::var("POSTHOG_PROJECT_ID").unwrap_or_else(|_| "1".to_string());
        let posthog_events_url = format!("{host}/api/projects/{project_id}/events/");
        let db_sink: Arc<dyn EventSink> = db;
        Self::with_endpoints(
            db_sink,
            Client::new(),
            clarity_export_url,
            posthog_events_url,
            posthog_api_key,
            clarity_token,
            web_analytics_drain_token,
            google_creds_path,
            meta_token,
        )
    }

    /// Full constructor for tests: override HTTP client and provider URLs (e.g. wiremock).
    #[allow(clippy::too_many_arguments)] // test harness mirrors env-driven production `new`
    pub fn with_endpoints(
        db: Arc<dyn EventSink>,
        client: Client,
        clarity_export_url: String,
        posthog_events_url: String,
        posthog_api_key: String,
        clarity_token: Option<String>,
        web_analytics_drain_token: Option<String>,
        google_creds_path: Option<String>,
        meta_token: Option<String>,
    ) -> Self {
        Self {
            db,
            client,
            clarity_export_url,
            posthog_events_url,
            clarity_token,
            posthog_api_key,
            web_analytics_drain_token,
            google_creds_path,
            meta_token,
        }
    }

    pub async fn run_cycle(&self) {
        tracing::info!("starting aggregation cycle");
        self.pull_clarity().await;
        self.pull_posthog().await;
        self.pull_web_analytics_drain().await;
        self.pull_ga4().await;
        self.pull_meta().await;
        tracing::info!("aggregation cycle complete");
    }

    /// Hosted web analytics: no pull API for most products — batches POST to `/api/drain/web-analytics`.
    /// `WEB_ANALYTICS_DRAIN_TOKEN` is optional (for provider APIs that configure drains).
    async fn pull_web_analytics_drain(&self) {
        if self.web_analytics_drain_token.is_some() {
            tracing::debug!(
                "web analytics drain token set — inbound POST /api/drain/web-analytics; no pull needed"
            );
        } else {
            tracing::debug!(
                "web analytics: no drain token; configure POST drain to blog-service if needed"
            );
        }
    }

    /// GA4: per-user data requires BigQuery export. GOOGLE_APPLICATION_CREDENTIALS
    /// points to service account JSON. Query user_pseudo_id (set to fingerprint in gtag).
    async fn pull_ga4(&self) {
        if let Some(ref path) = self.google_creds_path {
            tracing::debug!(
                path = %path,
                "GA4 BigQuery: credentials present — BigQuery query by user_pseudo_id not yet implemented"
            );
        }
    }

    /// Meta: no API to pull per-user events. META_ACCESS_TOKEN is for Conversion API (sending).
    async fn pull_meta(&self) {
        if self.meta_token.is_some() {
            tracing::debug!("Meta token configured — no pull API; use for Conversion API (send)");
        }
    }

    async fn pull_clarity(&self) {
        let token = match &self.clarity_token {
            Some(t) => t,
            None => {
                tracing::debug!("no Clarity export token configured, skipping");
                return;
            }
        };

        let res = self
            .client
            .get(&self.clarity_export_url)
            .bearer_auth(token)
            .query(&[("numOfDays", "1")])
            .send()
            .await;

        let body = match res {
            Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
            Ok(resp) => {
                tracing::warn!(status = %resp.status(), "Clarity export returned non-success");
                return;
            }
            Err(e) => {
                tracing::error!(error = %e, "Clarity export request failed");
                return;
            }
        };

        let data: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(error = %e, "failed to parse Clarity export JSON");
                return;
            }
        };

        if let Some(rows) = crate::aggregate_mapping::clarity_rows_root_array(&data) {
            let now_ms = Utc::now().timestamp_millis();
            for row in rows {
                let event = clarity_row_to_event(row, now_ms, Uuid::new_v4());
                if let Err(e) = self.db.insert_event(&event).await {
                    tracing::error!(error = %e, "failed to store Clarity event");
                }
            }
        }
    }

    async fn pull_posthog(&self) {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let fallback_date = Utc::now().date_naive();

        let res = self
            .client
            .get(&self.posthog_events_url)
            .header("Authorization", format!("Bearer {}", self.posthog_api_key))
            .query(&[("after", today.as_str()), ("limit", "100")])
            .send()
            .await;

        let body = match res {
            Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
            Ok(resp) => {
                let status = resp.status();
                let err_body = resp.text().await.unwrap_or_default();
                let snippet: String = err_body.chars().take(800).collect();
                let code = status.as_u16();
                if code == 401 || code == 403 {
                    tracing::warn!(
                        status = %status,
                        body = %snippet,
                        "PostHog events export auth failed — the Events API requires POSTHOG_PERSONAL_API_KEY (Bearer phx_… with query:read). POSTHOG_API_KEY is the project key for /capture/ only."
                    );
                } else {
                    tracing::warn!(
                        status = %status,
                        body = %snippet,
                        "PostHog events export returned non-success"
                    );
                }
                return;
            }
            Err(e) => {
                tracing::error!(error = %e, "PostHog events request failed");
                return;
            }
        };

        let data: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(e) => {
                tracing::error!(error = %e, "failed to parse PostHog events JSON");
                return;
            }
        };

        let now_ms = Utc::now().timestamp_millis();
        if let Some(events) = crate::aggregate_mapping::posthog_results_array(&data) {
            for raw in events {
                let event = posthog_raw_to_event(raw, now_ms, Uuid::new_v4(), fallback_date);
                if let Err(e) = self.db.insert_event(&event).await {
                    tracing::error!(error = %e, "failed to store PostHog event");
                }
            }
        }
    }
}

pub fn spawn_aggregation_loop(aggregator: Arc<Aggregator>) {
    tokio::spawn(async move {
        let interval = tokio::time::Duration::from_secs(15 * 60);
        loop {
            aggregator.run_cycle().await;
            tokio::time::sleep(interval).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analytics::AnalyticsEvent;
    use crate::event_sink::EventSink;
    use async_trait::async_trait;
    use serde_json::json;
    use std::sync::Mutex;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    struct RecordingSink(Mutex<Vec<AnalyticsEvent>>);

    impl RecordingSink {
        fn new() -> Self {
            Self(Mutex::new(Vec::new()))
        }

        fn len(&self) -> usize {
            self.0.lock().expect("lock").len()
        }
    }

    #[async_trait]
    impl EventSink for RecordingSink {
        async fn insert_event(
            &self,
            event: &AnalyticsEvent,
        ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
            self.0.lock().expect("lock").push(event.clone());
            Ok(())
        }
    }

    #[tokio::test]
    async fn clarity_array_inserts_rows() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/export"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!([
                {"URL": "https://example.com/a"},
                {"URL": "https://example.com/b"}
            ])))
            .mount(&server)
            .await;

        let recording = Arc::new(RecordingSink::new());
        let sink: Arc<dyn EventSink> = recording.clone();
        let agg = Aggregator::with_endpoints(
            sink,
            Client::new(),
            format!("{}/export", server.uri()),
            "http://unused.test/posthog".to_string(),
            "key".into(),
            Some("token".into()),
            None,
            None,
            None,
        );

        agg.pull_clarity().await;
        assert_eq!(recording.len(), 2);
    }

    #[tokio::test]
    async fn clarity_object_root_inserts_nothing() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/export"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"rows": []})))
            .mount(&server)
            .await;

        let recording = Arc::new(RecordingSink::new());
        let sink: Arc<dyn EventSink> = recording.clone();
        let agg = Aggregator::with_endpoints(
            sink,
            Client::new(),
            format!("{}/export", server.uri()),
            "http://unused.test/posthog".to_string(),
            "key".into(),
            Some("token".into()),
            None,
            None,
            None,
        );

        agg.pull_clarity().await;
        assert_eq!(recording.len(), 0);
    }

    #[tokio::test]
    async fn posthog_non_success_inserts_nothing() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/events"))
            .respond_with(ResponseTemplate::new(429).set_body_string("rate limited"))
            .mount(&server)
            .await;

        let recording = Arc::new(RecordingSink::new());
        let sink: Arc<dyn EventSink> = recording.clone();
        let agg = Aggregator::with_endpoints(
            sink,
            Client::new(),
            "http://unused.test/clarity".to_string(),
            format!("{}/events", server.uri()),
            "key".into(),
            None,
            None,
            None,
            None,
        );

        agg.pull_posthog().await;
        assert_eq!(recording.len(), 0);
    }

    #[tokio::test]
    async fn posthog_results_inserts_events() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/events"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "results": [
                    {
                        "event": "pageview",
                        "timestamp": "2024-01-15T10:00:00Z",
                        "distinct_id": "user-1",
                        "properties": {"$current_url": "https://x.com/"}
                    }
                ]
            })))
            .mount(&server)
            .await;

        let recording = Arc::new(RecordingSink::new());
        let sink: Arc<dyn EventSink> = recording.clone();
        let agg = Aggregator::with_endpoints(
            sink,
            Client::new(),
            "http://unused.test/clarity".to_string(),
            format!("{}/events", server.uri()),
            "key".into(),
            None,
            None,
            None,
            None,
        );

        agg.pull_posthog().await;
        assert_eq!(recording.len(), 1);
        let ev = &recording.0.lock().expect("lock")[0];
        assert_eq!(ev.event_type, "pageview");
        assert_eq!(ev.session_id, "user-1");
        assert_eq!(ev.source, "posthog");
    }

    /// Seeded random walk: varied `results` lengths and distinct_ids; each cycle must insert N rows.
    #[tokio::test]
    async fn posthog_pull_random_walk_inserts_expected_count() {
        use rand::Rng;
        use rand::SeedableRng;
        use rand_chacha::ChaCha8Rng;

        let mut rng = ChaCha8Rng::seed_from_u64(42);

        for _ in 0..20 {
            let n = rng.gen_range(1..=25_usize);
            let mut results = Vec::new();
            for i in 0..n {
                results.push(json!({
                    "event": format!("evt_{i}"),
                    "timestamp": "2024-01-15T10:00:00Z",
                    "distinct_id": format!("user-{}", rng.gen::<u32>()),
                    "properties": {"$current_url": "https://example.com/p"}
                }));
            }

            let server = MockServer::start().await;
            Mock::given(method("GET"))
                .and(path("/events"))
                .respond_with(
                    ResponseTemplate::new(200).set_body_json(json!({ "results": results })),
                )
                .mount(&server)
                .await;

            let recording = Arc::new(RecordingSink::new());
            let sink: Arc<dyn EventSink> = recording.clone();
            let agg = Aggregator::with_endpoints(
                sink,
                Client::new(),
                "http://unused.test/clarity".to_string(),
                format!("{}/events", server.uri()),
                "key".into(),
                None,
                None,
                None,
                None,
            );

            agg.pull_posthog().await;
            assert_eq!(
                recording.len(),
                n,
                "pull_posthog should insert one row per PostHog result"
            );
        }
    }
}
