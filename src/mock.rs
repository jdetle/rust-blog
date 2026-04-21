//! Mock user personas and analytics event generator for testing and development.
//! Produces realistic event data that an LLM can use to infer "who the person is."

use chrono::{Duration, Utc};
use rand::Rng;

use crate::analytics::IncomingEvent;
use crate::web_analytics_drain::{WebAnalyticsDrainEvent, WebAnalyticsDrainPayload};

const SITE_ORIGIN: &str = "https://jdetle.com";

/// A mock user persona with consistent identifiers and behavior.
#[derive(Debug, Clone)]
pub struct MockPersona {
    pub fingerprint: String,
    pub device_id: i64,
    pub user_agent: String,
    pub referrer: String,
    pub page_sequence: Vec<&'static str>,
    pub event_types: Vec<&'static str>,
}

impl MockPersona {
    /// Tech enthusiast arriving from Hacker News.
    pub fn hn_reader() -> Self {
        Self {
            fingerprint: "fp_hn7a2b3c4d5e6f".to_string(),
            device_id: 10010001,
            user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
            referrer: "https://news.ycombinator.com/".to_string(),
            page_sequence: vec!["/", "/posts", "/posts/monorepos-were-a-mistake", "/posts/rust-blog"],
            event_types: vec!["$pageview", "pageview", "$pageview", "pageview"],
        }
    }

    /// RSS subscriber arriving from a feed reader.
    pub fn rss_subscriber() -> Self {
        Self {
            fingerprint: "fp_rss8e9f0a1b2c3".to_string(),
            device_id: 10010002,
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36".to_string(),
            referrer: "https://feedreader.com/".to_string(),
            page_sequence: vec!["/posts", "/posts/agentic-engineering-explained", "/posts/checking-in"],
            event_types: vec!["pageview", "pageview", "pageview"],
        }
    }

    /// Google searcher arriving from organic search.
    pub fn google_searcher() -> Self {
        Self {
            fingerprint: "fp_goo3d4e5f6a7b8".to_string(),
            device_id: 10010003,
            user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0".to_string(),
            referrer: "https://www.google.com/".to_string(),
            page_sequence: vec!["/posts/aws-solutions-architect-prep", "/posts", "/"],
            event_types: vec!["pageview", "$pageview", "pageview"],
        }
    }

    /// Return visitor with multiple sessions over time.
    pub fn return_visitor() -> Self {
        Self {
            fingerprint: "fp_ret9c0d1e2f3a4".to_string(),
            device_id: 10010004,
            user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15".to_string(),
            referrer: String::new(),
            page_sequence: vec!["/", "/posts", "/posts/memory-leaks-in-node", "/posts/augmented-social-networks", "/posts/what-your-pageviews-tell-me-about-your-life"],
            event_types: vec!["pageview", "pageview", "pageview", "pageview", "pageview"],
        }
    }

    /// Mobile Safari user, short session.
    pub fn mobile_safari_user() -> Self {
        Self {
            fingerprint: "fp_mob5b6c7d8e9f0".to_string(),
            device_id: 10010005,
            user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1".to_string(),
            referrer: "https://twitter.com/".to_string(),
            page_sequence: vec!["/", "/posts", "/posts/checking-in"],
            event_types: vec!["pageview", "pageview", "pageview"],
        }
    }

    /// Twitter/X referrer, tech-curious.
    pub fn twitter_referral() -> Self {
        Self {
            fingerprint: "fp_twx1a2b3c4d5e".to_string(),
            device_id: 10010006,
            user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
            referrer: "https://x.com/".to_string(),
            page_sequence: vec!["/", "/posts/what-your-pageviews-tell-me-about-your-life", "/posts"],
            event_types: vec!["$pageview", "pageview", "pageview"],
        }
    }

    /// Direct visitor, bookmarked or typed URL.
    pub fn direct_visitor() -> Self {
        Self {
            fingerprint: "fp_dir6f7a8b9c0d".to_string(),
            device_id: 10010007,
            user_agent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36".to_string(),
            referrer: String::new(),
            page_sequence: vec!["/", "/posts", "/posts/rules-that-make-quality-sites-easy"],
            event_types: vec!["pageview", "pageview", "pageview"],
        }
    }

    /// All built-in personas.
    pub fn all() -> Vec<Self> {
        vec![
            Self::hn_reader(),
            Self::rss_subscriber(),
            Self::google_searcher(),
            Self::return_visitor(),
            Self::mobile_safari_user(),
            Self::twitter_referral(),
            Self::direct_visitor(),
        ]
    }
}

/// Generates mock events for a persona, spread over the last N days.
pub fn generate_incoming_events(
    persona: &MockPersona,
    days_back: i64,
    rng: &mut impl Rng,
) -> Vec<IncomingEvent> {
    let now = Utc::now();
    let start = now - Duration::days(days_back);
    let mut events = Vec::new();

    for (path, event_type) in persona
        .page_sequence
        .iter()
        .zip(persona.event_types.iter())
    {
        let offset_secs = rng.gen_range(0..(days_back * 86400));
        let _event_time = start + Duration::seconds(offset_secs);
        let page_url = format!("{}{}", SITE_ORIGIN, path);

        events.push(IncomingEvent {
            event_type: event_type.to_string(),
            page_url,
            referrer: persona.referrer.to_string(),
            user_agent: persona.user_agent.clone(),
            session_id: persona.fingerprint.clone(),
            properties: serde_json::json!({}),
        });
    }

    events
}

/// Generates web-analytics drain format events for a persona.
pub fn generate_web_analytics_drain_events(
    persona: &MockPersona,
    days_back: i64,
    rng: &mut impl Rng,
) -> Vec<WebAnalyticsDrainEvent> {
    let now = Utc::now();
    let start = now - Duration::days(days_back);
    let mut events = Vec::new();

    for (path, event_type) in persona
        .page_sequence
        .iter()
        .zip(persona.event_types.iter())
    {
        let offset_secs = rng.gen_range(0..(days_back * 86400));
        let event_time = start + Duration::seconds(offset_secs);
        let timestamp_ms = event_time.timestamp_millis();

        events.push(WebAnalyticsDrainEvent {
            schema: "analytics.mock.v1".to_string(),
            event_type: "pageview".to_string(),
            event_name: event_type.to_string(),
            event_data: "{}".to_string(),
            timestamp: timestamp_ms,
            path: path.to_string(),
            origin: SITE_ORIGIN.to_string(),
            referrer: persona.referrer.to_string(),
            session_id: 0,
            device_id: persona.device_id,
            fingerprint: persona.fingerprint.clone(),
        });
    }

    events
}

/// Generates IncomingEvents for all personas.
pub fn generate_all_incoming_events(
    days_back: i64,
    rng: &mut impl Rng,
) -> Vec<IncomingEvent> {
    let mut all = Vec::new();
    for persona in MockPersona::all() {
        all.extend(generate_incoming_events(&persona, days_back, rng));
    }
    all
}

/// Generates [`WebAnalyticsDrainPayload`] (array) for all personas.
pub fn generate_all_web_analytics_drain_payloads(
    days_back: i64,
    rng: &mut impl Rng,
) -> Vec<WebAnalyticsDrainPayload> {
    MockPersona::all()
        .iter()
        .map(|p| {
            let events = generate_web_analytics_drain_events(p, days_back, rng);
            WebAnalyticsDrainPayload::Array(events)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::SeedableRng;
    use rand_chacha::ChaCha8Rng;

    #[test]
    fn persona_has_unique_fingerprint_and_device_id() {
        let personas = MockPersona::all();
        let fps: std::collections::HashSet<_> = personas.iter().map(|p| p.fingerprint.as_str()).collect();
        let devs: std::collections::HashSet<_> = personas.iter().map(|p| p.device_id).collect();
        assert_eq!(fps.len(), personas.len());
        assert_eq!(devs.len(), personas.len());
    }

    #[test]
    fn generate_incoming_events_produces_correct_session_id() {
        let persona = MockPersona::hn_reader();
        let mut rng = ChaCha8Rng::seed_from_u64(42);
        let events = generate_incoming_events(&persona, 7, &mut rng);
        assert!(!events.is_empty());
        for e in &events {
            assert_eq!(e.session_id, persona.fingerprint);
            assert!(!e.page_url.is_empty());
            assert!(e.page_url.starts_with(SITE_ORIGIN));
        }
    }

    #[test]
    fn generate_web_analytics_drain_events_has_fingerprint_and_device_id() {
        let persona = MockPersona::rss_subscriber();
        let mut rng = ChaCha8Rng::seed_from_u64(123);
        let events = generate_web_analytics_drain_events(&persona, 14, &mut rng);
        assert!(!events.is_empty());
        for e in &events {
            assert_eq!(e.fingerprint, persona.fingerprint);
            assert_eq!(e.device_id, persona.device_id);
            assert!(!e.path.is_empty());
        }
    }

    #[test]
    fn each_persona_has_at_least_three_events() {
        for persona in MockPersona::all() {
            assert!(
                persona.page_sequence.len() >= 3,
                "persona {} should have at least 3 pages for LLM summarization",
                persona.fingerprint
            );
        }
    }
}
