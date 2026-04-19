//! Avatar generation — two modes:
//!
//! **New (regional collage):** Claude Haiku derives a persona + art-direction from the visitor's
//! browser/geo signals, then OpenAI gpt-image-1 renders a 1024×1024 regional-artist collage
//! that "aligns spiritually" with that guess. PNG stored as base64 in `user_profiles.avatar_png`.
//!
//! **Legacy (SVG):** Claude Haiku emits an inline SVG directly. Still used when OpenAI is not
//! configured (`openai: None` in `AppState`). Kept for backward compatibility.

use crate::anthropic::AnthropicClient;
use crate::openai_images::OpenAiImagesClient;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

// ── Legacy SVG constants ─────────────────────────────────────────────
const MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_TOKENS: u32 = 2048;
const MAX_SVG_CHARS: usize = 48_000;
const MAX_PNG_B64_BYTES: usize = 3 * 1024 * 1024; // 3 MB encoded

// ── UserContext ──────────────────────────────────────────────────────

/// All browser/edge signals collected by the client, forwarded verbatim into the prompt so both
/// the persona guess and the image generation have as much context as possible.
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
    fn to_prompt_block(&self) -> String {
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

    fn region_or_country(&self) -> String {
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
}

// ── Regional collage flow (new) ──────────────────────────────────────

/// Build the Claude Haiku prompt for deriving a persona + art-direction string.
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
        location
    };
    let prior_hint = prior_persona
        .filter(|s| !s.is_empty())
        .map(|p| format!("\nPrevious persona guess (refine, don't repeat verbatim): {p}\n"))
        .unwrap_or_default();

    format!(
        r#"You are an AI helping a privacy-education blog create a personalised avatar for a visitor.

Canvas fingerprint (a browser rendering hash, not PII): `{fp}`
{prior_hint}
Visitor signals:
{signals}

Based on the signals above — especially the location ({location}) — do two things:

1. PERSONA: Write ONE short, clearly **fictional and speculative** sentence about what kind of person this visitor might be. Tone: warm and playful, never creepy. Start with "Probably" or "Maybe". Do not claim to identify a real person.

2. ART_DIRECTION: Write ONE sentence describing the visual style for a 1024×1024 image collage that "aligns spiritually" with your persona guess and the visitor's geographic and cultural context. Reference artistic traditions, colour palettes, or motifs historically associated with artists **from {location}** (not living individuals). Be specific about style: e.g. "Ukiyo-e woodblock waves and indigo gradients", "Austin psychedelic concert-poster geometry in turquoise and burnt orange", "Lagos Afrobeats album-art brightness with batik textile patterns".

Format (no markdown, no extra lines):
PERSONA: <one sentence>
ART_DIRECTION: <one sentence>"#,
        fp = fingerprint,
        signals = signal_block,
        location = location_str,
        prior_hint = prior_hint,
    )
}

/// Build the OpenAI image-generation prompt from the persona + art-direction.
fn build_image_prompt(
    ctx: &UserContext,
    persona: &str,
    art_direction: &str,
) -> String {
    let location = ctx.region_or_country();
    let location_str = if location.is_empty() {
        "the visitor's home region".to_string()
    } else {
        location
    };

    format!(
        "Generate a collage 1000px×1000px of artists' work from {location}. \
After each unique visit, update the avatar to align spiritually with our guess of who the user is.\n\n\
Visitor: {persona}\n\
Visual style: {art}.\n\n\
Render as a rich, layered collage evoking motifs, colour palettes, and artistic heritage historically associated with artists from {location}. \
Abstract and expressive — not a photograph of a real person. No text, no logos.",
        location = location_str,
        persona = persona,
        art = art_direction,
    )
}

/// Full collage generation pipeline.
///
/// 1. Claude Haiku: persona + art-direction from visitor signals.
/// 2. OpenAI gpt-image-1: 1024×1024 PNG collage.
///
/// Returns `(persona_line, data_uri)` where `data_uri` starts with `data:image/png;base64,`.
pub async fn generate_regional_collage(
    openai: &OpenAiImagesClient,
    anthropic: &AnthropicClient,
    fingerprint: &str,
    ctx: &UserContext,
    prior_persona: Option<&str>,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    // Step 1: Claude derives persona + art-direction.
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
        "An abstract collage of regional art motifs in vibrant colours.".to_string()
    } else {
        art_direction
    };

    // Step 2: OpenAI renders the collage.
    let image_prompt = build_image_prompt(ctx, &persona, &art_direction);
    let b64 = openai.generate(&image_prompt).await?;
    validate_png_b64(&b64)?;

    let data_uri = format!("data:image/png;base64,{b64}");
    Ok((persona, data_uri))
}

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

// ── Legacy SVG flow ───────────────────────────────────────────────────

fn build_prompt(fingerprint: &str, summary_hint: Option<&str>) -> String {
    let hint = summary_hint
        .filter(|s| !s.is_empty())
        .map(|s| format!("\nOptional context (browsing summary, may be empty):\n{s}\n"))
        .unwrap_or_default();

    format!(
        r#"You are helping a privacy-education page on a personal tech blog.

Given this **canvas fingerprint hash** (a browser rendering id, not a name or PII):
`{fp}`
{hint}

1) Write **PERSONA:** followed by ONE short sentence — a clearly **fictional, speculative** guess about what *kind* of visitor they might be (tone: playful, not creepy). Say it is a guess. Do not claim to identify a real person.

2) On the next lines, output **SVG:** then a single complete **inline SVG** document: abstract or mascot-style, **not** a photorealistic human face. viewBox="0 0 128 128", width="128" height="128". Use a stable palette derived from the fingerprint string (hash the chars mentally for hue choices). No text inside the SVG.

3) No markdown code fences. No XML declaration. The SVG must start with `<svg` and end with `</svg>`.

Example shape (your content must differ):
PERSONA: Probably a curious builder who reads long posts — just a guess.
SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">...</svg>"#,
        fp = fingerprint,
        hint = hint,
    )
}

/// Legacy: Returns `(persona_guess, svg_markup)`. Used when OpenAI is not configured.
pub async fn generate_fake_avatar(
    client: &AnthropicClient,
    fingerprint: &str,
    summary_hint: Option<&str>,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let prompt = build_prompt(fingerprint, summary_hint);
    let raw = client.messages(MODEL, MAX_TOKENS, &prompt).await?;
    parse_and_sanitize(&raw)
}

fn parse_and_sanitize(
    raw: &str,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let stripped = strip_markdown_fences(raw);
    let persona = extract_persona(&stripped);
    let svg = extract_svg(&stripped)?;
    let svg = sanitize_svg(&svg)?;
    Ok((persona, svg))
}

fn strip_markdown_fences(s: &str) -> String {
    let mut out = s.to_string();
    if let Some(i) = out.find("```") {
        out = out[i + 3..].to_string();
        if let Some(j) = out.find("```") {
            out = out[..j].to_string();
        }
    }
    out
}

fn extract_persona(s: &str) -> String {
    for line in s.lines() {
        let t = line.trim();
        if t.len() >= 8 && t[..8].eq_ignore_ascii_case("PERSONA:") {
            return t[8..].trim().to_string();
        }
    }
    "A speculative, fictional visitor sketch — not a real identification.".to_string()
}

fn extract_svg(s: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let lower = s.to_ascii_lowercase();
    let start = lower.find("<svg").ok_or("no <svg in model output")?;
    let after = &s[start..];
    let after_lower = after.to_ascii_lowercase();
    let end = after_lower
        .rfind("</svg>")
        .map(|i| i + "</svg>".len())
        .ok_or("no </svg> in model output")?;
    Ok(after[..end].to_string())
}

/// Drop obvious script/event vectors; cap size.
///
/// # Known gap
/// `<use>` cross-document references are not rejected here. The prompt constraints
/// make them unlikely, but a future pass should handle `href` values with scheme+path.
pub fn sanitize_svg(svg: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    if svg.len() > MAX_SVG_CHARS {
        return Err("SVG too large".into());
    }
    let lower = svg.to_ascii_lowercase();
    if lower.contains("<script") || lower.contains("</script") {
        return Err("SVG contains script".into());
    }
    if lower.contains("javascript:") || lower.contains("onload=") || lower.contains("onerror=") {
        return Err("SVG contains unsafe handlers".into());
    }
    if lower.contains("<foreignobject") {
        return Err("SVG contains foreignObject".into());
    }
    if reject_data_uris(svg) {
        return Err("SVG contains data: URI in attribute".into());
    }
    if !lower.contains("xmlns=") {
        let with_ns = svg.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1);
        return Ok(with_ns);
    }
    Ok(svg.to_string())
}

/// Returns true if any `href` or `xlink:href` attribute value starts with `data:`.
fn reject_data_uris(svg: &str) -> bool {
    let lower = svg.to_ascii_lowercase();
    for attr in ["href=", "xlink:href="] {
        let mut search = lower.as_str();
        while let Some(pos) = search.find(attr) {
            let after = search[pos + attr.len()..].trim_start();
            let value = after.trim_start_matches('"').trim_start_matches('\'');
            if value.starts_with("data:") {
                return true;
            }
            search = &search[pos + attr.len()..];
        }
    }
    false
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Regional collage prompt tests ─────────────────────────────────

    #[test]
    fn regional_prompt_contains_fingerprint() {
        let ctx = UserContext {
            city: Some("Austin".to_string()),
            country: Some("United States".to_string()),
            languages: Some("en-US".to_string()),
            ..Default::default()
        };
        let prompt = build_regional_collage_prompt("deadbeef", &ctx, None);
        assert!(prompt.contains("deadbeef"), "prompt must contain fingerprint");
        assert!(prompt.contains("PERSONA:"), "prompt must request PERSONA label");
        assert!(
            prompt.contains("ART_DIRECTION:"),
            "prompt must request ART_DIRECTION label"
        );
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
    fn image_prompt_contains_required_phrase() {
        let ctx = UserContext {
            city: Some("Lagos".to_string()),
            country: Some("Nigeria".to_string()),
            ..Default::default()
        };
        let p = build_image_prompt(&ctx, "Probably a creative", "Afrobeats album art");
        assert!(
            p.contains("Generate a collage 1000px×1000px"),
            "prompt must contain the required phrase"
        );
        assert!(p.contains("align spiritually"));
        assert!(p.contains("Afrobeats album art"));
        assert!(p.contains("Lagos") || p.contains("Nigeria"));
    }

    #[test]
    fn validate_png_b64_rejects_oversized() {
        let huge = "A".repeat(MAX_PNG_B64_BYTES + 1);
        assert!(validate_png_b64(&huge).is_err());
    }

    #[test]
    fn extract_labeled_line_parses_both_labels() {
        let text = "PERSONA: Probably a builder.\nART_DIRECTION: Ukiyo-e waves in indigo.";
        assert_eq!(
            extract_labeled_line(text, "PERSONA"),
            "Probably a builder."
        );
        assert_eq!(
            extract_labeled_line(text, "ART_DIRECTION"),
            "Ukiyo-e waves in indigo."
        );
    }

    // ── Legacy SVG tests ──────────────────────────────────────────────

    #[test]
    fn extract_svg_finds_tag() {
        let raw = r#"PERSONA: Hello
SVG: <svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>"#;
        let svg = extract_svg(raw).unwrap();
        assert!(svg.starts_with("<svg"));
        assert!(svg.ends_with("</svg>"));
    }

    #[test]
    fn sanitize_rejects_script() {
        let bad = r#"<svg><script>x</script></svg>"#;
        assert!(sanitize_svg(bad).is_err());
    }

    #[test]
    fn sanitize_rejects_data_uri_in_href() {
        let bad = r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="data:text/html,<h1>xss</h1>"/></svg>"#;
        assert!(sanitize_svg(bad).is_err());
    }

    #[test]
    fn sanitize_rejects_data_uri_in_xlink_href() {
        let bad = r#"<svg xmlns="http://www.w3.org/2000/svg"><use xlink:href="data:image/svg+xml,<svg/>"/></svg>"#;
        assert!(sanitize_svg(bad).is_err());
    }

    #[test]
    fn sanitize_allows_clean_svg() {
        let ok = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="50"/></svg>"#;
        assert!(sanitize_svg(ok).is_ok());
    }

    #[test]
    fn sanitize_rejects_javascript_href() {
        let bad = r#"<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>"#;
        assert!(sanitize_svg(bad).is_err());
    }
}
