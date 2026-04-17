//! Shared Anthropic Messages API client.
//!
//! Single injection point for both avatar generation and session summarization.
//! `base_url` defaults to the real Anthropic endpoint but can be overridden via
//! `ANTHROPIC_BASE_URL` (or by passing a value directly) so tests can point at a
//! local `wiremock` or `mock-anthropic` sidecar without touching the real API.

use reqwest::Client;

const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Clone)]
pub struct AnthropicClient {
    pub base_url: String,
    api_key: String,
    client: Client,
}

impl AnthropicClient {
    /// Create a client.  `base_url` should be the scheme+host only, e.g.
    /// `"https://api.anthropic.com"` or `"http://127.0.0.1:9090"` for tests.
    pub fn new(api_key: String, base_url: Option<String>) -> Self {
        Self {
            base_url: base_url
                .unwrap_or_else(|| "https://api.anthropic.com".to_string())
                .trim_end_matches('/')
                .to_string(),
            api_key,
            client: Client::new(),
        }
    }

    /// Call `POST /v1/messages` and return the text content of the first block.
    pub async fn messages(
        &self,
        model: &str,
        max_tokens: u32,
        user_content: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/v1/messages", self.base_url);
        let body = serde_json::json!({
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{ "role": "user", "content": user_content }]
        });

        let res = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error {status}: {text}").into());
        }

        let json: serde_json::Value = res.json().await?;
        let text = json
            .get("content")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .and_then(|block| block.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .to_string();

        Ok(text)
    }
}
