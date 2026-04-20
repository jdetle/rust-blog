//! Avatar generation via Anthropic + OpenAI.
//!
//! **4-image collage (production):** One Claude Haiku call derives a persona and four distinct
//! art-direction strings (region/culture, device era, network-mood, persona archetype).
//! Four OpenAI gpt-image-1 calls then fire in parallel — one per art direction — returning
//! four 1024×1024 PNGs stored in `user_profiles.avatar_png[1-4]`.
//!
//! **Observations:** A separate Claude Haiku call reads UserContext + recent events and emits
//! 6 one-sentence factual observations about the visitor's signals. Returned as a JSON array;
//! the client reveals them one-by-one during the ~40s image-generation wait.

use crate::anthropic::AnthropicClient;
use crate::openai_images::OpenAiImagesClient;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

const MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_TOKENS: u32 = 2048;
const MAX_PNG_B64_BYTES: usize = 3 * 1024 * 1024; // 3 MB encoded

// ── UserContext ──────────────────────────────────────────────────────

/// All browser/edge signals collected by the client.
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

// ── Four-image collage prompt ────────────────────────────────────────

/// Ask Claude Haiku for PERSONA + ART_1 through ART_4.
///
/// ART_1 — regional/cultural anchor
/// ART_2 — device-era visual language
/// ART_3 — network/time-of-day mood
/// ART_4 — abstract persona archetype
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
        r#"You are an AI helping a privacy-education blog create four personalised avatar images for a visitor.

Canvas fingerprint (a browser rendering hash, not PII): `{fp}`
{prior_hint}
Visitor signals:
{signals}

Based on the signals — especially the location ({location}) — produce exactly five labelled lines:

PERSONA: ONE short, clearly fictional and speculative sentence about what kind of person this visitor might be. Tone: warm and playful, never creepy. Start with "Probably" or "Maybe".

ART_1: ONE sentence describing an abstract art style evoking motifs, colour palettes, and visual traditions historically associated with art movements **from {location}** (not living individuals). Be specific: e.g. "Ukiyo-e woodblock indigo washes and diagonal wave forms".

ART_2: ONE sentence describing a visual language fitting the visitor's device era and capabilities ({device}). E.g. "Pixelated 8-bit dithering in warm amber tones" for old hardware, "Crisp vector geometry and glass morphism" for a modern M-series machine.

ART_3: ONE sentence capturing the mood of someone {connection}. Palette and texture should evoke that state: e.g. "Slow-dissolve watercolour washes in deep indigo for a late-night mobile scroll".

ART_4: ONE sentence as an abstract visual metaphor for the persona archetype. E.g. "Geometric data-stream circuits in teal and copper, evoking an engineer's mind".

Format — no markdown, no extra lines:
PERSONA: <sentence>
ART_1: <sentence>
ART_2: <sentence>
ART_3: <sentence>
ART_4: <sentence>"#,
        fp = fingerprint,
        signals = signal_block,
        location = location_str,
        prior_hint = prior_hint,
        device = ctx.device_desc(),
        connection = ctx.connection_mood(),
    )
}

fn build_slot_prompt(_location: &str, persona: &str, art: &str, slot_desc: &str) -> String {
    format!(
        "Generate a 1024×1024 abstract collage image. {slot_desc}\n\n\
Visitor persona (fictional guess): {persona}\n\
Visual style: {art}\n\n\
Render as a rich, layered abstract composition — not a photograph or portrait of a real person. \
No text, no logos, no faces. Evoke the spirit of the visitor's data through colour, texture, and form.",
        slot_desc = slot_desc,
        persona = persona,
        art = art,
    )
}

fn slot1_prompt(ctx: &UserContext, persona: &str, art: &str) -> String {
    let location = ctx.region_or_country();
    let loc = if location.is_empty() { "the visitor's region".to_string() } else { location };
    build_slot_prompt(
        &loc,
        persona,
        art,
        &format!("Theme: cultural and artistic heritage of {loc}."),
    )
}

fn slot2_prompt(ctx: &UserContext, persona: &str, art: &str) -> String {
    let device = ctx.device_desc();
    build_slot_prompt(
        "",
        persona,
        art,
        &format!("Theme: the visual language of a visitor using {device}."),
    )
}

fn slot3_prompt(ctx: &UserContext, persona: &str, art: &str) -> String {
    let mood = ctx.connection_mood();
    build_slot_prompt(
        "",
        persona,
        art,
        &format!("Theme: the mood and texture of someone {mood}."),
    )
}

fn slot4_prompt(persona: &str, art: &str) -> String {
    build_slot_prompt(
        "",
        persona,
        art,
        "Theme: an abstract visual metaphor for this visitor's persona archetype.",
    )
}

// ── Generation ────────────────────────────────────────────────────────

/// Full 4-image pipeline:
/// 1. Claude Haiku → PERSONA + ART_1..4
/// 2. Four parallel OpenAI gpt-image-1 calls
///
/// Returns `(persona_line, [b64_1, b64_2, b64_3, b64_4])` where each b64 is raw
/// (no `data:` prefix) and encodes a 1024×1024 PNG.
pub async fn generate_regional_collage(
    openai: &OpenAiImagesClient,
    anthropic: &AnthropicClient,
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
) -> Result<(String, [String; 4]), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Claude derives persona + 4 art-directions.
    let claude_prompt = build_regional_collage_prompt(fingerprint, ctx, prior_persona);
    let claude_raw = anthropic.messages(MODEL, MAX_TOKENS, &claude_prompt).await?;

    let persona = extract_labeled_line(&claude_raw, "PERSONA");
    let art_1 = extract_labeled_line(&claude_raw, "ART_1");
    let art_2 = extract_labeled_line(&claude_raw, "ART_2");
    let art_3 = extract_labeled_line(&claude_raw, "ART_3");
    let art_4 = extract_labeled_line(&claude_raw, "ART_4");

    let persona = if persona.is_empty() {
        "A speculative, fictional visitor sketch — not a real identification.".to_string()
    } else {
        persona
    };
    let art_1 = if art_1.is_empty() { "Abstract regional art motifs in vibrant colours.".to_string() } else { art_1 };
    let art_2 = if art_2.is_empty() { "Clean geometric forms in neutral tones.".to_string() } else { art_2 };
    let art_3 = if art_3.is_empty() { "Flowing organic shapes in muted blues.".to_string() } else { art_3 };
    let art_4 = if art_4.is_empty() { "Data-stream circuits in teal and copper.".to_string() } else { art_4 };

    // Step 2: Four parallel OpenAI image calls.
    let p1 = slot1_prompt(ctx, &persona, &art_1);
    let p2 = slot2_prompt(ctx, &persona, &art_2);
    let p3 = slot3_prompt(ctx, &persona, &art_3);
    let p4 = slot4_prompt(&persona, &art_4);

    let (r1, r2, r3, r4) = tokio::join!(
        openai.generate(&p1),
        openai.generate(&p2),
        openai.generate(&p3),
        openai.generate(&p4),
    );

    let b1 = r1.map_err(|e| format!("OpenAI slot 1 failed: {e}"))?;
    let b2 = r2.map_err(|e| format!("OpenAI slot 2 failed: {e}"))?;
    let b3 = r3.map_err(|e| format!("OpenAI slot 3 failed: {e}"))?;
    let b4 = r4.map_err(|e| format!("OpenAI slot 4 failed: {e}"))?;

    validate_png_b64(&b1)?;
    validate_png_b64(&b2)?;
    validate_png_b64(&b3)?;
    validate_png_b64(&b4)?;

    Ok((persona, [b1, b2, b3, b4]))
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
        assert!(prompt.contains("ART_1:"));
        assert!(prompt.contains("ART_2:"));
        assert!(prompt.contains("ART_3:"));
        assert!(prompt.contains("ART_4:"));
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
    fn validate_png_b64_rejects_oversized() {
        let huge = "A".repeat(MAX_PNG_B64_BYTES + 1);
        assert!(validate_png_b64(&huge).is_err());
    }

    #[test]
    fn extract_labeled_line_parses_all_four_art_labels() {
        let text = "PERSONA: Probably a builder.\nART_1: Ukiyo-e waves.\nART_2: Bauhaus geometry.\nART_3: Midnight washes.\nART_4: Circuit diagrams.";
        assert_eq!(extract_labeled_line(text, "PERSONA"), "Probably a builder.");
        assert_eq!(extract_labeled_line(text, "ART_1"), "Ukiyo-e waves.");
        assert_eq!(extract_labeled_line(text, "ART_2"), "Bauhaus geometry.");
        assert_eq!(extract_labeled_line(text, "ART_3"), "Midnight washes.");
        assert_eq!(extract_labeled_line(text, "ART_4"), "Circuit diagrams.");
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
