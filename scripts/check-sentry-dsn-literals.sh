#!/usr/bin/env bash
set -euo pipefail
# Fail if a string resembling a real Sentry JavaScript DSN appears in tracked source.
# Uses git grep (no ripgrep required).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PATTERN='https://[0-9a-f]{32,}@[a-z0-9.-]*\.ingest(\.[a-z0-9.-]+)?\.sentry\.io/[0-9]+'

set +e
# Tracked TS/JS only; exclude heavy / generated trees via pathspec.
git grep -nE "$PATTERN" -- \
	'*.ts' \
	'*.tsx' \
	'*.js' \
	'*.mjs' \
	'*.cjs' \
	':(exclude)node_modules' \
	':(exclude).next' \
	':(exclude)target' \
	':(exclude)vendor'
grep_exit=$?
set -e

if [ "$grep_exit" -eq 0 ]; then
	echo "ERROR: Possible committed Sentry DSN (32+ hex key @ ingest.*.sentry.io). Use NEXT_PUBLIC_SENTRY_DSN / secrets only."
	exit 1
fi

if [ "$grep_exit" -ne 1 ]; then
	echo "git grep failed with exit $grep_exit"
	exit "$grep_exit"
fi
