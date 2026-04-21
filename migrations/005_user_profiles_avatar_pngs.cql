-- Append-only history of generated composite PNGs (raw base64, no data: prefix).
-- Latest portrait is the last element; avatar_png remains the latest for backward compatibility.
-- Run after 004. Re-run safe only if column already exists (Cosmos may error on duplicate ADD).
-- cqlsh <contact-point> 10350 -u <username> -p <password> -e "SOURCE 'migrations/005_user_profiles_avatar_pngs.cql'"

ALTER TABLE analytics.user_profiles ADD avatar_pngs LIST<TEXT>;
