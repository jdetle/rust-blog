use chrono::{NaiveDate, Utc};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use rust_blog::aggregate_mapping::{
    date_from_iso_timestamp_prefix, posthog_event_date_from_timestamp, posthog_raw_to_event,
};
use serde_json::json;
use uuid::Uuid;

fn bench_posthog_map_event(c: &mut Criterion) {
    let raw = json!({
        "event": "pageview",
        "timestamp": "2024-06-01T12:00:00.000Z",
        "distinct_id": "d1",
        "properties": {"$current_url": "https://example.com/p", "$user_agent": "ua", "$referrer": ""}
    });
    let fb = NaiveDate::from_ymd_opt(2024, 1, 1).unwrap();
    c.bench_function("posthog_raw_to_event", |b| {
        b.iter(|| {
            posthog_raw_to_event(
                black_box(&raw),
                black_box(1_700_000_000_000i64),
                black_box(Uuid::nil()),
                black_box(fb),
            )
        });
    });
}

fn bench_date_prefix(c: &mut Criterion) {
    let s = "2024-03-15T10:00:00Z";
    c.bench_function("date_from_iso_timestamp_prefix", |b| {
        b.iter(|| date_from_iso_timestamp_prefix(black_box(s)));
    });
}

fn bench_posthog_fallback_date(c: &mut Criterion) {
    let v = json!("2024-12-01T00:00:00Z");
    let fb = Utc::now().date_naive();
    c.bench_function("posthog_event_date_from_timestamp", |b| {
        b.iter(|| posthog_event_date_from_timestamp(black_box(Some(&v)), black_box(fb)));
    });
}

criterion_group!(
    benches,
    bench_posthog_map_event,
    bench_date_prefix,
    bench_posthog_fallback_date
);
criterion_main!(benches);
