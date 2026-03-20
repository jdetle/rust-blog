//! Abstraction for persisting analytics events — enables mocks in tests.

use async_trait::async_trait;

use crate::analytics::{AnalyticsDb, AnalyticsEvent};

#[async_trait]
pub trait EventSink: Send + Sync {
    async fn insert_event(
        &self,
        event: &AnalyticsEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}

#[async_trait]
impl EventSink for AnalyticsDb {
    async fn insert_event(
        &self,
        event: &AnalyticsEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        AnalyticsDb::insert_event(self, event).await
    }
}
