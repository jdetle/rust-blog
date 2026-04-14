-- Fictional avatar (SVG) + persona guess per fingerprint, generated via Anthropic Messages API.
-- Run after 002_add_user_profiles.cql.
-- cqlsh <contact-point> 10350 -u <username> -p <password> -e "SOURCE 'migrations/003_user_profiles_avatar.cql'"

ALTER TABLE analytics.user_profiles ADD persona_guess TEXT;
ALTER TABLE analytics.user_profiles ADD avatar_svg TEXT;
