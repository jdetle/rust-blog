//! LLM-powered summarization of analytics events per session_id.
//! Uses Anthropic Messages API to produce a "who is this person" summary.

use std::sync::Arc;

use crate::analytics::{AnalyticsDb, AnalyticsEvent};
use crate::anthropic::AnthropicClient;

const MODEL: &str = "claude-3-5-sonnet-20241022";
const MAX_TOKENS: u32 = 512;

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
    client: &AnthropicClient,
    events: &[AnalyticsEvent],
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if events.is_empty() {
        return Ok(String::new());
    }
    let prompt = build_prompt(events);
    let raw = client.messages(MODEL, MAX_TOKENS, &prompt).await?;
    Ok(raw.trim().to_string())
}

/// Runs one summarization cycle: discover sessions, summarize, store.
pub async fn run_summarization_cycle(
    db: Arc<AnalyticsDb>,
    client: &AnthropicClient,
    site_id: &str,
    sessions_per_cycle: u32,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    let events = db.query_recent_events(site_id, 14, 200).await?;

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
        events.sort_by_key(|e| e.event_time);
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

        match summarize_events(client, &session_events).await {
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
    client: Arc<AnthropicClient>,
    site_id: String,
) {
    tokio::spawn(async move {
        let interval = tokio::time::Duration::from_secs(30 * 60);
        let sessions_per_cycle: u32 = std::env::var("SUMMARIZE_SESSIONS_PER_CYCLE")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(5);

        loop {
            tokio::time::sleep(interval).await;
            if let Err(e) =
                run_summarization_cycle(db.clone(), &client, &site_id, sessions_per_cycle).await
            {
                tracing::warn!(error = %e, "summarization cycle failed");
            }
        }
    });
}
