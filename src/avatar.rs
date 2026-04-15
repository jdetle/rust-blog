//! Fictional avatar generation via Anthropic Messages API.
//!
//! Anthropic does not expose a DALL·E-style raster image API. We ask Claude to emit a compact
//! **inline SVG** (vector image) plus a playful speculative persona line — both stored in Scylla.

use reqwest::Client;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MODEL: &str = "claude-3-5-sonnet-20241022";
const MAX_TOKENS: u32 = 2048;
const MAX_SVG_CHARS: usize = 48_000;

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

/// Returns (persona_guess, svg_markup).
pub async fn generate_fake_avatar(
    api_key: &str,
    fingerprint: &str,
    summary_hint: Option<&str>,
    client: &Client,
) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
    let prompt = build_prompt(fingerprint, summary_hint);

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
    let text = json
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or_default();

    parse_and_sanitize(text)
}

fn parse_and_sanitize(raw: &str) -> Result<(String, String), Box<dyn std::error::Error + Send + Sync>> {
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
    if !lower.contains("xmlns=") {
        // Ensure xmlns for browser parsing
        let with_ns = svg.replacen("<svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"", 1);
        return Ok(with_ns);
    }
    Ok(svg.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
