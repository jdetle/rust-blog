//! Server-side public API enrichment for avatar prompts (Open-Meteo, REST Countries,
//! World Bank employment sectors, optional Wikipedia, place “photo” context via optional
//! Google Custom Search (image) or Wikimedia Commons file search). Fixed origins only.

use crate::user_context::UserContext;
use reqwest::Client;
use reqwest::Url;
use serde::Deserialize;
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::time::timeout;

const ENRICH_BUDGET: Duration = Duration::from_secs(2);
const USER_AGENT: &str = "rust-blog-avatar-enrichment/1.0 (privacy-education blog; +https://github.com)";

static HTTP: OnceLock<Client> = OnceLock::new();

fn http_client() -> &'static Client {
    HTTP.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(2))
            .user_agent(USER_AGENT)
            .build()
            .expect("reqwest client for origin enrichment")
    })
}

/// ISO 3166-1 alpha-2 only.
pub fn sanitize_country_code(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.len() != 2 {
        return None;
    }
    let up: String = t.to_uppercase();
    if up.chars().all(|c| c.is_ascii_uppercase()) {
        Some(up)
    } else {
        None
    }
}

/// Wikipedia REST `title` path segment: letters, digits, spaces, comma, hyphen — no slashes or URL metachars.
pub fn sanitize_wikipedia_title(city: &str, region: Option<&str>) -> Option<String> {
    let city = city.trim();
    if city.is_empty() || city.len() > 100 {
        return None;
    }
    let ok = city
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == ',');
    if !ok {
        return None;
    }
    let title = if let Some(r) = region {
        let r = r.trim();
        if !r.is_empty()
            && r.len() <= 80
            && r.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '-')
        {
            format!("{city}, {r}")
        } else {
            city.to_string()
        }
    } else {
        city.to_string()
    };
    Some(title)
}

#[derive(Debug, Clone, Default)]
pub struct OriginEnrichment {
    pub weather_temperature_c: Option<f64>,
    pub weather_code: Option<i32>,
    pub is_day: Option<bool>,
    pub country_name: Option<String>,
    pub country_capital: Option<String>,
    pub country_region: Option<String>,
    pub country_subregion: Option<String>,
    pub country_languages: Option<String>,
    /// World Bank modeled ILO employment shares (country level, latest available year).
    pub employment_summary: Option<String>,
    /// Text distilled from image search (Google CSE when configured, else Wikimedia Commons file titles).
    pub place_photo_context: Option<String>,
    pub place_extract: Option<String>,
}

impl OriginEnrichment {
    pub fn to_prompt_block(&self) -> String {
        let mut lines: Vec<String> = Vec::new();
        if let Some(t) = self.weather_temperature_c {
            lines.push(format!("- Approximate local conditions (Open-Meteo): {t:.1}°C"));
        }
        if let Some(code) = self.weather_code {
            if let Some(desc) = wmo_weather_label(code) {
                lines.push(format!("- Weather code {code} ({desc})"));
            } else {
                lines.push(format!("- Weather code: {code}"));
            }
        }
        if let Some(d) = self.is_day {
            lines.push(format!(
                "- Day/night at location: {}",
                if d { "daylight" } else { "night" }
            ));
        }
        if let Some(ref n) = self.country_name {
            lines.push(format!("- Country (REST Countries): {n}"));
        }
        if let Some(ref c) = self.country_capital {
            lines.push(format!("- Capital: {c}"));
        }
        if let Some(ref r) = self.country_region {
            lines.push(format!("- UN region: {r}"));
        }
        if let Some(ref s) = self.country_subregion {
            lines.push(format!("- Subregion: {s}"));
        }
        if let Some(ref l) = self.country_languages {
            lines.push(format!("- Official languages (public list): {l}"));
        }
        if let Some(ref e) = self.employment_summary {
            lines.push(format!("- Employment sector mix (World Bank modeled ILO, country level): {e}"));
        }
        if let Some(ref p) = self.place_photo_context {
            let short = if p.len() > 600 {
                format!("{}…", &p[..600])
            } else {
                p.clone()
            };
            lines.push(format!(
                "- Visual motifs from image search (titles only — abstract inspiration, not depicting the visitor): {short}"
            ));
        }
        if let Some(ref e) = self.place_extract {
            let short = if e.len() > 500 {
                format!("{}…", &e[..500])
            } else {
                e.clone()
            };
            lines.push(format!("- Place context (Wikipedia summary, factual): {short}"));
        }
        if lines.is_empty() {
            return "(no public origin enrichment available)".to_string();
        }
        lines.join("\n")
    }

    pub fn is_empty(&self) -> bool {
        self.weather_temperature_c.is_none()
            && self.weather_code.is_none()
            && self.country_name.is_none()
            && self.place_extract.is_none()
            && self.employment_summary.is_none()
            && self.place_photo_context.is_none()
    }
}

/// Deterministic axes for abstract composition variety (not literal user depiction).
pub fn composition_axes(
    fingerprint: &str,
    country_code: &str,
    weather_code: Option<i32>,
    date_utc: &str,
) -> String {
    let mut h = DefaultHasher::new();
    fingerprint.hash(&mut h);
    country_code.hash(&mut h);
    weather_code.hash(&mut h);
    date_utc.hash(&mut h);
    let seed = h.finish();

    let rhythms = ["radial or spiralling energy", "horizontal strata and bands", "layered depth and foreground overlap"];
    let temps = ["lean warm amber and gold accents", "lean cool teal and slate accents", "balanced earth neutrals with one vivid accent"];
    let structures = ["open centre with dense edges", "grid-like modular patches", "diagonal motion across the frame"];

    let r = rhythms[(seed as usize) % rhythms.len()];
    let t = temps[((seed >> 8) as usize) % temps.len()];
    let s = structures[((seed >> 16) as usize) % structures.len()];

    format!("Composition axes (abstract — vary the painting, not a person): {r}; {t}; {s}.")
}

fn wmo_weather_label(code: i32) -> Option<&'static str> {
    // WMO Weather interpretation codes (WW) — simplified bucket labels for prompts.
    match code {
        0 => Some("clear"),
        1..=3 => Some("mainly clear to overcast"),
        45 | 48 => Some("fog"),
        51..=57 => Some("drizzle"),
        61..=67 => Some("rain"),
        71..=77 => Some("snow"),
        80..=82 => Some("rain showers"),
        85 | 86 => Some("snow showers"),
        95 => Some("thunderstorm"),
        96..=99 => Some("thunderstorm with hail"),
        _ => None,
    }
}

#[derive(Deserialize)]
struct OpenMeteoCurrent {
    temperature_2m: Option<f64>,
    weather_code: Option<i32>,
    is_day: Option<i32>,
}

#[derive(Deserialize)]
struct OpenMeteoResponse {
    current: Option<OpenMeteoCurrent>,
}

async fn fetch_open_meteo(lat: f64, lon: f64) -> Option<(f64, i32, bool)> {
    let mut url = Url::parse("https://api.open-meteo.com/v1/forecast").ok()?;
    url.query_pairs_mut()
        .append_pair("latitude", &lat.to_string())
        .append_pair("longitude", &lon.to_string())
        .append_pair("current", "temperature_2m,weather_code,is_day");
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    let json: OpenMeteoResponse = res.json().await.ok()?;
    let c = json.current?;
    let temp = c.temperature_2m?;
    let code = c.weather_code?;
    let day = c.is_day.map(|v| v != 0).unwrap_or(true);
    Some((temp, code, day))
}

#[derive(Deserialize)]
struct RestCountryName {
    common: Option<String>,
}

#[derive(Deserialize)]
struct RestCountryItem {
    name: Option<RestCountryName>,
    capital: Option<Vec<String>>,
    region: Option<String>,
    subregion: Option<String>,
    languages: Option<std::collections::HashMap<String, String>>,
    cca3: Option<String>,
}

struct CountryInfo {
    pub name: String,
    pub capital: Option<String>,
    pub region: Option<String>,
    pub subregion: Option<String>,
    pub languages: Option<String>,
    pub cca3: Option<String>,
}

async fn fetch_rest_country(alpha2: &str) -> Option<CountryInfo> {
    let base = Url::parse("https://restcountries.com/v3.1/alpha/").ok()?;
    let url = base.join(alpha2).ok()?;
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    let arr: Vec<RestCountryItem> = res.json().await.ok()?;
    let first = arr.first()?;
    let name = first
        .name
        .as_ref()
        .and_then(|n| n.common.clone())
        .or_else(|| Some(alpha2.to_string()))?;
    let capital = first
        .capital
        .as_ref()
        .and_then(|c| c.first().cloned());
    let region = first.region.clone();
    let subregion = first.subregion.clone();
    let langs = first.languages.as_ref().map(|m| {
        m.values()
            .cloned()
            .collect::<Vec<_>>()
            .join(", ")
    });
    let cca3 = first
        .cca3
        .as_ref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| s.len() == 3 && s.chars().all(|c| c.is_ascii_uppercase()));
    Some(CountryInfo {
        name,
        capital,
        region,
        subregion,
        languages: langs,
        cca3,
    })
}

/// ISO 3166-1 alpha-3 for World Bank URL paths only.
fn sanitize_iso3(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.len() != 3 {
        return None;
    }
    let up = t.to_uppercase();
    if up.chars().all(|c| c.is_ascii_uppercase()) {
        Some(up)
    } else {
        None
    }
}

const WB_AGR: &str = "SL.AGR.EMPL.ZS";
const WB_IND: &str = "SL.IND.EMPL.ZS";
const WB_SRV: &str = "SL.SRV.EMPL.ZS";

async fn fetch_wb_indicator_value(iso3: &str, indicator: &str) -> Option<(f64, String)> {
    let url = Url::parse(&format!(
        "https://api.worldbank.org/v2/country/{iso3}/indicator/{indicator}?format=json&mrnev=1"
    ))
    .ok()?;
    if url.host_str() != Some("api.worldbank.org") {
        return None;
    }
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    let v: Value = res.json().await.ok()?;
    let arr = v.as_array()?;
    let data = arr.get(1)?.as_array()?;
    let row = data.first()?;
    let val = row.get("value")?.as_f64()?;
    let date = row
        .get("date")
        .and_then(|d| d.as_str())
        .unwrap_or("?")
        .to_string();
    Some((val, date))
}

/// One-line summary: agriculture / industry / services shares and dominant sector.
async fn summarize_world_bank_employment(iso3: &str) -> Option<String> {
    let iso3 = sanitize_iso3(iso3)?;
    let (a, da) = fetch_wb_indicator_value(&iso3, WB_AGR).await?;
    let (i, di) = fetch_wb_indicator_value(&iso3, WB_IND).await?;
    let (s, ds) = fetch_wb_indicator_value(&iso3, WB_SRV).await?;
    let year = [&da, &di, &ds]
        .iter()
        .find(|y| y.as_str() != "?")
        .map(|s| s.as_str())
        .unwrap_or("?");
    let dominant = if s >= a && s >= i {
        "services"
    } else if i >= a && i >= s {
        "industry"
    } else {
        "agriculture"
    };
    Some(format!(
        "~{a:.1}% agriculture, ~{i:.1}% industry, ~{s:.1}% services (year ~{year}; dominant sector: {dominant})"
    ))
}

/// Query for image search: city + country name; strict charset.
pub fn sanitize_place_image_query(raw: &str) -> Option<String> {
    let t = raw.trim();
    if t.is_empty() || t.len() > 120 {
        return None;
    }
    let ok = t
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == ',' || c == '-');
    if !ok {
        return None;
    }
    Some(t.to_string())
}

fn build_place_photo_query(ctx: &UserContext, country_name: Option<&str>) -> Option<String> {
    let city = ctx.city.as_deref()?.trim();
    if city.is_empty() {
        return None;
    }
    let cn = country_name.unwrap_or("").trim();
    let q = if cn.is_empty() {
        city.to_string()
    } else {
        format!("{city} {cn}")
    };
    sanitize_place_image_query(&q)
}

/// Optional Google Custom Search (image). Set `GOOGLE_CUSTOM_SEARCH_API_KEY` and
/// `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` (same as `cx` in Google's docs).
async fn fetch_google_image_search_context(query: &str) -> Option<String> {
    let key = std::env::var("GOOGLE_CUSTOM_SEARCH_API_KEY").ok()?;
    let cx = std::env::var("GOOGLE_CUSTOM_SEARCH_ENGINE_ID").ok()?;
    if key.is_empty() || cx.is_empty() {
        return None;
    }
    let mut url = Url::parse("https://www.googleapis.com/customsearch/v1").ok()?;
    url.query_pairs_mut()
        .append_pair("key", &key)
        .append_pair("cx", &cx)
        .append_pair("q", query)
        .append_pair("searchType", "image")
        .append_pair("num", "5")
        .append_pair("safe", "active");
    if url.origin().ascii_serialization() != "https://www.googleapis.com" {
        return None;
    }
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    if !res.status().is_success() {
        return None;
    }
    let v: Value = res.json().await.ok()?;
    let items = v.get("items")?.as_array()?;
    let mut parts: Vec<String> = Vec::new();
    for it in items.iter().take(5) {
        let title = it.get("title").and_then(|t| t.as_str()).unwrap_or("");
        let snippet = it.get("snippet").and_then(|t| t.as_str()).unwrap_or("");
        if !title.is_empty() {
            parts.push(if snippet.is_empty() {
                title.to_string()
            } else {
                format!("{title} — {snippet}")
            });
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(format!("Google image search (top results): {}", parts.join(" | ")))
}

#[derive(Deserialize)]
struct CommonsSearchResponse {
    query: Option<CommonsQuery>,
}

#[derive(Deserialize)]
struct CommonsQuery {
    search: Option<Vec<CommonsHit>>,
}

#[derive(Deserialize)]
struct CommonsHit {
    title: Option<String>,
}

/// Wikimedia Commons file search (no API key). Titles suggest what photographs of the place often depict.
async fn fetch_wikimedia_commons_photo_titles(query: &str) -> Option<String> {
    let mut url = Url::parse("https://commons.wikimedia.org/w/api.php").ok()?;
    url.query_pairs_mut()
        .append_pair("action", "query")
        .append_pair("list", "search")
        .append_pair("srsearch", query)
        .append_pair("srnamespace", "6")
        .append_pair("srlimit", "5")
        .append_pair("format", "json");
    if url.host_str() != Some("commons.wikimedia.org") {
        return None;
    }
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    let body: CommonsSearchResponse = res.json().await.ok()?;
    let hits = body.query?.search?;
    let titles: Vec<String> = hits
        .iter()
        .filter_map(|h| h.title.clone())
        .take(5)
        .collect();
    if titles.is_empty() {
        return None;
    }
    Some(format!(
        "Wikimedia Commons file names (photo subjects): {}",
        titles.join(", ")
    ))
}

async fn fetch_place_photo_context(query: &str) -> Option<String> {
    if let Some(g) = fetch_google_image_search_context(query).await {
        return Some(g);
    }
    fetch_wikimedia_commons_photo_titles(query).await
}

#[derive(Deserialize)]
struct WikiSummary {
    extract: Option<String>,
}

async fn fetch_wikipedia_extract(title: &str) -> Option<String> {
    let encoded = urlencoding::encode(title);
    let url = Url::parse(&format!(
        "https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    ))
    .ok()?;
    if url.host_str() != Some("en.wikipedia.org") {
        return None;
    }
    let client = http_client();
    let res = match timeout(ENRICH_BUDGET, client.get(url).send()).await {
        Ok(Ok(r)) => r,
        _ => return None,
    };
    if !res.status().is_success() {
        return None;
    }
    let wiki: WikiSummary = res.json().await.ok()?;
    wiki.extract
}

fn parse_lat_lon(ctx: &UserContext) -> Option<(f64, f64)> {
    let lat: f64 = ctx.latitude.as_ref()?.parse().ok()?;
    let lon: f64 = ctx.longitude.as_ref()?.parse().ok()?;
    if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
        return None;
    }
    Some((lat, lon))
}

/// Parallel public API enrichment for avatar prompts. Fails soft — returns partial or empty.
pub async fn enrich_for_avatar(ctx: &UserContext) -> OriginEnrichment {
    let lat_lon = parse_lat_lon(ctx);
    let alpha = ctx
        .country
        .as_deref()
        .and_then(sanitize_country_code);

    let weather_f = async {
        if let Some((lat, lon)) = lat_lon {
            fetch_open_meteo(lat, lon).await
        } else {
            None
        }
    };

    let country_f = async {
        if let Some(ref code) = alpha {
            fetch_rest_country(code).await
        } else {
            None
        }
    };

    // Only resolve Wikipedia when we have lat/lon — avoids ambiguous city names and keeps tests offline without coordinates.
    let wiki_title = if lat_lon.is_some() {
        ctx.city.as_deref().and_then(|c| {
            sanitize_wikipedia_title(c, ctx.region.as_deref())
        })
    } else {
        None
    };
    let wiki_f = async {
        if let Some(ref t) = wiki_title {
            fetch_wikipedia_extract(t).await
        } else {
            None
        }
    };

    let (w, c, wiki_extract) = tokio::join!(weather_f, country_f, wiki_f);

    let iso3 = c.as_ref().and_then(|ci| ci.cca3.clone());
    let photo_query = build_place_photo_query(ctx, c.as_ref().map(|ci| ci.name.as_str()));

    let employment_f = async {
        if let Some(ref i) = iso3 {
            summarize_world_bank_employment(i.as_str()).await
        } else {
            None
        }
    };
    let photo_f = async {
        match &photo_query {
            Some(q) => fetch_place_photo_context(q).await,
            None => None,
        }
    };

    let (employment_summary, place_photo_context) = tokio::join!(employment_f, photo_f);

    let mut out = OriginEnrichment::default();

    if let Some((temp, code, day)) = w {
        out.weather_temperature_c = Some(temp);
        out.weather_code = Some(code);
        out.is_day = Some(day);
    }

    if let Some(ci) = c {
        out.country_name = Some(ci.name);
        out.country_capital = ci.capital;
        out.country_region = ci.region;
        out.country_subregion = ci.subregion;
        out.country_languages = ci.languages;
    }

    out.employment_summary = employment_summary;
    out.place_photo_context = place_photo_context;
    out.place_extract = wiki_extract;

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_country_accepts_iso2() {
        assert_eq!(sanitize_country_code("us"), Some("US".to_string()));
        assert_eq!(sanitize_country_code("NO"), Some("NO".to_string()));
    }

    #[test]
    fn sanitize_country_rejects_bad() {
        assert_eq!(sanitize_country_code("USA"), None);
        assert_eq!(sanitize_country_code("U"), None);
        assert_eq!(sanitize_country_code("U1"), None);
    }

    #[test]
    fn sanitize_wiki_title_basic() {
        assert_eq!(
            sanitize_wikipedia_title("Oslo", Some("Oslo")),
            Some("Oslo, Oslo".to_string())
        );
        assert_eq!(sanitize_wikipedia_title("Austin", Some("Texas")), Some("Austin, Texas".to_string()));
    }

    #[test]
    fn sanitize_wiki_rejects_injection() {
        assert_eq!(sanitize_wikipedia_title("../etc/passwd", None), None);
        assert_eq!(sanitize_wikipedia_title("foo/bar", None), None);
    }

    #[test]
    fn composition_axes_deterministic() {
        let a = composition_axes("fp1", "US", Some(3), "2026-01-01");
        let b = composition_axes("fp1", "US", Some(3), "2026-01-01");
        assert_eq!(a, b);
        let c = composition_axes("fp2", "US", Some(3), "2026-01-01");
        assert_ne!(a, c);
    }

    #[test]
    fn prompt_block_non_empty_with_facts() {
        let mut e = OriginEnrichment::default();
        e.weather_temperature_c = Some(12.5);
        e.weather_code = Some(3);
        e.country_name = Some("Norway".to_string());
        let b = e.to_prompt_block();
        assert!(b.contains("12.5"));
        assert!(b.contains("Norway"));
    }

    #[test]
    fn sanitize_place_image_query_accepts_safe() {
        assert_eq!(
            sanitize_place_image_query("Oslo, Norway"),
            Some("Oslo, Norway".to_string())
        );
    }

    #[test]
    fn sanitize_place_image_query_rejects_injection() {
        assert_eq!(sanitize_place_image_query("x; DROP TABLE"), None);
    }
}
