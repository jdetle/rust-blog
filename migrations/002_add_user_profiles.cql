-- User profiles table for LLM-generated summaries per device_id/fingerprint.
-- Run via cqlsh or Azure Data Explorer.
-- cqlsh <contact-point> 10350 -u <username> -p <password> -e "SOURCE 'migrations/002_add_user_profiles.cql'"
CREATE TABLE IF NOT EXISTS analytics.user_profiles (
  session_id TEXT PRIMARY KEY,
  llm_summary TEXT,
  updated_at TIMESTAMP
);
