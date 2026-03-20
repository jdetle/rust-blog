#!/usr/bin/env bash
# Cursor stop / session-end hook: remind if feature branch PR is not merged.
# Register in Cursor Settings → Hooks → stop (or project hooks) pointing at this file.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/scripts/finish-work-merge-ci.sh" stop-reminder
