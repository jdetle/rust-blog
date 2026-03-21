# Cursor hooks (merge + CI discipline)

These scripts support the [finish-work-merge-ci](../skills/finish-work-merge-ci/SKILL.md) workflow.

## `stop-merge-ci-reminder.sh`

Runs at **session stop** (when configured in Cursor). It does **not** block shutdown. It prints to **stderr** if:

- You are on a branch other than `main`/`master`, and
- `gh` reports an open PR that is not merged, or no PR exists.

Install `gh` and run `gh auth login` for useful output.

### Register in Cursor

In **Cursor Settings → Hooks** (or project-level hooks, depending on your Cursor version), add a **stop** hook with command:

```text
bash /absolute/path/to/rust-blog/.cursor/hooks/stop-merge-ci-reminder.sh
```

Use the absolute path to this repo on your machine. The agent skill documents the full finish-work workflow; hooks only reinforce reminders.

## Related repo scripts

- [`scripts/finish-work-merge-ci.sh`](../../scripts/finish-work-merge-ci.sh) — `verify` (local CI parity), `pr-wait`, `merge`, `stop-reminder`.
