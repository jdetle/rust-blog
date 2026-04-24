use async_trait::async_trait;
use chrono::{NaiveDate, Utc};
use openssl::ssl::{SslContextBuilder, SslMethod, SslVerifyMode};
use scylla::frame::value::CqlTimestamp;
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

#[derive(Clone)]
pub struct UserProfile {
    pub session_id: String,
    pub llm_summary: String,
    pub updated_at: i64,
    /// Playful fictional guess line (Anthropic-generated).
    pub persona_guess: String,
    /// Legacy field kept for backward-compat reads; no longer written.
    pub avatar_svg: String,
    /// UTC date string (`YYYY-MM-DD`) for the latest generation batch.
    /// `generate-avatar` cache hit when this equals today's UTC date and a latest portrait exists.
    pub avatar_session_id: String,
    /// Slot 1 — region/culture theme. Raw base64 PNG (no `data:` prefix).
    pub avatar_png: String,
    /// Slot 2 — device-era visual language.
    pub avatar_png_2: String,
    /// Slot 3 — network/time-of-day mood.
    pub avatar_png_3: String,
    /// Slot 4 — abstract persona archetype.
    pub avatar_png_4: String,
    /// Chronological history of composite PNGs (raw base64). Latest is last; mirrors `avatar_png`.
    pub avatar_pngs: Vec<String>,
}

/// Caps stored history to avoid oversized Cosmos rows (each PNG is ~1–3 MB base64).
pub const MAX_AVATAR_PNG_HISTORY: usize = 30;

impl UserProfile {
    /// Newest stored portrait for display (`GET /user-profile`) — last list entry or legacy `avatar_png`.
    pub fn latest_avatar_png(&self) -> Option<&str> {
        if let Some(last) = self.avatar_pngs.last() {
            if !last.is_empty() {
                return Some(last.as_str());
            }
        }
        if !self.avatar_png.is_empty() {
            return Some(self.avatar_png.as_str());
        }
        None
    }

    /// Raw base64 portraits in storage order (oldest → newest); empty entries skipped.
    pub fn portrait_pngs_chronological(&self) -> Vec<&str> {
        if !self.avatar_pngs.is_empty() {
            return self
                .avatar_pngs
                .iter()
                .map(|s| s.as_str())
                .filter(|s| !s.is_empty())
                .collect();
        }
        if !self.avatar_png.is_empty() {
            return vec![self.avatar_png.as_str()];
        }
        vec![]
    }

    /// All stored images to pass into the image model as reference context (oldest → newest).
    pub fn prior_pngs_for_evolution(&self) -> Vec<String> {
        self.portrait_pngs_chronological()
            .into_iter()
            .map(|s| s.to_string())
            .collect()
    }

    /// PNG data URIs for carousel clients (newest slide first).
    pub fn avatar_data_uris_newest_first(&self) -> Vec<String> {
        let mut uris: Vec<String> = self
            .portrait_pngs_chronological()
            .into_iter()
            .map(|b64| format!("data:image/png;base64,{b64}"))
            .collect();
        uris.reverse();
        uris
    }

    /// How many prior portraits are stored (for `GET /user-profile` metadata, no image bytes).
    pub fn stored_portrait_count(&self) -> usize {
        if !self.avatar_pngs.is_empty() {
            return self.avatar_pngs.len();
        }
        if !self.avatar_png.is_empty() {
            return 1;
        }
        0
    }

    /// History after appending this generation (trimmed). Caller writes `avatar_png = new_png` and stores this list.
    pub fn appended_png_history(&self, new_png: &str) -> Vec<String> {
        let mut history = self.prior_pngs_for_evolution();
        if history.last().map(|s| s.as_str()) != Some(new_png) {
            history.push(new_png.to_string());
        }
        if history.len() > MAX_AVATAR_PNG_HISTORY {
            let drop = history.len() - MAX_AVATAR_PNG_HISTORY;
            history.drain(0..drop);
        }
        history
    }

    /// Merge avatar history from two DB rows: legacy PostHog id vs canvas fingerprint.
    ///
    /// Early deployments (or clients that omitted fingerprint) stored portraits only under
    /// `distinct_id` / `user_id`. Once fingerprint is sent, writes use the fp key; a **new**
    /// fp row with one portrait would otherwise hide a long history on the legacy row.
    /// Order: legacy chronology first, then fingerprint-keyed chronology, deduped by exact PNG bytes.
    pub fn merge_split_storage_rows(
        legacy: Option<UserProfile>,
        fingerprint: Option<UserProfile>,
    ) -> Option<UserProfile> {
        match (fingerprint, legacy) {
            (None, None) => None,
            (Some(f), None) => Some(f),
            (None, Some(l)) => Some(l),
            (Some(f), Some(l)) => {
                let merged_pngs = merge_png_history_sequences(
                    &l.prior_pngs_for_evolution(),
                    &f.prior_pngs_for_evolution(),
                );
                let avatar_png = merged_pngs.last().cloned().unwrap_or_default();
                Some(UserProfile {
                    session_id: f.session_id.clone(),
                    llm_summary: if !f.llm_summary.is_empty() {
                        f.llm_summary.clone()
                    } else {
                        l.llm_summary.clone()
                    },
                    updated_at: f.updated_at.max(l.updated_at),
                    persona_guess: if !f.persona_guess.is_empty() {
                        f.persona_guess.clone()
                    } else {
                        l.persona_guess.clone()
                    },
                    avatar_svg: f.avatar_svg.clone(),
                    avatar_session_id: if !f.avatar_session_id.is_empty() {
                        f.avatar_session_id.clone()
                    } else {
                        l.avatar_session_id.clone()
                    },
                    avatar_png: avatar_png.clone(),
                    avatar_png_2: f.avatar_png_2.clone(),
                    avatar_png_3: f.avatar_png_3.clone(),
                    avatar_png_4: f.avatar_png_4.clone(),
                    avatar_pngs: merged_pngs,
                })
            }
        }
    }
}

fn merge_png_history_sequences(legacy: &[String], fp: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::<&str>::new();
    let mut out: Vec<String> = Vec::new();
    for png in legacy.iter().chain(fp.iter()) {
        if png.is_empty() {
            continue;
        }
        if seen.insert(png.as_str()) {
            out.push(png.clone());
        }
    }
    if out.len() > MAX_AVATAR_PNG_HISTORY {
        let drop = out.len() - MAX_AVATAR_PNG_HISTORY;
        out.drain(0..drop);
    }
    out
}

/// Minimal storage contract needed by the avatar handler.
/// Implemented by [`AnalyticsDb`] (Cosmos/Scylla) and, when the `test-support`
/// feature is enabled, by [`MemoryProfileStore`] (in-memory HashMap for tests).
#[async_trait]
pub trait ProfileStore: Send + Sync {
    async fn get_profile(
        &self,
        id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>>;

    /// Store persona guess + single composite PNG avatar for a profile.
    ///
    /// `avatar_session_id` is the UTC date string (`YYYY-MM-DD`) — used for once-per-day
    /// cache invalidation. `png` is a raw base64 string (no `data:` prefix).
    async fn upsert_persona_avatar(
        &self,
        id: &str,
        avatar_session_id: &str,
        persona: &str,
        png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
}

// ---------------------------------------------------------------------------
// No-op store — always available, always returns empty / discards writes.
// Used in production when Cosmos DB credentials are not configured, allowing
// the service to start and serve health / info routes in degraded mode.
// ---------------------------------------------------------------------------
pub struct NoopProfileStore;

#[async_trait]
impl ProfileStore for NoopProfileStore {
    async fn get_profile(
        &self,
        _id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>> {
        Ok(None)
    }

    async fn upsert_persona_avatar(
        &self,
        _id: &str,
        _avatar_session_id: &str,
        _persona: &str,
        _png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// In-memory test double — compiled only with the `test-support` feature.
// NEVER included in `default` features; Dockerfile never passes --features
// so the prod binary is guaranteed not to contain this bypass.
// ---------------------------------------------------------------------------
#[cfg(feature = "test-support")]
pub struct MemoryProfileStore {
    profiles: tokio::sync::Mutex<std::collections::HashMap<String, UserProfile>>,
}

#[cfg(feature = "test-support")]
impl MemoryProfileStore {
    pub fn new() -> Self {
        Self {
            profiles: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }

    pub async fn get_stored(&self, id: &str) -> Option<UserProfile> {
        let map = self.profiles.lock().await;
        map.get(id).map(|p| UserProfile {
            session_id: p.session_id.clone(),
            llm_summary: p.llm_summary.clone(),
            updated_at: p.updated_at,
            persona_guess: p.persona_guess.clone(),
            avatar_svg: p.avatar_svg.clone(),
            avatar_session_id: p.avatar_session_id.clone(),
            avatar_png: p.avatar_png.clone(),
            avatar_png_2: p.avatar_png_2.clone(),
            avatar_png_3: p.avatar_png_3.clone(),
            avatar_png_4: p.avatar_png_4.clone(),
            avatar_pngs: p.avatar_pngs.clone(),
        })
    }
}

#[cfg(feature = "test-support")]
impl Default for MemoryProfileStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "test-support")]
#[async_trait]
impl ProfileStore for MemoryProfileStore {
    async fn get_profile(
        &self,
        id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>> {
        let map = self.profiles.lock().await;
        Ok(map.get(id).map(|p| UserProfile {
            session_id: p.session_id.clone(),
            llm_summary: p.llm_summary.clone(),
            updated_at: p.updated_at,
            persona_guess: p.persona_guess.clone(),
            avatar_svg: p.avatar_svg.clone(),
            avatar_session_id: p.avatar_session_id.clone(),
            avatar_png_2: p.avatar_png_2.clone(),
            avatar_png_3: p.avatar_png_3.clone(),
            avatar_png_4: p.avatar_png_4.clone(),
            avatar_png: p.avatar_png.clone(),
            avatar_pngs: p.avatar_pngs.clone(),
        }))
    }

    async fn upsert_persona_avatar(
        &self,
        id: &str,
        avatar_session_id: &str,
        persona: &str,
        png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut map = self.profiles.lock().await;
        let entry = map.entry(id.to_string()).or_insert_with(|| UserProfile {
            session_id: id.to_string(),
            llm_summary: String::new(),
            updated_at: 0,
            persona_guess: String::new(),
            avatar_svg: String::new(),
            avatar_session_id: String::new(),
            avatar_png: String::new(),
            avatar_png_2: String::new(),
            avatar_png_3: String::new(),
            avatar_png_4: String::new(),
            avatar_pngs: Vec::new(),
        });
        entry.persona_guess = persona.to_string();
        entry.avatar_session_id = avatar_session_id.to_string();
        entry.avatar_pngs = entry.appended_png_history(png);
        entry.avatar_png = png.to_string();
        entry.updated_at = chrono::Utc::now().timestamp_millis();
        Ok(())
    }
}

pub struct AnalyticsDb {
    session: Arc<Session>,
    insert_stmt: PreparedStatement,
    upsert_profile_stmt: PreparedStatement,
    /// Writes persona_guess + 4 PNG slots + avatar_session_id.
    upsert_avatar_stmt: PreparedStatement,
    get_profile_stmt: PreparedStatement,
}

impl AnalyticsDb {
    pub async fn connect(
        contact_point: &str,
        username: &str,
        password: &str,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let mut tls_builder = SslContextBuilder::new(SslMethod::tls())?;
        tls_builder.set_verify(SslVerifyMode::PEER);
        tls_builder.set_default_verify_paths()?;
        let ssl_context = tls_builder.build();

        // Azure Cosmos DB for Apache Cassandra is wire-compatible for queries but does not expose
        // Scylla-specific system tables (e.g. `system_schema.scylla_tables`). The driver otherwise
        // probes that table and may log topology warnings or fall back to dummy cluster metadata.
        let session: Session = SessionBuilder::new()
            .known_node(format!("{contact_point}:10350"))
            .user(username, password)
            .ssl_context(Some(ssl_context))
            .fetch_schema_metadata(false)
            .build()
            .await?;

        let insert_cql = "INSERT INTO analytics.events \
            (site_id, event_date, event_time, event_id, event_type, source, \
             page_url, user_agent, referrer, session_id, properties) \
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

        let insert_stmt = session.prepare(insert_cql).await?;

        let upsert_profile_cql = "INSERT INTO analytics.user_profiles \
            (session_id, llm_summary, updated_at) VALUES (?, ?, ?)";
        let upsert_profile_stmt = session.prepare(upsert_profile_cql).await?;

        let upsert_avatar_cql = "INSERT INTO analytics.user_profiles \
            (session_id, persona_guess, avatar_png, avatar_pngs, avatar_session_id, updated_at) \
            VALUES (?, ?, ?, ?, ?, ?)";
        let upsert_avatar_stmt = session.prepare(upsert_avatar_cql).await?;

        let get_profile_cql = "SELECT session_id, llm_summary, updated_at, persona_guess, \
             avatar_svg, avatar_session_id, avatar_png, avatar_png_2, avatar_png_3, avatar_png_4, avatar_pngs \
             FROM analytics.user_profiles WHERE session_id = ?";
        let get_profile_stmt = session.prepare(get_profile_cql).await?;

        Ok(Self {
            session: Arc::new(session),
            insert_stmt,
            upsert_profile_stmt,
            upsert_avatar_stmt,
            get_profile_stmt,
        })
    }

    pub async fn insert_event(
        &self,
        event: &AnalyticsEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let date_days = event
            .event_date
            .signed_duration_since(NaiveDate::from_ymd_opt(1970, 1, 1).unwrap())
            .num_days() as i32;

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
            let (
                site_id,
                date_days,
                event_time,
                event_id,
                event_type,
                source,
                page_url,
                user_agent,
                referrer,
                session_id,
                properties,
            ) = row?;
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

    /// Query events from the last N days for a given site. Used to discover session_ids for summarization.
    pub async fn query_recent_events(
        &self,
        site_id: &str,
        days: u32,
        limit_per_day: i32,
    ) -> Result<Vec<AnalyticsEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let origin = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
        let today = Utc::now().date_naive();
        let days = days.min(30);
        let mut all_events = Vec::new();

        let cql = "SELECT site_id, event_date, event_time, event_id, event_type, source, \
                   page_url, user_agent, referrer, session_id, properties \
                   FROM analytics.events WHERE site_id = ? AND event_date = ? LIMIT ?";

        let prepared = self.session.prepare(cql).await?;

        for i in 0..days {
            let date = today - chrono::Duration::days(i as i64);
            let date_days = date.signed_duration_since(origin).num_days() as i32;

            let result = self
                .session
                .execute_unpaged(&prepared, (site_id, date_days, limit_per_day))
                .await?;

            let rows = result.into_rows_result()?;
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
                let (
                    site_id,
                    date_days,
                    event_time,
                    event_id,
                    event_type,
                    source,
                    page_url,
                    user_agent,
                    referrer,
                    session_id,
                    properties,
                ) = row?;
                let event_date = origin
                    .checked_add_signed(chrono::Duration::days(date_days as i64))
                    .unwrap_or(origin);
                all_events.push(AnalyticsEvent {
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
        }

        all_events.sort_by_key(|e| std::cmp::Reverse(e.event_time));
        Ok(all_events)
    }

    /// Upsert a user profile (LLM summary) for a session_id.
    pub async fn upsert_user_profile(
        &self,
        session_id: &str,
        llm_summary: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let updated_at = CqlTimestamp(Utc::now().timestamp_millis());
        self.session
            .execute_unpaged(
                &self.upsert_profile_stmt,
                (session_id, llm_summary, updated_at),
            )
            .await?;
        Ok(())
    }

    /// Store persona + single composite PNG avatar for a session_id (fingerprint / distinct id).
    pub async fn upsert_persona_avatar(
        &self,
        session_id: &str,
        avatar_session_id: &str,
        persona_guess: &str,
        png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let history = match self.get_user_profile(session_id).await {
            Ok(Some(p)) => p.appended_png_history(png),
            _ => vec![png.to_string()],
        };
        let updated_at = CqlTimestamp(Utc::now().timestamp_millis());
        self.session
            .execute_unpaged(
                &self.upsert_avatar_stmt,
                (
                    session_id,
                    persona_guess,
                    png,
                    history,
                    avatar_session_id,
                    updated_at,
                ),
            )
            .await?;
        Ok(())
    }

    /// Get user profile by session_id. Also used internally by [`ProfileStore`] impl.
    pub async fn get_user_profile(
        &self,
        session_id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>> {
        if session_id.is_empty() {
            return Ok(None);
        }

        let result = self
            .session
            .execute_unpaged(&self.get_profile_stmt, (session_id,))
            .await?;

        let rows = result.into_rows_result()?;
        if let Some(row) = rows
            .rows::<(
                String,
                Option<String>,
                Option<CqlTimestamp>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<Vec<String>>,
            )>()?
            .next()
        {
            let (
                sid,
                summary,
                updated_at,
                persona,
                avatar_svg,
                avatar_session_id,
                avatar_png,
                avatar_png_2,
                avatar_png_3,
                avatar_png_4,
                avatar_pngs,
            ) = row?;
            return Ok(Some(UserProfile {
                session_id: sid,
                llm_summary: summary.unwrap_or_default(),
                updated_at: updated_at.map(|t| t.0).unwrap_or(0),
                persona_guess: persona.unwrap_or_default(),
                avatar_svg: avatar_svg.unwrap_or_default(),
                avatar_session_id: avatar_session_id.unwrap_or_default(),
                avatar_png: avatar_png.unwrap_or_default(),
                avatar_png_2: avatar_png_2.unwrap_or_default(),
                avatar_png_3: avatar_png_3.unwrap_or_default(),
                avatar_png_4: avatar_png_4.unwrap_or_default(),
                avatar_pngs: avatar_pngs.unwrap_or_default(),
            }));
        }
        Ok(None)
    }
}

#[async_trait]
impl ProfileStore for AnalyticsDb {
    async fn get_profile(
        &self,
        id: &str,
    ) -> Result<Option<UserProfile>, Box<dyn std::error::Error + Send + Sync>> {
        self.get_user_profile(id).await
    }

    async fn upsert_persona_avatar(
        &self,
        id: &str,
        avatar_session_id: &str,
        persona: &str,
        png: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        AnalyticsDb::upsert_persona_avatar(self, id, avatar_session_id, persona, png).await
    }
}

#[cfg(test)]
mod merge_profile_tests {
    use super::UserProfile;

    fn profile_with_pngs(sid: &str, pngs: Vec<&str>) -> UserProfile {
        let last = pngs.last().map(|s| s.to_string()).unwrap_or_default();
        UserProfile {
            session_id: sid.to_string(),
            llm_summary: String::new(),
            updated_at: 0,
            persona_guess: String::new(),
            avatar_svg: String::new(),
            avatar_session_id: String::new(),
            avatar_png: last.clone(),
            avatar_png_2: String::new(),
            avatar_png_3: String::new(),
            avatar_png_4: String::new(),
            avatar_pngs: pngs.into_iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn merge_combines_legacy_then_fp_dedupes() {
        let leg = profile_with_pngs("ph-1", vec!["a", "b"]);
        let fp = profile_with_pngs("fp-x", vec!["b", "c"]);
        let m = UserProfile::merge_split_storage_rows(Some(leg), Some(fp)).expect("merged");
        assert_eq!(
            m.avatar_pngs,
            vec!["a".to_string(), "b".to_string(), "c".to_string()]
        );
        assert_eq!(m.session_id, "fp-x");
        assert_eq!(m.avatar_png, "c");
    }

    #[test]
    fn merge_fingerprint_only() {
        let fp = profile_with_pngs("fp", vec!["z"]);
        let m = UserProfile::merge_split_storage_rows(None, Some(fp)).unwrap();
        assert_eq!(m.stored_portrait_count(), 1);
    }

    #[test]
    fn merge_legacy_only() {
        let leg = profile_with_pngs("leg", vec!["x", "y"]);
        let m = UserProfile::merge_split_storage_rows(Some(leg), None).unwrap();
        assert_eq!(m.stored_portrait_count(), 2);
    }
}
