//! Avatar generation via Anthropic + OpenAI.
//!
//! **Single composite image (production):** One Claude Haiku call derives a persona and one
//! fused `ART_DIRECTION` string synthesising regional palette, device texture, connection mood,
//! and persona archetype. One OpenAI gpt-image-1 call then renders a 1024×1024 PNG stored in
//! `user_profiles.avatar_png`. Cost: ~$0.04 per visitor/day vs ~$0.17 for the old 4-image path.
//!
//! **Observations:** A separate Claude Haiku call reads UserContext + recent events and emits
//! 6 one-sentence factual observations about the visitor's signals. Returned as a JSON array;
//! the client reveals them one-by-one during the ~20s image-generation wait.

use crate::anthropic::AnthropicClient;
use crate::openai_images::OpenAiImagesClient;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

const MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_TOKENS: u32 = 2048;
const MAX_PNG_B64_BYTES: usize = 3 * 1024 * 1024; // 3 MB encoded

// ── UserContext ──────────────────────────────────────────────────────

/// All browser/edge signals collected by the client, plus optional activity signals
/// populated server-side from AnalyticsDb. Activity fields are never round-tripped to
/// the client — they are injected by the avatar handler before calling generate_regional_collage.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserContext {
    // Geo (from Vercel Edge / ipapi)
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

        // Activity signals (server-side enrichment)
        if let Some(count) = self.recent_event_count {
            lines.push(format!("- Recent page views: {count}"));
        }
        if !self.recent_paths.is_empty() {
            lines.push(format!("- Recently visited: {}", self.recent_paths.join(", ")));
        }
        if let Some(mins) = self.session_minutes {
            lines.push(format!("- Session duration: {mins} min"));
        }
        push(&mut lines, "Last event type", &self.last_event_type);

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

    fn device_desc(&self) -> String {
        match (self.gpu.as_deref(), self.os.as_deref(), self.device_type.as_deref()) {
            (Some(gpu), Some(os), _) if !gpu.is_empty() => format!("{os} with {gpu}"),
            (_, Some(os), Some(dev)) => format!("{os} ({dev})"),
            (_, Some(os), _) => os.to_string(),
            _ => "unknown device".to_string(),
        }
    }

    fn connection_mood(&self) -> String {
        let conn = self.connection_type.as_deref().unwrap_or("unknown");
        let tz = self.timezone_browser.as_deref().unwrap_or("");
        if tz.is_empty() {
            format!("browsing on a {conn} connection")
        } else {
            format!("browsing on a {conn} connection in the {tz} timezone")
        }
    }
}

// ── Single composite image brief ────────────────────────────────────

/// Ask Claude Haiku for PERSONA + ART_DIRECTION.
///
/// ART_DIRECTION is a single fused art-direction sentence synthesising:
///   1. Regional/cultural colour palette and motifs from the visitor's location
///   2. Visual texture fitting the device era and capabilities
///   3. Mood and atmosphere evoking the visitor's connection context
///   4. Abstract archetype symbol for the inferred persona
pub fn build_regional_collage_prompt(
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
) -> String {
    let signal_block = ctx.to_prompt_block();
    let location = ctx.region_or_country();
    let location_str = if location.is_empty() {
        "an unknown location".to_string()
    } else {
        location.clone()
    };
    let prior_hint = prior_persona
        .filter(|s| !s.is_empty())
        .map(|p| format!("\nPrevious persona guess (refine, don't repeat verbatim): {p}\n"))
        .unwrap_or_default();

    format!(
        r#"You are an AI helping a privacy-education blog create a personalised avatar image for a visitor.

Canvas fingerprint (a browser rendering hash, not PII): `{fp}`
{prior_hint}
Visitor signals:
{signals}

Based on the signals — especially the location ({location}), device ({device}), and browsing context ({connection}) — produce exactly two labelled lines:

PERSONA: ONE short, clearly fictional and speculative sentence about what kind of person this visitor might be. Tone: warm and playful, never creepy. Start with "Probably" or "Maybe".

ART_DIRECTION: ONE rich sentence (max 40 words) synthesising all four themes into a single cohesive painterly style directive: (1) a colour palette and visual motif from {location}'s regional art traditions (not living individuals), (2) a surface texture fitting the visitor's device ({device}), (3) a mood and atmosphere evoking someone {connection}, (4) an abstract archetype symbol for the persona. Write as a single flowing image-generator brief.

Format — no markdown, no extra lines:
PERSONA: <sentence>
ART_DIRECTION: <sentence>"#,
        fp = fingerprint,
        signals = signal_block,
        location = location_str,
        prior_hint = prior_hint,
        device = ctx.device_desc(),
        connection = ctx.connection_mood(),
    )
}

async fn derive_regional_collage_brief(
    anthropic: &AnthropicClient,
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let claude_prompt = build_regional_collage_prompt(fingerprint, ctx, prior_persona);
    let claude_raw = anthropic.messages(MODEL, MAX_TOKENS, &claude_prompt).await?;

    let persona = extract_labeled_line(&claude_raw, "PERSONA");
    let art_direction = extract_labeled_line(&claude_raw, "ART_DIRECTION");

    let persona = if persona.is_empty() {
        "A speculative, fictional visitor sketch — not a real identification.".to_string()
    } else {
        persona
    };
    let art_direction = if art_direction.is_empty() {
        "Abstract regional motifs in vibrant palette, layered with geometric device-era texture and organic mood washes, anchored by an archetype symbol in teal and copper.".to_string()
    } else {
        art_direction
    };

    Ok((persona, art_direction))
}

pub struct RegionalCollageResult {
    pub persona: String,
    pub png: Option<String>,
    pub image_generation_failed: bool,
    pub image_error: Option<String>,
}

fn build_composite_prompt(persona: &str, art_direction: &str) -> String {
    format!(
        "Generate a 1024×1024 abstract portrait image representing a digital visitor.\n\n\
Visitor persona (fictional guess): {persona}\n\
Art direction: {art_direction}\n\n\
Render as a rich, layered abstract composition — not a photograph or portrait of a real person. \
No text, no logos, no faces. Let colour, texture, and form evoke this visitor's unique data signature. \
The image should feel like a unified portrait of digital identity — introspective, painterly, and specific.",
        persona = persona,
        art_direction = art_direction,
    )
}

fn build_evolution_prompt(persona: &str, art_direction: &str) -> String {
    format!(
        "You are given the visitor's previous day's abstract digital-identity portrait. \
Create a refined 1024×1024 version for today: evolve the composition — preserve mood, palette family, and continuity — \
while incorporating today's persona and art direction. It should feel like the next chapter of the same portrait, not an unrelated image.\n\n\
Today's visitor persona (fictional guess): {persona}\n\
Today's art direction: {art_direction}\n\n\
Rules: abstract composition only — not a photograph or portrait of a real person. No text, no logos, no faces.",
        persona = persona,
        art_direction = art_direction,
    )
}

// ── Generation ────────────────────────────────────────────────────────

/// Single composite image pipeline:
/// 1. Claude Haiku → PERSONA + ART_DIRECTION (fused from region/device/mood/archetype)
/// 2. One OpenAI gpt-image-1 call renders the composite
///
/// Returns a persona guess and, when image generation succeeds, a single PNG as a raw
/// base64 string (no `data:` prefix). Cost: ~$0.04 per visitor/day.
///
/// When `prior_png_b64` is set (previous calendar day's image), uses image **edits** so the new
/// image builds on the last; otherwise uses **generations** from the text prompt alone.
pub async fn generate_regional_collage(
    openai: &OpenAiImagesClient,
    anthropic: &AnthropicClient,
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
    prior_png_b64: Option<&str>,
) -> Result<RegionalCollageResult, Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Claude derives persona + fused art direction.
    let (persona, art_direction) =
        derive_regional_collage_brief(anthropic, fingerprint, ctx, prior_persona).await?;

    // Step 2: OpenAI — edit from prior image when present, else generate fresh.
    let fresh_prompt = build_composite_prompt(&persona, &art_direction);
    let png_b64 = if let Some(prior) = prior_png_b64 {
        let evolution = build_evolution_prompt(&persona, &art_direction);
        match openai.edit_with_reference(&evolution, prior).await {
            Ok(b64) => b64,
            Err(e) => {
                tracing::warn!(error = %e, "OpenAI image edit failed; falling back to text generation");
                match openai.generate(&fresh_prompt).await {
                    Ok(b64) => b64,
                    Err(e2) => {
                        return Ok(RegionalCollageResult {
                            persona,
                            png: None,
                            image_generation_failed: true,
                            image_error: Some(format!("OpenAI composite image failed: {e2}")),
                        });
                    }
                }
            }
        }
    } else {
        match openai.generate(&fresh_prompt).await {
            Ok(b64) => b64,
            Err(e) => {
                return Ok(RegionalCollageResult {
                    persona,
                    png: None,
                    image_generation_failed: true,
                    image_error: Some(format!("OpenAI composite image failed: {e}")),
                });
            }
        }
    };

    if let Err(e) = validate_png_b64(&png_b64) {
        return Ok(RegionalCollageResult {
            persona,
            png: None,
            image_generation_failed: true,
            image_error: Some(format!("OpenAI composite validation failed: {e}")),
        });
    }

    Ok(RegionalCollageResult {
        persona,
        png: Some(png_b64),
        image_generation_failed: false,
        image_error: None,
    })
}

// ── Observations ─────────────────────────────────────────────────────

/// Generate 6 factual one-sentence observations about the visitor's analytics signals.
///
/// Each observation starts with "•". The list is returned as a `Vec<String>` of individual
/// sentences for the client to reveal one-by-one during the image-generation wait.
pub async fn generate_observations(
    anthropic: &AnthropicClient,
    ctx: &UserContext,
) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
    let signal_block = ctx.to_prompt_block();
    let prompt = format!(
        r#"You are a data analyst reading a web visitor's browser signals for a privacy-education page.

Write exactly 6 specific, factual observations about this visitor's signals.

Rules:
- Each observation is one complete sentence
- Start every observation on its own line beginning with "•"
- Use specific values from the data: exact city, browser version, GPU model, etc.
- State observable facts only — describe what the data shows, not advice or judgements
- Do not greet the visitor, do not add a preamble or conclusion

Signals:
{signals}"#,
        signals = signal_block,
    );

    let raw = anthropic.messages(MODEL, MAX_TOKENS, &prompt).await?;
    let observations = parse_observations(&raw);
    Ok(observations)
}

fn parse_observations(raw: &str) -> Vec<String> {
    raw.lines()
        .map(|l| l.trim())
        .filter(|l| l.starts_with('•'))
        .map(|l| l.trim_start_matches('•').trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

// ── Validation ────────────────────────────────────────────────────────

/// Validate that a base64 string decodes to a PNG and is within the size limit.
pub fn validate_png_b64(b64: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if b64.len() > MAX_PNG_B64_BYTES {
        return Err(format!("PNG b64 too large ({} bytes)", b64.len()).into());
    }
    // Decode just the first 8 bytes to verify PNG magic bytes.
    let prefix = &b64[..b64.len().min(16)];
    let decoded = B64.decode(prefix).unwrap_or_default();
    let png_magic = [0x89u8, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if decoded.len() >= 8 && decoded[..8] != png_magic {
        return Err("b64 does not decode to a valid PNG".into());
    }
    Ok(())
}

fn extract_labeled_line(text: &str, label: &str) -> String {
    let prefix = format!("{}:", label.to_uppercase());
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.to_uppercase().starts_with(&prefix) {
            return trimmed[prefix.len()..].trim().to_string();
        }
    }
    String::new()
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn regional_prompt_contains_fingerprint_and_all_labels() {
        let ctx = UserContext {
            city: Some("Austin".to_string()),
            country: Some("United States".to_string()),
            languages: Some("en-US".to_string()),
            ..Default::default()
        };
        let prompt = build_regional_collage_prompt("deadbeef", &ctx, None);
        assert!(prompt.contains("deadbeef"));
        assert!(prompt.contains("PERSONA:"));
        assert!(prompt.contains("ART_DIRECTION:"));
    }

    #[test]
    fn regional_prompt_contains_all_signals() {
        let ctx = UserContext {
            city: Some("Tokyo".to_string()),
            region: Some("Kanto".to_string()),
            country: Some("Japan".to_string()),
            browser: Some("Firefox 124".to_string()),
            os: Some("macOS 14".to_string()),
            gpu: Some("Apple M3".to_string()),
            languages: Some("ja".to_string()),
            dark_mode: Some(true),
            vpn_verdict: Some("residential".to_string()),
            referrer_type: Some("search".to_string()),
            ..Default::default()
        };
        let prompt = build_regional_collage_prompt("aabbccdd", &ctx, None);
        assert!(prompt.contains("Tokyo"));
        assert!(prompt.contains("Japan"));
        assert!(prompt.contains("Firefox 124"));
        assert!(prompt.contains("macOS 14"));
        assert!(prompt.contains("Apple M3"));
        assert!(prompt.contains("ja"));
        assert!(prompt.contains("residential"));
        assert!(prompt.contains("search"));
    }

    #[test]
    fn regional_prompt_includes_prior_persona_hint() {
        let ctx = UserContext::default();
        let prompt =
            build_regional_collage_prompt("fp", &ctx, Some("Probably a developer who loves Rust"));
        assert!(prompt.contains("Probably a developer who loves Rust"));
    }

    #[test]
    fn regional_prompt_includes_activity_signals() {
        let ctx = UserContext {
            city: Some("Berlin".to_string()),
            recent_event_count: Some(7),
            recent_paths: vec!["/posts/rust".to_string(), "/who-are-you".to_string()],
            session_minutes: Some(12),
            last_event_type: Some("pageview".to_string()),
            ..Default::default()
        };
        let prompt = build_regional_collage_prompt("actfp", &ctx, None);
        assert!(prompt.contains("Recent page views: 7"));
        assert!(prompt.contains("/posts/rust"));
        assert!(prompt.contains("Session duration: 12 min"));
        assert!(prompt.contains("pageview"));
    }

    #[test]
    fn validate_png_b64_rejects_oversized() {
        let huge = "A".repeat(MAX_PNG_B64_BYTES + 1);
        assert!(validate_png_b64(&huge).is_err());
    }

    #[test]
    fn extract_labeled_line_parses_persona_and_art_direction() {
        let text = "PERSONA: Probably a builder.\nART_DIRECTION: Ukiyo-e indigo waves meet crisp M3 geometry, late-night watercolour mood, circuit archetype in teal.";
        assert_eq!(extract_labeled_line(text, "PERSONA"), "Probably a builder.");
        assert_eq!(
            extract_labeled_line(text, "ART_DIRECTION"),
            "Ukiyo-e indigo waves meet crisp M3 geometry, late-night watercolour mood, circuit archetype in teal."
        );
    }

    #[test]
    fn parse_observations_extracts_bullet_lines() {
        let raw = "Here are some observations:\n• You are browsing from Tokyo, Japan.\n• Your browser is Firefox 124 on macOS.\n• Your GPU is Apple M3 Pro.\n• You are on a residential connection.\n• Dark mode is enabled.\n• Your screen resolution is 2560x1664.";
        let obs = parse_observations(raw);
        assert_eq!(obs.len(), 6);
        assert!(obs[0].contains("Tokyo"));
        assert!(obs[1].contains("Firefox"));
        assert!(obs[5].contains("2560"));
    }

    #[test]
    fn parse_observations_handles_empty_input() {
        let obs = parse_observations("No bullet points here.");
        assert!(obs.is_empty());
    }
}
