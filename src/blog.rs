use axum::{extract::Path, http::StatusCode, response::Html};
use std::path::PathBuf;

fn posts_dir() -> PathBuf {
    std::env::var("CONTENT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
        .join("posts")
}

/// GET /posts — serve the static index page
pub async fn list_posts() -> Result<Html<String>, StatusCode> {
    let path = posts_dir().join("index.html");
    std::fs::read_to_string(&path)
        .map(Html)
        .map_err(|_| StatusCode::NOT_FOUND)
}

/// GET /posts/:quarter/:slug — serve a post from its quarter folder
pub async fn get_post(Path((quarter, slug)): Path<(String, String)>) -> Result<Html<String>, StatusCode> {
    if !is_safe_segment(&quarter) || !is_safe_segment(&slug) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let path = posts_dir().join(&quarter).join(format!("{slug}.html"));
    std::fs::read_to_string(&path)
        .map(Html)
        .map_err(|_| StatusCode::NOT_FOUND)
}

fn is_safe_segment(s: &str) -> bool {
    !s.is_empty() && !s.contains('/') && !s.contains('\\') && s != "." && s != ".."
}
