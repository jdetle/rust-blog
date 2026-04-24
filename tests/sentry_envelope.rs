//! Integration: Sentry Rust SDK POSTs an envelope to the DSN ingest URL (wiremock).

use std::time::Duration;

use sentry::types::Dsn;
use wiremock::matchers::{method, path_regex};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn capture_message_posts_envelope() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path_regex(r"(?i)/api/\d+/envelope/?"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let dsn: Dsn = format!("http://public@127.0.0.1:{}/42", server.address().port())
        .parse()
        .expect("parse DSN");

    let _guard = sentry::init(sentry::ClientOptions {
        dsn: Some(dsn),
        release: Some("rust-blog-test".into()),
        ..Default::default()
    });

    sentry::capture_message("rust-blog-wiremock-test", sentry::Level::Info);
    let ok = sentry::Hub::main()
        .client()
        .expect("sentry client")
        .flush(Some(Duration::from_secs(5)));
    assert!(ok, "Sentry flush should complete");
}
