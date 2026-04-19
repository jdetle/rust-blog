-- Per-session avatar caching + PNG storage for OpenAI gpt-image-1 regional collages.
-- Run after 003_user_profiles_avatar.cql.
-- cqlsh <contact-point> 10350 -u <username> -p <password> -e "SOURCE 'migrations/004_user_profiles_session_avatar.cql'"
--
-- avatar_session_id: PostHog session ID used when avatar_png was generated; used for
--                    per-session cache invalidation so each unique visit can refresh the avatar.
-- avatar_png:        Raw base64-encoded PNG from OpenAI gpt-image-1 (no data: prefix).
--                    Empty when the legacy avatar_svg column is in use.

ALTER TABLE analytics.user_profiles ADD avatar_session_id TEXT;
ALTER TABLE analytics.user_profiles ADD avatar_png TEXT;
