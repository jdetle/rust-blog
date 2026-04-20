#!/usr/bin/env bash
# Run Cosmos DB Cassandra API migrations for analytics keyspace (local or CI with COSMOS_* set).
# Usage:
#   export COSMOS_CONTACT_POINT=xxx.cassandra.cosmos.azure.com
#   export COSMOS_USERNAME=xxx
#   export COSMOS_PASSWORD=xxx
#   bash scripts/run-analytics-migrations.sh
#
# Or: source your .env.local first (set -a; source .env.local; set +a).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${COSMOS_CONTACT_POINT:?Set COSMOS_CONTACT_POINT}"
: "${COSMOS_USERNAME:?Set COSMOS_USERNAME}"
: "${COSMOS_PASSWORD:?Set COSMOS_PASSWORD}"

CQLSH=(cqlsh "$COSMOS_CONTACT_POINT" 10350 -u "$COSMOS_USERNAME" -p "$COSMOS_PASSWORD")

echo "Applying migrations from ${ROOT}/migrations ..."

echo "001 (index — ok if already exists)"
"${CQLSH[@]}" -f "${ROOT}/migrations/001_add_session_id_index.cql" || true

echo "002 (user_profiles table)"
"${CQLSH[@]}" -f "${ROOT}/migrations/002_add_user_profiles.cql"

echo "003 (persona_guess + avatar_svg)"
"${CQLSH[@]}" -f "${ROOT}/migrations/003_user_profiles_avatar.cql"

echo "004a (avatar_session_id + avatar_png slot 1)"
"${CQLSH[@]}" -f "${ROOT}/migrations/004_user_profiles_session_avatar.cql" || true

echo "004b (avatar_png_2..4 for 4-image collage)"
"${CQLSH[@]}" -f "${ROOT}/migrations/004_user_profiles_4images.cql" || true

echo "Done."
