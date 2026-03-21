#!/usr/bin/env bash
# Thin wrapper for local CI parity, PR status, and session-end reminders.
# See .cursor/skills/finish-work-merge-ci/SKILL.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run_verify() {
	echo "==> Rust (matches .github/workflows/ci.yml rust job)"
	cargo check
	cargo clippy -- -D warnings
	cargo test
	cargo build --benches
	cargo build --release
	echo "==> Next.js (matches ci.yml next job)"
	bun install --frozen-lockfile
	bun run build
	echo "==> verify: OK"
}

run_stop_reminder() {
	# Non-fatal: never block Cursor shutdown; stderr only.
	if ! command -v git >/dev/null 2>&1; then
		return 0
	fi
	local branch
	branch="$(git branch --show-current 2>/dev/null || true)"
	if [[ -z "$branch" || "$branch" == "main" || "$branch" == "master" ]]; then
		return 0
	fi
	if ! command -v gh >/dev/null 2>&1; then
		echo "finish-work-merge-ci: install gh and auth to enforce PR/merge workflow." >&2
		return 0
	fi
	if ! gh auth status >/dev/null 2>&1; then
		echo "finish-work-merge-ci: gh not authenticated — run: gh auth login" >&2
		return 0
	fi
	local open_count merged_count
	open_count="$(gh pr list --head "$branch" --state open --json number --jq 'length' 2>/dev/null || echo 0)"
	merged_count="$(gh pr list --head "$branch" --state merged --json number --jq 'length' 2>/dev/null || echo 0)"
	if [[ "$merged_count" != "0" ]]; then
		local murl
		murl="$(gh pr list --head "$branch" --state merged --json url --jq '.[0].url' 2>/dev/null || true)"
		echo "finish-work-merge-ci: PR merged. ${murl:-}" >&2
		return 0
	fi
	if [[ "$open_count" == "0" ]]; then
		echo "finish-work-merge-ci: branch '$branch' has no open PR. Push and open a PR before declaring done." >&2
		return 0
	fi
	local url
	url="$(gh pr list --head "$branch" --state open --json url --jq '.[0].url' 2>/dev/null || echo "")"
	echo "finish-work-merge-ci: work not finished — open PR not merged. ${url:-}" >&2
	echo "finish-work-merge-ci: next: gh pr checks --watch ; then gh pr merge --squash --delete-branch" >&2
	return 0
}

run_pr_wait() {
	if ! command -v gh >/dev/null 2>&1; then
		echo "gh is required" >&2
		exit 1
	fi
	gh pr checks --watch
}

run_merge() {
	if ! command -v gh >/dev/null 2>&1; then
		echo "gh is required" >&2
		exit 1
	fi
	local branch
	branch="$(git branch --show-current)"
	if [[ "$branch" == "main" || "$branch" == "master" ]]; then
		echo "refuse to merge from main" >&2
		exit 1
	fi
	gh pr merge --squash --delete-branch "$@"
}

cmd="${1:-verify}"
case "$cmd" in
	verify)
		run_verify
		;;
	stop-reminder)
		run_stop_reminder
		;;
	pr-wait)
		run_pr_wait
		;;
	merge)
		shift || true
		run_merge "$@"
		;;
	*)
		echo "usage: $0 verify | stop-reminder | pr-wait | merge [-- gh-pr-merge-args]" >&2
		exit 1
		;;
esac
