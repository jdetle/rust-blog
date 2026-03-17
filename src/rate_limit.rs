use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use governor::{clock::DefaultClock, state::keyed::DefaultKeyedStateStore, Quota, RateLimiter};
use std::{
    net::{IpAddr, SocketAddr},
    num::NonZeroU32,
    sync::Arc,
};

pub type IpRateLimiter = RateLimiter<IpAddr, DefaultKeyedStateStore<IpAddr>, DefaultClock>;

/// 5 requests/second per IP with a burst of 5.
/// Generous for a blog reader; catches scrapers and bots.
pub fn create() -> Arc<IpRateLimiter> {
    let quota = Quota::per_second(NonZeroU32::new(5).unwrap());
    Arc::new(RateLimiter::keyed(quota))
}

pub async fn enforce(
    State(limiter): State<Arc<IpRateLimiter>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    match limiter.check_key(&addr.ip()) {
        Ok(_) => next.run(request).await,
        Err(_) => {
            tracing::warn!(ip = %addr.ip(), "rate limited");
            (StatusCode::TOO_MANY_REQUESTS, "Too many requests. Slow down.\n").into_response()
        }
    }
}
