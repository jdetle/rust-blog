#!/usr/bin/env bash
# Run Cosmos DB Cassandra API migrations for analytics keyspace (local or CI with COSMOS_* set).
# Usage:
#   export COSMOS_CONTACT_POINT=xxx.cassandra.cosmos.azure.com
#   export COSMOS_USERNAME=xxx
#   export COSMOS_PASSWORD=xxx
#   bash scripts/run-analytics-migrations.sh
#
# SSL: Cosmos DB port 10350 is TLS-only. The script always passes --ssl.
#   Set SSL_CERTFILE to override the cert bundle path (defaults to system bundle).
#   On macOS: /etc/ssl/cert.pem  On ubuntu-latest: /etc/ssl/certs/ca-certificates.crt
#
# Or: source your .env.local first (set -a; source .env.local; set +a).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${COSMOS_CONTACT_POINT:?Set COSMOS_CONTACT_POINT}"
: "${COSMOS_USERNAME:?Set COSMOS_USERNAME}"
: "${COSMOS_PASSWORD:?Set COSMOS_PASSWORD}"

# Resolve cert bundle: prefer SSL_CERTFILE env var, then OS-specific defaults.
if [[ -z "${SSL_CERTFILE:-}" ]]; then
  if [[ -f /etc/ssl/certs/ca-certificates.crt ]]; then
    export SSL_CERTFILE=/etc/ssl/certs/ca-certificates.crt   # ubuntu/debian
  elif [[ -f /etc/ssl/cert.pem ]]; then
    export SSL_CERTFILE=/etc/ssl/cert.pem                    # macOS
  fi
fi

CQLSH=(cqlsh "$COSMOS_CONTACT_POINT" 10350 -u "$COSMOS_USERNAME" -p "$COSMOS_PASSWORD" --ssl)

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
