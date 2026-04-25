#!/usr/bin/env bash
# Poll Sentry for unresolved issues matching Cosmos / Scylla driver metadata errors.
# Requires: SENTRY_AUTH_TOKEN with Issues API access (e.g. scopes including
# `project:read` / `org:read`). The Key Vault `sentry-auth-token` used for
# source-map upload may be build-plugin-only and return HTTP 403 here — use an
# auth token from Sentry → Settings → Auth Tokens with the right permissions,
# or verify in the Sentry UI (Issues, search: scylla_tables).
#
# Usage:
#   export SENTRY_AUTH_TOKEN=...
#   bash scripts/poll-sentry-cosmos-scylla.sh [interval_seconds] [iterations]
# Default: every 300s (5 min), 24 iterations (~2 hours).

set -euo pipefail

INTERVAL="${1:-300}"
ITERS="${2:-24}"
ORG="oak-heights-llc"
PROJECTS=(rust-blog-nextjs rust-blog)

if [[ -z "${SENTRY_AUTH_TOKEN:-}" ]]; then
	echo "ERROR: SENTRY_AUTH_TOKEN is not set." >&2
	exit 1
fi

QUERY='is:unresolved (scylla_tables OR "control connection" OR "fetch metadata")'
ENC_QUERY=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$QUERY")

echo "$(date -Iseconds) starting poll: interval=${INTERVAL}s iterations=${ITERS}"

for ((i = 1; i <= ITERS; i++)); do
	echo ""
	echo "=== $(date -Iseconds) round ${i}/${ITERS} ==="
	for proj in "${PROJECTS[@]}"; do
		url="https://sentry.io/api/0/projects/${ORG}/${proj}/issues/?query=${ENC_QUERY}"
		if ! body=$(curl -sS -w "\n%{http_code}" -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" "$url"); then
			echo "  ${proj}: curl failed"
			continue
		fi
		http=$(echo "$body" | tail -n1)
		json=$(echo "$body" | sed '$d')
		if [[ "$http" != "200" ]]; then
			echo "  ${proj}: HTTP ${http} (project missing or token scope?)"
			continue
		fi
		count=$(echo "$json" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
		echo "  ${proj}: matching unresolved count = ${count}"
	done
	if ((i < ITERS)); then
		sleep "$INTERVAL"
	fi
done

echo "$(date -Iseconds) poll finished."
