//! Pure mapping helpers for Clarity / PostHog export JSON. Used by aggregation and tests/benches.

use crate::analytics::AnalyticsEvent;
use chrono::{NaiveDate, Utc};
use serde_json::Value;
use uuid::Uuid;

/// Extract Clarity export rows only when the payload is a JSON array at the root.
pub fn clarity_rows_root_array(value: &Value) -> Option<&Vec<Value>> {
    value.as_array()
}

/// Extract PostHog Events API `results` array.
pub fn posthog_results_array(value: &Value) -> Option<&Vec<Value>> {
    value.get("results").and_then(|r| r.as_array())
}

/// Parse `YYYY-MM-DD` from the first 10 bytes of an ISO-8601 timestamp string (ASCII prefix).
/// Returns `None` if too short, not on a UTF-8 char boundary at index 10, or invalid date.
pub fn date_from_iso_timestamp_prefix(s: &str) -> Option<NaiveDate> {
    if s.len() < 10 || !s.is_char_boundary(10) {
        return None;
    }
    NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d").ok()
}

/// Resolve event date from PostHog `timestamp` field (string or other JSON). Falls back to `now` when missing/invalid.
pub fn posthog_event_date_from_timestamp(ts: Option<&Value>, fallback_date: NaiveDate) -> NaiveDate {
    let Some(v) = ts else {
        return fallback_date;
    };
    if let Some(s) = v.as_str() {
        return date_from_iso_timestamp_prefix(s).unwrap_or(fallback_date);
    }
    fallback_date
}

/// Build a stored event from one Clarity export row.
pub fn clarity_row_to_event(row: &Value, now_ms: i64, event_id: Uuid) -> AnalyticsEvent {
    AnalyticsEvent {
        site_id: "jdetle-blog".to_string(),
        event_date: Utc::now().date_naive(),
        event_time: now_ms,
        event_id,
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
    }
}

/// Build a stored event from one PostHog Events API result object.
pub fn posthog_raw_to_event(raw: &Value, now_ms: i64, event_id: Uuid, fallback_date: NaiveDate) -> AnalyticsEvent {
    let event_date = posthog_event_date_from_timestamp(raw.get("timestamp"), fallback_date);
    AnalyticsEvent {
        site_id: "jdetle-blog".to_string(),
        event_date,
        event_time: now_ms,
        event_id,
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
            raw.get("properties").unwrap_or(&Value::Null),
        )
        .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn date_prefix_never_panics(s in any::<String>()) {
            let _ = date_from_iso_timestamp_prefix(&s);
        }

        #[test]
        fn posthog_event_date_never_panics(s in any::<String>()) {
            let v = Value::String(s);
            let fb = NaiveDate::from_ymd_opt(2020, 1, 1).unwrap();
            let _ = posthog_event_date_from_timestamp(Some(&v), fb);
        }
    }

    #[test]
    fn short_timestamp_string_falls_back() {
        let fb = NaiveDate::from_ymd_opt(2024, 6, 1).unwrap();
        let v = Value::String("short".to_string());
        assert_eq!(posthog_event_date_from_timestamp(Some(&v), fb), fb);
    }

    #[test]
    fn valid_iso_prefix_parses() {
        assert_eq!(
            date_from_iso_timestamp_prefix("2024-03-15T12:00:00Z"),
            NaiveDate::from_ymd_opt(2024, 3, 15)
        );
    }
}
