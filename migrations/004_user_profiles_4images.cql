-- Migration 004: add three additional PNG avatar columns for the 4-image collage flow.
--
-- avatar_png (slot 1) was added in migration 003 and maps to the region/culture theme.
-- avatar_png_2 through avatar_png_4 hold the device-era, network-mood, and persona-archetype
-- slots respectively. All four are raw base64 PNG strings (no data: prefix).
--
-- Run once against the analytics keyspace before deploying blog-service builds that
-- reference these columns. The ALTER TABLE statements are idempotent in Cassandra/Cosmos DB
-- for Cassandra when the column does not already exist; re-running will surface a benign
-- "column already exists" error which can be ignored.

ALTER TABLE analytics.user_profiles ADD avatar_png_2 text;
ALTER TABLE analytics.user_profiles ADD avatar_png_3 text;
ALTER TABLE analytics.user_profiles ADD avatar_png_4 text;
