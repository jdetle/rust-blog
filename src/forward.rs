use crate::analytics::AnalyticsEvent;
use reqwest::Client;
use serde_json::json;

const POSTHOG_CAPTURE_URL: &str = "https://us.posthog.com/capture/";

pub struct PostHogForwarder {
    client: Client,
    api_key: String,
}

impl PostHogForwarder {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }

    pub async fn forward(&self, event: &AnalyticsEvent) {
        let payload = json!({
            "api_key": self.api_key,
            "event": event.event_type,
            "distinct_id": event.session_id,
            "properties": {
                "$current_url": event.page_url,
                "$referrer": event.referrer,
                "$user_agent": event.user_agent,
                "source": event.source,
                "event_id": event.event_id.to_string(),
                "custom": event.properties,
            },
            "timestamp": event.event_time,
        });

        let res = self
            .client
            .post(POSTHOG_CAPTURE_URL)
            .json(&payload)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!(event_id = %event.event_id, "forwarded to PostHog");
            }
            Ok(resp) => {
                tracing::warn!(
                    event_id = %event.event_id,
                    status = %resp.status(),
                    "PostHog capture returned non-success"
                );
            }
            Err(e) => {
                tracing::error!(event_id = %event.event_id, error = %e, "PostHog forward failed");
            }
        }
    }
}
