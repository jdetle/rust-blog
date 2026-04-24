//! Browser/edge visitor signals for avatar and analytics prompts.

use serde::{Deserialize, Serialize};

/// All browser/edge signals collected by the client, plus optional activity signals
/// populated server-side from AnalyticsDb. Activity fields are never round-tripped to
/// the client — they are injected by the avatar handler before calling generate_regional_collage.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserContext {
    // Geo (from edge headers / ipapi)
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub latitude: Option<String>,
    pub longitude: Option<String>,
    pub timezone_ip: Option<String>,
    pub asn: Option<String>,
    pub org: Option<String>,
    pub is_eu: Option<bool>,
    pub currency: Option<String>,
    pub calling_code: Option<String>,
    // Device
    pub browser: Option<String>,
    pub os: Option<String>,
    pub device_type: Option<String>,
    pub screen: Option<String>,
    pub gpu: Option<String>,
    pub cores: Option<String>,
    pub ram: Option<String>,
    // Capabilities
    pub timezone_browser: Option<String>,
    pub languages: Option<String>,
    pub dark_mode: Option<bool>,
    pub reduced_motion: Option<bool>,
    pub connection_type: Option<String>,
    // Referral
    pub referrer_type: Option<String>,
    pub utm: Option<String>,
    // VPN assessment
    pub vpn_verdict: Option<String>,
    /// Heuristic: IP geo matches common VPN exit hosting regions (from edge-detect / client).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vpn_exit_location_hint: Option<String>,
    // PostHog session (for cache key only — not included in prompt)
    pub posthog_session_id: Option<String>,
    // Activity (server-side only — populated from AnalyticsDb, not sent by client)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_event_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_minutes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event_type: Option<String>,
    /// Client-built summary from `/api/analytics/my-events` (PostHog + warehouse union).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unified_engagement_log: Option<String>,
}

impl UserContext {
    /// Render all fields into a labelled block for inclusion in prompts.
    pub fn to_prompt_block(&self) -> String {
        let mut lines: Vec<String> = Vec::new();
        let push = |lines: &mut Vec<String>, label: &str, val: &Option<String>| {
            if let Some(v) = val {
                if !v.is_empty() {
                    lines.push(format!("- {label}: {v}"));
                }
            }
        };
        let push_bool = |lines: &mut Vec<String>, label: &str, val: Option<bool>| {
            if let Some(v) = val {
                lines.push(format!("- {label}: {}", if v { "yes" } else { "no" }));
            }
        };

        push(&mut lines, "City", &self.city);
        push(&mut lines, "Region", &self.region);
        push(&mut lines, "Country", &self.country);
        push(&mut lines, "Latitude", &self.latitude);
        push(&mut lines, "Longitude", &self.longitude);
        push(&mut lines, "IP timezone", &self.timezone_ip);
        push(&mut lines, "ASN", &self.asn);
        push(&mut lines, "Network org", &self.org);
        push_bool(&mut lines, "EU member", self.is_eu);
        push(&mut lines, "Currency", &self.currency);
        push(&mut lines, "Calling code", &self.calling_code);
        push(&mut lines, "Browser", &self.browser);
        push(&mut lines, "OS", &self.os);
        push(&mut lines, "Device type", &self.device_type);
        push(&mut lines, "Screen", &self.screen);
        push(&mut lines, "GPU", &self.gpu);
        push(&mut lines, "CPU cores", &self.cores);
        push(&mut lines, "RAM", &self.ram);
        push(&mut lines, "Browser timezone", &self.timezone_browser);
        push(&mut lines, "Languages", &self.languages);
        push_bool(&mut lines, "Dark mode preferred", self.dark_mode);
        push_bool(&mut lines, "Reduced motion", self.reduced_motion);
        push(&mut lines, "Connection type", &self.connection_type);
        push(&mut lines, "Referrer type", &self.referrer_type);
        push(&mut lines, "UTM tags", &self.utm);
        push(&mut lines, "VPN verdict", &self.vpn_verdict);
        push(
            &mut lines,
            "VPN exit geography (heuristic)",
            &self.vpn_exit_location_hint,
        );

        // Activity signals (server-side enrichment)
        if let Some(count) = self.recent_event_count {
            lines.push(format!("- Recent page views: {count}"));
        }
        if !self.recent_paths.is_empty() {
            lines.push(format!(
                "- Recently visited: {}",
                self.recent_paths.join(", ")
            ));
        }
        if let Some(mins) = self.session_minutes {
            lines.push(format!("- Session duration: {mins} min"));
        }
        push(&mut lines, "Last event type", &self.last_event_type);

        if let Some(ref engagement) = self.unified_engagement_log {
            if !engagement.is_empty() {
                lines.push(format!(
                    "Unified analytics sample (PostHog + first-party warehouse; other sources appear when tagged):\n{engagement}",
                ));
            }
        }

        if lines.is_empty() {
            return "(no signals available)".to_string();
        }
        lines.join("\n")
    }

    pub fn region_or_country(&self) -> String {
        [
            self.city.as_deref(),
            self.region.as_deref(),
            self.country.as_deref(),
        ]
        .iter()
        .filter_map(|x| *x)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
    }

    pub(crate) fn device_desc(&self) -> String {
        match (
            self.gpu.as_deref(),
            self.os.as_deref(),
            self.device_type.as_deref(),
        ) {
            (Some(gpu), Some(os), _) if !gpu.is_empty() => format!("{os} with {gpu}"),
            (_, Some(os), Some(dev)) => format!("{os} ({dev})"),
            (_, Some(os), _) => os.to_string(),
            _ => "unknown device".to_string(),
        }
    }

    pub(crate) fn connection_mood(&self) -> String {
        let conn = self.connection_type.as_deref().unwrap_or("unknown");
        let tz = self.timezone_browser.as_deref().unwrap_or("");
        if tz.is_empty() {
            format!("browsing on a {conn} connection")
        } else {
            format!("browsing on a {conn} connection in the {tz} timezone")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_block_includes_unified_engagement_log() {
        let ctx = UserContext {
            city: Some("Oslo".to_string()),
            unified_engagement_log: Some(
                "Recorded events in merged sample: 3\nBy source: posthog (2), warehouse (1)"
                    .to_string(),
            ),
            ..Default::default()
        };
        let block = ctx.to_prompt_block();
        assert!(block.contains("Unified analytics sample"));
        assert!(block.contains("posthog"));
    }
}
