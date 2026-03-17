use crate::analytics::{AnalyticsDb, AnalyticsEvent};
use chrono::{NaiveDate, Utc};
use reqwest::Client;
use std::sync::Arc;
use uuid::Uuid;

const CLARITY_EXPORT_URL: &str =
    "https://www.clarity.ms/export-data/api/v1/project-live-insights";

const POSTHOG_EVENTS_URL: &str = "https://us.posthog.com/api/projects";

pub struct Aggregator {
    db: Arc<AnalyticsDb>,
    client: Client,
    clarity_token: Option<String>,
    posthog_api_key: String,
}

impl Aggregator {
    pub fn new(
        db: Arc<AnalyticsDb>,
        posthog_api_key: String,
        clarity_token: Option<String>,
    ) -> Self {
        Self {
            db,
            client: Client::new(),
            clarity_token,
            posthog_api_key,
        }
    }

    pub async fn run_cycle(&self) {
        tracing::info!("starting aggregation cycle");
        self.pull_clarity().await;
        self.pull_posthog().await;
        self.pull_vercel().await;
        tracing::info!("aggregation cycle complete");
    }

    /// Vercel Web Analytics has no public REST API for pulling events.
    /// Data can be exported manually via dashboard CSV, or via Vercel Drains (Pro/Enterprise).
    async fn pull_vercel(&self) {
        tracing::debug!(
            "Vercel Analytics: no pull API — use dashboard CSV export or Vercel Drains"
        );
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
            .get(CLARITY_EXPORT_URL)
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

        if let Some(rows) = data.as_array() {
            for row in rows {
                let event = AnalyticsEvent {
                    site_id: "jdetle-blog".to_string(),
                    event_date: Utc::now().date_naive(),
                    event_time: Utc::now().timestamp_millis(),
                    event_id: Uuid::new_v4(),
                    event_type: "clarity_insight".to_string(),
                    source: "clarity".to_string(),
                    page_url: row
                        .get("URL")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    user_agent: String::new(),
                    referrer: String::new(),
                    session_id: String::new(),
                    properties: serde_json::to_string(row).unwrap_or_default(),
                };
                if let Err(e) = self.db.insert_event(&event).await {
                    tracing::error!(error = %e, "failed to store Clarity event");
                }
            }
        }
    }

    async fn pull_posthog(&self) {
        let url = format!("{POSTHOG_EVENTS_URL}/1/events/");
        let today = Utc::now().format("%Y-%m-%d").to_string();

        let res = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.posthog_api_key))
            .query(&[("after", today.as_str()), ("limit", "100")])
            .send()
            .await;

        let body = match res {
            Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
            Ok(resp) => {
                tracing::warn!(status = %resp.status(), "PostHog events export returned non-success");
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

        let results = data.get("results").and_then(|r| r.as_array());
        if let Some(events) = results {
            for raw in events {
                let event = AnalyticsEvent {
                    site_id: "jdetle-blog".to_string(),
                    event_date: raw
                        .get("timestamp")
                        .and_then(|t| t.as_str())
                        .and_then(|s| NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d").ok())
                        .unwrap_or_else(|| Utc::now().date_naive()),
                    event_time: Utc::now().timestamp_millis(),
                    event_id: Uuid::new_v4(),
                    event_type: raw
                        .get("event")
                        .and_then(|e| e.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    source: "posthog".to_string(),
                    page_url: raw
                        .get("properties")
                        .and_then(|p| p.get("$current_url"))
                        .and_then(|u| u.as_str())
                        .unwrap_or("")
                        .to_string(),
                    user_agent: raw
                        .get("properties")
                        .and_then(|p| p.get("$user_agent"))
                        .and_then(|u| u.as_str())
                        .unwrap_or("")
                        .to_string(),
                    referrer: raw
                        .get("properties")
                        .and_then(|p| p.get("$referrer"))
                        .and_then(|u| u.as_str())
                        .unwrap_or("")
                        .to_string(),
                    session_id: raw
                        .get("distinct_id")
                        .and_then(|d| d.as_str())
                        .unwrap_or("")
                        .to_string(),
                    properties: serde_json::to_string(
                        raw.get("properties").unwrap_or(&serde_json::Value::Null),
                    )
                    .unwrap_or_default(),
                };
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
