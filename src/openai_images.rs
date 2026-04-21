//! OpenAI Images API client — generates 1024×1024 regional-artist collages via gpt-image-1.

use reqwest::Client;
use std::time::Duration;

const OPENAI_IMAGES_URL: &str = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGES_EDITS_URL: &str = "https://api.openai.com/v1/images/edits";
const REQUEST_TIMEOUT_SECS: u64 = 40;

#[derive(Clone)]
pub struct OpenAiImagesClient {
    api_key: String,
    http: Client,
    /// Override endpoint for tests; defaults to OPENAI_IMAGES_URL.
    pub base_url: String,
}

impl OpenAiImagesClient {
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("failed to build reqwest client for OpenAI images");
        Self {
            api_key,
            http,
            base_url: base_url
                .unwrap_or_else(|| OPENAI_IMAGES_URL.to_string()),
        }
    }

    fn edits_endpoint(&self) -> String {
        if self.base_url.contains("/images/generations") {
            self.base_url
                .replace("/images/generations", "/images/edits")
        } else {
            OPENAI_IMAGES_EDITS_URL.to_string()
        }
    }

    fn parse_b64_response(json: serde_json::Value) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let b64 = json
            .get("data")
            .and_then(|d| d.as_array())
            .and_then(|arr| arr.first())
            .and_then(|item| item.get("b64_json"))
            .and_then(|v| v.as_str())
            .ok_or("no b64_json in OpenAI response")?
            .to_string();
        Ok(b64)
    }

    /// Generate one image and return the raw base64-encoded PNG string.
    ///
    /// Callers prepend `data:image/png;base64,` to form a data URI.
    pub async fn generate(
        &self,
        prompt: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let body = serde_json::json!({
            "model": "gpt-image-1",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "medium"
        });

        let res = self
            .http
            .post(&self.base_url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("OpenAI Images API error {status}: {text}").into());
        }

        let json: serde_json::Value = res.json().await?;
        Self::parse_b64_response(json)
    }

    /// Evolve an existing PNG using gpt-image-1 image edits (reference input).
    ///
    /// `png_b64_raw` is raw base64 bytes without a `data:` prefix.
    pub async fn edit_with_reference(
        &self,
        prompt: &str,
        png_b64_raw: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        self.edit_with_references(prompt, &[png_b64_raw]).await
    }

    /// Same as [`Self::edit_with_reference`], but passes every prior portrait (oldest → newest).
    pub async fn edit_with_references(
        &self,
        prompt: &str,
        png_b64_raws: &[&str],
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        if png_b64_raws.is_empty() {
            return Err("edit_with_references requires at least one image".into());
        }
        let images: Vec<serde_json::Value> = png_b64_raws
            .iter()
            .map(|raw| {
                let data_uri = format!("data:image/png;base64,{raw}");
                serde_json::json!({ "image_url": data_uri })
            })
            .collect();
        let body = serde_json::json!({
            "model": "gpt-image-1",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "quality": "medium",
            "images": images,
        });

        let url = self.edits_endpoint();
        let res = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("OpenAI Images edits API error {status}: {text}").into());
        }

        let json: serde_json::Value = res.json().await?;
        Self::parse_b64_response(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_builds_without_panic() {
        let _c = OpenAiImagesClient::new("test-key".to_string(), None);
    }

    #[test]
    fn client_accepts_base_url_override() {
        let c = OpenAiImagesClient::new(
            "test-key".to_string(),
            Some("http://localhost:9091/v1/images/generations".to_string()),
        );
        assert!(c.base_url.contains("localhost"));
    }
}
