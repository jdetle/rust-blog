//! Web analytics drain payload parsing (JSON posted to `/api/drain/web-analytics`).
//! Incoming events may use the common `*.analytics.v1`-style schema identifier from
//! hosted analytics products; we store them in Cosmos like any other batch.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::analytics::AnalyticsEvent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebAnalyticsDrainEvent {
    #[serde(default)]
    pub schema: String,
    #[serde(default)]
    pub event_type: String,
    #[serde(default)]
    pub event_name: String,
    #[serde(default)]
    pub event_data: String,
    #[serde(default)]
    pub timestamp: i64,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub origin: String,
    #[serde(default)]
    pub referrer: String,
    #[serde(default)]
    pub session_id: i64,
    #[serde(default)]
    pub device_id: i64,
    #[serde(default)]
    pub fingerprint: String,
}

impl WebAnalyticsDrainEvent {
    pub fn to_analytics_event(&self) -> AnalyticsEvent {
        let page_url = if self.origin.is_empty() {
            self.path.clone()
        } else {
            format!("{}{}", self.origin.trim_end_matches('/'), self.path)
        };
        let event_type = if self.event_type == "event" && !self.event_name.is_empty() {
            self.event_name.clone()
        } else {
            self.event_type.clone()
        };
        let session_id = if !self.fingerprint.is_empty() {
            self.fingerprint.clone()
        } else {
            self.device_id.to_string()
        };
        let properties = serde_json::json!({
            "eventData": self.event_data,
            "sessionId": self.session_id
        });
        let event_date: NaiveDate = if self.timestamp > 0 {
            DateTime::from_timestamp(self.timestamp / 1000, 0)
                .map(|dt| dt.date_naive())
                .unwrap_or_else(|| Utc::now().date_naive())
        } else {
            Utc::now().date_naive()
        };
        AnalyticsEvent {
            site_id: "jdetle-blog".to_string(),
            event_date,
            event_time: if self.timestamp > 0 {
                self.timestamp
            } else {
                Utc::now().timestamp_millis()
            },
            event_id: Uuid::new_v4(),
            event_type,
            source: "web_analytics".to_string(),
            page_url,
            user_agent: String::new(),
            referrer: self.referrer.clone(),
            session_id,
            properties: properties.to_string(),
        }
    }
}

/// Drain endpoint accepts a JSON array or a single object.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WebAnalyticsDrainPayload {
    Single(WebAnalyticsDrainEvent),
    Array(Vec<WebAnalyticsDrainEvent>),
}

impl WebAnalyticsDrainPayload {
    pub fn events(&self) -> Vec<&WebAnalyticsDrainEvent> {
        match self {
            WebAnalyticsDrainPayload::Single(e) => vec![e],
            WebAnalyticsDrainPayload::Array(v) => v.iter().collect(),
        }
    }
}
