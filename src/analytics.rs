use chrono::{NaiveDate, Utc};
use scylla::prepared_statement::PreparedStatement;
use scylla::{Session, SessionBuilder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingEvent {
    pub event_type: String,
    pub page_url: String,
    #[serde(default)]
    pub referrer: String,
    #[serde(default)]
    pub user_agent: String,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    pub site_id: String,
    pub event_date: NaiveDate,
    pub event_time: i64,
    pub event_id: Uuid,
    pub event_type: String,
    pub source: String,
    pub page_url: String,
    pub user_agent: String,
    pub referrer: String,
    pub session_id: String,
    pub properties: String,
}

impl AnalyticsEvent {
    pub fn from_incoming(incoming: IncomingEvent, source: &str) -> Self {
        let now = Utc::now();
        Self {
            site_id: "jdetle-blog".to_string(),
            event_date: now.date_naive(),
            event_time: now.timestamp_millis(),
            event_id: Uuid::new_v4(),
            event_type: incoming.event_type,
            source: source.to_string(),
            page_url: incoming.page_url,
            user_agent: incoming.user_agent,
            referrer: incoming.referrer,
            session_id: incoming.session_id,
            properties: serde_json::to_string(&incoming.properties).unwrap_or_default(),
        }
    }
}

pub struct AnalyticsDb {
    session: Arc<Session>,
    insert_stmt: PreparedStatement,
}

impl AnalyticsDb {
    pub async fn connect(
        contact_point: &str,
        username: &str,
        password: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let session: Session = SessionBuilder::new()
            .known_node(format!("{contact_point}:10350"))
            .user(username, password)
            .build()
            .await?;

        let insert_cql = "INSERT INTO analytics.events \
            (site_id, event_date, event_time, event_id, event_type, source, \
             page_url, user_agent, referrer, session_id, properties) \
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        let insert_stmt = session.prepare(insert_cql).await?;

        Ok(Self {
            session: Arc::new(session),
            insert_stmt,
        })
    }

    pub async fn insert_event(
        &self,
        event: &AnalyticsEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let date_days = event.event_date.signed_duration_since(
            NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
        ).num_days() as i32;

        self.session
            .execute_unpaged(
                &self.insert_stmt,
                (
                    &event.site_id,
                    date_days,
                    event.event_time,
                    event.event_id,
                    &event.event_type,
                    &event.source,
                    &event.page_url,
                    &event.user_agent,
                    &event.referrer,
                    &event.session_id,
                    &event.properties,
                ),
            )
            .await?;
        Ok(())
    }

    pub fn session(&self) -> &Arc<Session> {
        &self.session
    }

    /// Query events by session_id (PostHog distinct_id). Requires a secondary index:
    /// CREATE INDEX ON analytics.events(session_id);
    pub async fn query_events_by_user(
        &self,
        user_id: &str,
        limit: u32,
    ) -> Result<Vec<AnalyticsEvent>, Box<dyn std::error::Error + Send + Sync>> {
        if user_id.is_empty() {
            return Ok(vec![]);
        }

        let limit = limit.min(100);

        // Secondary index on session_id enables this query. Without it, use ALLOW FILTERING (slow).
        let cql = "SELECT site_id, event_date, event_time, event_id, event_type, source, \
                   page_url, user_agent, referrer, session_id, properties \
                   FROM analytics.events WHERE session_id = ? LIMIT ? ALLOW FILTERING";

        let prepared = self.session.prepare(cql).await?;
        let result = self
            .session
            .execute_unpaged(&prepared, (user_id, limit as i32))
            .await?;

        let rows = result.into_rows_result()?;
        let mut events = Vec::new();
        for row in rows.rows::<(
            String,
            i32,
            i64,
            Uuid,
            String,
            String,
            String,
            String,
            String,
            String,
            String,
        )>()? {
            let (site_id, date_days, event_time, event_id, event_type, source, page_url, user_agent, referrer, session_id, properties) = row?;
            let origin = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
            let event_date = origin
                .checked_add_signed(chrono::Duration::days(date_days as i64))
                .unwrap_or(origin);
            events.push(AnalyticsEvent {
                site_id,
                event_date,
                event_time,
                event_id,
                event_type,
                source,
                page_url,
                user_agent,
                referrer,
                session_id,
                properties,
            });
        }
        Ok(events)
    }
}
