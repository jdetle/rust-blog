-- Secondary index for querying events by session_id (PostHog distinct_id).
-- Run once via cqlsh or Azure Data Explorer. If index already exists, ignore the error.
-- cqlsh <contact-point> 10350 -u <username> -p <password> -e "CREATE INDEX events_session_id_idx ON analytics.events (session_id);"
CREATE INDEX events_session_id_idx ON analytics.events (session_id);
