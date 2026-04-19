---
name: finish-work-merge-ci
description: >-
  Takes finished work through merge conflict resolution, local CI parity with
  origin, green GitHub Actions on the PR, and squash merge to main. Treats the
  agent session as incomplete until the PR is merged or the user explicitly
  stops. Integrates repo hooks under .cursor/hooks for session-end reminders.
  Use when closing an agent task, before declaring done, or when the user wants
  ship-ready code on main.
---

# Finish work: conflicts, CI, merge — definition of done

## Definition of done (agent)

The agent is **not finished** until **one** of these is true:

1. **Squash-merged to `main`** — the change is on `origin/main` (verify with `git fetch origin main && git log -1 origin/main`).
2. **Explicit stop** — the user cancels or says to stop; document PR URL and remaining steps.
3. **Hard block** — branch protection or permissions prevent merge (e.g. required review from a human). Then: CI must be green, conflicts resolved, PR ready; **notify the user** with PR link and exact merge command; agent still treats “full done” as after human merge unless user accepts handoff.

“Pushed branch” or “CI passed once” alone is **not** done.

## Preconditions

- Work in a **dedicated worktree**, not the primary checkout (`.cursor/rules/agent-branching.mdc`).
- **Conventional commits** (`.cursor/rules/conventional-commits.mdc`).
- **Bun** for JS (`bun install`, `bun run build`) — `.cursor/rules/package-manager.mdc`.

## Workflow (execute in order)

### 1. Sync and resolve merge conflicts

```bash
git fetch origin main
git merge origin/main --no-edit
```

If conflicts: resolve, then `bunx biome check --write` on conflicted TS/TSX/JS where applicable (`.cursor/rules/post-merge-lint.mdc`). Re-run local verify (step 3) after resolving.

### 2. Push branch so GitHub runs CI

```bash
git push -u origin HEAD
```

### 3. Local CI parity (must match GitHub)

Prefer the repo script (same commands as [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)):

```bash
bash scripts/finish-work-merge-ci.sh verify
```

Or run `cargo check`, `cargo clippy -- -D warnings`, `cargo test`, `cargo build --benches`, `cargo build --release`, then `bun install --frozen-lockfile` and `bun run build`.

If local verify fails, **fix before pushing** again.

### 4. Open or refresh PR

```bash
gh pr view --web || gh pr create --title "<title>" --body "<summary>"
```

### 5. Wait for origin CI

```bash
bash scripts/finish-work-merge-ci.sh pr-wait
```

Or: `gh pr checks --watch`. If anything fails, read the Actions log, reproduce locally, fix, commit, push — **repeat from step 1** until green.

### 6. Merge to main (squash)

When checks pass and branch is mergeable:

```bash
bash scripts/finish-work-merge-ci.sh merge
```

Equivalent: `gh pr merge --squash --delete-branch` (add `--auto` earlier if your flow uses merge queue). If merge fails (permissions, reviews), paste the error and leave the PR ready; **do not** claim “merged” until `origin/main` contains the change.

### 7. Confirm on origin

```bash
git fetch origin main
git log -1 --oneline origin/main
```

## Hooks (enforce discipline)

Session-end behavior is **reminded** by:

- [`scripts/finish-work-merge-ci.sh`](../../../scripts/finish-work-merge-ci.sh) `stop-reminder` — stderr message if a feature branch has an open, unmerged PR or no PR.
- [`.cursor/hooks/stop-merge-ci-reminder.sh`](../../hooks/stop-merge-ci-reminder.sh) — thin wrapper; register as a **Cursor stop hook** (see [`.cursor/hooks/README.md`](../../hooks/README.md)).

Hooks **do not** block the editor; they remind. The **skill** is the contract: the agent keeps working until merge or an explicit exception.

## Anti-patterns

- Declaring done after push without **merged** `main` and without user opt-out.
- Skipping `merge origin/main` before final push — CI runs on merged base with main; drift causes surprise failures.
- `--no-verify` / bypassing hooks without user approval.

## Quick checklist

```markdown
- [ ] Merged latest `origin/main`; conflicts resolved
- [ ] `bash scripts/finish-work-merge-ci.sh verify` passes
- [ ] Pushed; PR exists
- [ ] `gh pr checks` green on origin
- [ ] `gh pr merge --squash` succeeded OR user approved stop / branch protection documented
- [ ] `origin/main` shows the change (if merged)
```

## Supersedes

Replaces the narrower [worktree-publish-ci](../worktree-publish-ci/SKILL.md) flow; use **this** skill for full ship discipline.
