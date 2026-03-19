//! Shared analytics logic — Cosmos DB writes, aggregation from Clarity/PostHog.

pub mod aggregate;
pub mod analytics;
pub mod api;
pub mod forward;
pub mod mock;
pub mod summarize;
pub mod vercel_drain;
