//! LLM-powered summarization of analytics events per session_id.
//! Uses Anthropic Messages API to produce a "who is this person" summary.

use std::sync::Arc;

use crate::analytics::{AnalyticsDb, AnalyticsEvent};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MODEL: &str = "claude-3-5-sonnet-20241022";
const MAX_TOKENS: u32 = 512;

/// Builds a prompt from events for the LLM.
fn build_prompt(events: &[AnalyticsEvent]) -> String {
    let events_json: Vec<serde_json::Value> = events
        .iter()
        .map(|e| {
            serde_json::json!({
                "event_type": e.event_type,
                "page_url": e.page_url,
                "referrer": e.referrer,
                "user_agent": e.user_agent,
                "event_date": e.event_date.format("%Y-%m-%d").to_string(),
            })
        })
        .collect();
    let events_str = serde_json::to_string_pretty(&events_json).unwrap_or_default();

    format!(
        r#"You are analyzing analytics events for a single visitor to a personal blog. Given the following events (page URLs, referrers, user agent, timestamps), write a 2–4 sentence summary of who this person likely is: interests, how they found the site, device/context.

Events (JSON):
{}

Summary:"#,
        events_str
    )
}

/// Calls Anthropic Messages API to summarize events.
pub async fn summarize_events(
    api_key: &str,
    events: &[AnalyticsEvent],
    client: &reqwest::Client,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if events.is_empty() {
        return Ok(String::new());
    }

    let prompt = build_prompt(events);

    let body = serde_json::json!({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });

    let res = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error {}: {}", status, text).into());
    }

    let json: serde_json::Value = res.json().await?;
    let content = json
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim()
        .to_string();

    Ok(content)
}

/// Runs one summarization cycle: discover sessions, summarize, store.
pub async fn run_summarization_cycle(
    db: Arc<AnalyticsDb>,
    api_key: &str,
    site_id: &str,
    sessions_per_cycle: u32,
    client: &reqwest::Client,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let events = db
        .query_recent_events(site_id, 14, 200)
        .await?;

    let mut by_session: std::collections::HashMap<String, Vec<AnalyticsEvent>> =
        std::collections::HashMap::new();
    for ev in events {
        if !ev.session_id.is_empty() {
            by_session
                .entry(ev.session_id.clone())
                .or_default()
                .push(ev);
        }
    }

    for events in by_session.values_mut() {
        events.sort_by(|a, b| a.event_time.cmp(&b.event_time));
    }

    let mut session_ids: Vec<_> = by_session.keys().cloned().collect();
    session_ids.truncate(sessions_per_cycle as usize);

    let mut summarized = 0;
    for session_id in session_ids {
        let session_events = match by_session.get(&session_id) {
            Some(ev) if ev.len() >= 2 => ev.clone(),
            _ => continue,
        };

        if let Ok(Some(profile)) = db.get_user_profile(&session_id).await {
            if !profile.llm_summary.is_empty() {
                continue;
            }
        }

        match summarize_events(api_key, &session_events, client).await {
            Ok(summary) if !summary.is_empty() => {
                if db.upsert_user_profile(&session_id, &summary).await.is_ok() {
                    summarized += 1;
                    tracing::info!(session_id = %session_id, "summarized user profile");
                }
            }
            Ok(_) => {}
            Err(e) => {
                tracing::warn!(session_id = %session_id, error = %e, "summarization failed");
            }
        }
    }

    Ok(summarized)
}

/// Spawns a background loop that runs summarization every 30 minutes.
pub fn spawn_summarization_loop(
    db: Arc<AnalyticsDb>,
    api_key: String,
    site_id: String,
) {
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let interval = tokio::time::Duration::from_secs(30 * 60);
        let sessions_per_cycle: u32 = std::env::var("SUMMARIZE_SESSIONS_PER_CYCLE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);

        loop {
            tokio::time::sleep(interval).await;
            if let Err(e) =
                run_summarization_cycle(db.clone(), &api_key, &site_id, sessions_per_cycle, &client)
                    .await
            {
                tracing::warn!(error = %e, "summarization cycle failed");
            }
        }
    });
}
