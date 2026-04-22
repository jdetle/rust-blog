//! Avatar generation via Anthropic + OpenAI.
//!
//! **Single composite image (production):** Server-side [`crate::origin_enrichment`] fetches
//! public facts (Open-Meteo, REST Countries, World Bank employment mix, optional Wikipedia,
//! place image context via Google Custom Search when configured or Wikimedia Commons). One Claude
//! Sonnet call derives a persona and fused `ART_DIRECTION` grounded in those facts plus browser
//! signals. One OpenAI gpt-image-1 call renders a 1024×1024 PNG stored in `user_profiles.avatar_png`
//! / `avatar_pngs`.
//!
//! **Observations:** A separate Claude Haiku call reads UserContext + recent events and emits
//! 6 one-sentence factual observations about the visitor's signals. Returned as a JSON array;
//! the client reveals them one-by-one during the ~20s image-generation wait.

use crate::anthropic::AnthropicClient;
use crate::openai_images::OpenAiImagesClient;
use crate::origin_enrichment::{self, OriginEnrichment};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;

pub use crate::user_context::UserContext;

const MODEL_OBSERVATIONS: &str = "claude-haiku-4-5-20251001";
/// Collage brief: Sonnet for richer synthesis grounded in origin API facts.
const MODEL_COLLAGE: &str = "claude-sonnet-4-5-20250929";
const MAX_TOKENS: u32 = 4096;
const MAX_PNG_B64_BYTES: usize = 3 * 1024 * 1024; // 3 MB encoded

// ── Single composite image brief ────────────────────────────────────

/// Ask Claude Sonnet for PERSONA + ART_DIRECTION (grounded in optional public API enrichment).
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
    enrichment: &OriginEnrichment,
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

    let origin_facts = enrichment.to_prompt_block();
    let cc = ctx
        .country
        .as_deref()
        .and_then(origin_enrichment::sanitize_country_code)
        .unwrap_or_default();
    let date_utc = Utc::now().format("%Y-%m-%d").to_string();
    let axes = origin_enrichment::composition_axes(
        fingerprint,
        &cc,
        enrichment.weather_code,
        &date_utc,
    );

    format!(
        r#"You are an AI helping a privacy-education blog create a personalised abstract avatar image for a visitor.

Canvas fingerprint (a browser rendering hash, not PII): `{fp}`
{prior_hint}
Visitor signals (browser and network hints, not identity):
{signals}

Public origin enrichment (from lat/lon and country code via public APIs — use for atmosphere only, not to claim this is the real person):
{origin_facts}

Composition variety (deterministic abstract axes — honour in the visual brief, not literally):
{axes}

Ground your creative choices in the enrichment facts and signals where they help. Do NOT lean on stereotypes, caricatures, or "national character" tropes. The persona line is clearly fictional speculation — warm and playful, never creepy. Do not imply surveillance or real identification.

Based on the signals — especially the location ({location}), device ({device}), browsing context ({connection}), and the origin enrichment when present — produce exactly two labelled lines:

PERSONA: ONE short, clearly fictional and speculative sentence about what kind of life rhythm or mood *might* fit someone in this approximate place and context (not a real individual). Tone: warm and playful. Start with "Probably" or "Maybe".

ART_DIRECTION: ONE rich sentence (max 60 words) synthesising into one cohesive painterly style directive: (1) colour palette and visual motif from {location}'s regional art traditions or craft aesthetics where relevant (not living individuals), informed by weather/time-of-day and — when present — image-search motifs (landmarks, nature, skyline) as abstract shapes only; (2) a hint of economic rhythm from employment-sector statistics when present (abstractly, not as job portraits); (3) surface texture fitting the visitor's device ({device}); (4) mood evoking someone {connection}; (5) an abstract archetype symbol; (6) the composition variety line above. No faces, no text, no logos.

Format — no markdown, no extra lines:
PERSONA: <sentence>
ART_DIRECTION: <sentence>"#,
        fp = fingerprint,
        signals = signal_block,
        origin_facts = origin_facts,
        axes = axes,
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
    let enrichment = origin_enrichment::enrich_for_avatar(ctx).await;
    let claude_prompt = build_regional_collage_prompt(fingerprint, ctx, prior_persona, &enrichment);
    let claude_raw = anthropic
        .messages(MODEL_COLLAGE, MAX_TOKENS, &claude_prompt)
        .await?;

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

fn build_evolution_prompt_multi(prior_count: usize, persona: &str, art_direction: &str) -> String {
    format!(
        "You are given {prior_count} prior abstract digital-identity portrait(s) of the same visitor, in chronological order (oldest first). \
Use the full visual lineage as continuity context — colour families, compositional rhythm, and emotional through-line — while evolving toward today's brief. \
The output should feel like the next chapter of the same evolving portrait, not an unrelated image.\n\n\
Today's visitor persona (fictional guess): {persona}\n\
Today's art direction: {art_direction}\n\n\
Rules: abstract composition only — not a photograph or portrait of a real person. No text, no logos, no faces.",
        prior_count = prior_count,
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
/// When `prior_png_b64s` is non-empty (stored history), uses image **edits** with all prior images
/// as reference context; otherwise uses **generations** from the text prompt alone.
pub async fn generate_regional_collage(
    openai: &OpenAiImagesClient,
    anthropic: &AnthropicClient,
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
    prior_png_b64s: &[String],
) -> Result<RegionalCollageResult, Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Claude derives persona + fused art direction.
    let (persona, art_direction) =
        derive_regional_collage_brief(anthropic, fingerprint, ctx, prior_persona).await?;

    // Step 2: OpenAI — edit from prior image(s) when present, else generate fresh.
    let fresh_prompt = build_composite_prompt(&persona, &art_direction);
    let png_b64 = if !prior_png_b64s.is_empty() {
        let evolution = if prior_png_b64s.len() == 1 {
            build_evolution_prompt(&persona, &art_direction)
        } else {
            build_evolution_prompt_multi(prior_png_b64s.len(), &persona, &art_direction)
        };
        let refs: Vec<&str> = prior_png_b64s.iter().map(|s| s.as_str()).collect();
        let edit_result = openai.edit_with_references(&evolution, &refs).await;
        let edit_result = match edit_result {
            Ok(b64) => Ok(b64),
            Err(e) if prior_png_b64s.len() > 1 => {
                tracing::warn!(error = %e, "OpenAI multi-reference edit failed; retrying with latest image only");
                openai
                    .edit_with_reference(
                        &evolution,
                        prior_png_b64s
                            .last()
                            .expect("prior_png_b64s.len() > 1 implies non-empty"),
                    )
                    .await
            }
            Err(e) => Err(e),
        };
        match edit_result {
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
- When the signals include recent page views, session duration, unified analytics samples (sources such as PostHog or first-party warehouse), or paths visited, you may include at most 2 bullets about repeat visits, breadth of engagement, or event-type patterns — still purely factual counts and labels, not interpretation of intent
- State observable facts only — describe what the data shows, not advice or judgements
- Do not greet the visitor, do not add a preamble or conclusion

Signals:
{signals}"#,
        signals = signal_block,
    );

    let raw = anthropic
        .messages(MODEL_OBSERVATIONS, MAX_TOKENS, &prompt)
        .await?;
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
        let prompt = build_regional_collage_prompt("deadbeef", &ctx, None, &OriginEnrichment::default());
        assert!(prompt.contains("deadbeef"));
        assert!(prompt.contains("PERSONA:"));
        assert!(prompt.contains("ART_DIRECTION:"));
        assert!(prompt.contains("Public origin enrichment"));
        assert!(prompt.contains("Composition variety"));
    }

    #[test]
    fn regional_prompt_includes_origin_enrichment_facts() {
        let ctx = UserContext {
            city: Some("Oslo".to_string()),
            country: Some("NO".to_string()),
            ..Default::default()
        };
        let mut e = OriginEnrichment::default();
        e.weather_temperature_c = Some(-2.0);
        e.country_name = Some("Norway".to_string());
        e.employment_summary = Some("~2% agriculture, ~20% industry, ~78% services".to_string());
        e.place_photo_context = Some("Wikimedia Commons file names: File:Oslofjord.jpg".to_string());
        let prompt = build_regional_collage_prompt("fp2", &ctx, None, &e);
        assert!(prompt.contains("-2.0"));
        assert!(prompt.contains("Norway"));
        assert!(prompt.contains("agriculture"));
        assert!(prompt.contains("Oslofjord"));
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
        let prompt = build_regional_collage_prompt("aabbccdd", &ctx, None, &OriginEnrichment::default());
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
        let prompt = build_regional_collage_prompt(
            "fp",
            &ctx,
            Some("Probably a developer who loves Rust"),
            &OriginEnrichment::default(),
        );
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
        let prompt = build_regional_collage_prompt("actfp", &ctx, None, &OriginEnrichment::default());
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
