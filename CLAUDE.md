<!-- BEGIN migrated from Cursor rules -->
<!-- Source: rust-blog/.cursor/rules/*.mdc. Each section below was originally a .mdc
     rule in Cursor. Kept together so Claude loads them as always-on
     project context (same semantics as Cursor alwaysApply=true rules). -->

# Migrated Cursor rules (95)

The sections below were automatically converted from Cursor rules. They're
grouped here so Claude loads them as project-wide context.

## Acid Transactions

> PostgreSQL ACID transaction patterns — when to use transactions, how to prevent race conditions, and how to handle locking _always-applied; globs: `src/lib/**/*.ts, src/app/api/**/*.ts`_

# ACID Transactions

Every multi-statement write path must be atomic. PostgreSQL does not auto-wrap sequential queries in a transaction — each `pool.query()` or `sql.run()` is its own implicit transaction. If two writes must succeed or fail together, wrap them explicitly.

## When a Transaction Is Required

| Pattern | Requires transaction? | Why |
|---|---|---|
| Single INSERT/UPDATE/DELETE | No | Already atomic |
| INSERT + UPDATE on related tables | **Yes** | Partial failure leaves inconsistent state |
| DELETE old + INSERT new (replace) | **Yes** | Gap between delete and insert is observable |
| Read value → compute → write back | **Yes** (+ lock) | TOCTOU race without isolation |
| Status transition (read state → validate → update) | **Yes** (+ `FOR UPDATE`) | Concurrent transitions bypass state machine |
| Counter increment from JS | **Avoid** | Use `SET count = count + 1` instead |

## Transaction Pattern

Always acquire a dedicated client from the pool. Never use `pool.query()` or `sql.run()` inside a transaction callback — use `client.query()`.

```typescript
await sql.transaction(async (client) => {
  await client.query('SELECT ... FOR UPDATE', [id]);
  await client.query('UPDATE ... WHERE id = $1 AND status = $2', [id, expectedStatus]);
  await client.query('INSERT INTO ...', [...]);
});
```

## Preventing Race Conditions

### TOCTOU (Time-of-Check to Time-of-Use)

Never do `SELECT` → (decide in JS) → `INSERT/UPDATE` without protection. Three fixes, in order of preference:

1. **Atomic upsert** — `INSERT ... ON CONFLICT ... DO UPDATE` handles the check-and-write in one statement. No transaction needed.
2. **`SELECT ... FOR UPDATE`** — lock the row inside a transaction before reading. Other transactions block until you commit.
3. **Advisory lock** — `pg_advisory_xact_lock(hashtext($1))` for logical resources that don't have a row to lock (e.g., rate limit keys).

### Status Transitions

Every UPDATE that changes a status column must include the expected current status in the WHERE clause:

```sql
UPDATE "SkillReview"
SET status = 'APPROVED', "reviewedBy" = $1, "reviewedAt" = now()
WHERE id = $2 AND status IN ('PENDING', 'NEEDS_CHANGES')
```

If `rowCount === 0`, the transition was already applied or the row was modified concurrently. Throw a clear error — never silently succeed.

### Counter Increments

Never read a count in JS and write it back:

```typescript
// WRONG — race condition
const count = await sql.count('SELECT COUNT(*) ...');
await sql.run('UPDATE ... SET total = $1', count + 1);

// CORRECT — atomic in SQL
await sql.run('UPDATE ... SET total = total + 1 WHERE ...');
```

For severity or threshold computations based on counts, use a CTE:

```sql
WITH recent AS (
  SELECT COUNT(*)::int AS cnt FROM "AbuseEvent"
  WHERE ip = $1 AND "createdAt" > now() - interval '15 minutes'
)
INSERT INTO "AbuseEvent" (..., severity)
SELECT ..., CASE WHEN (SELECT cnt FROM recent) >= 20 THEN 'critical' ELSE $2 END
```

## Isolation Levels

PostgreSQL defaults to **READ COMMITTED**. This is correct for most operations. Use higher isolation only when needed:

| Level | Use when |
|---|---|
| READ COMMITTED (default) | Most CRUD operations, upserts, single-row updates |
| REPEATABLE READ | Reports that must see a consistent snapshot across multiple queries |
| SERIALIZABLE | Multi-row invariants where phantom reads could violate business rules |

Higher isolation levels can produce serialization failures (SQLSTATE `40001`). Any code using REPEATABLE READ or SERIALIZABLE **must** implement retry logic:

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if ((code === '40001' || code === '40P01') && attempt < maxRetries) continue;
      throw e;
    }
  }
  throw new Error('unreachable');
}
```

## Locking Strategy

| Lock type | When to use | Release |
|---|---|---|
| `SELECT ... FOR UPDATE` | Lock specific rows before update in a transaction | Auto on COMMIT/ROLLBACK |
| `SELECT ... FOR UPDATE SKIP LOCKED` | Batch/queue processing — skip rows another worker has | Auto on COMMIT/ROLLBACK |
| `pg_advisory_xact_lock(key)` | Lock a logical resource (not a row) within a transaction | Auto on COMMIT/ROLLBACK |
| `pg_advisory_lock(key)` | Session-level lock for long-running operations | Must explicitly `pg_advisory_unlock` |

Prefer transaction-scoped locks (`FOR UPDATE`, `pg_advisory_xact_lock`) — they cannot leak. Avoid session-level advisory locks unless the operation spans multiple transactions.

### Deadlock Prevention

When locking multiple rows, always acquire locks in a consistent order (e.g., by primary key ascending). Use `ORDER BY id` in `SELECT ... FOR UPDATE` queries.

## Connection Pool Safety

- `SET LOCAL` and `set_config(..., true)` are transaction-scoped — they reset on COMMIT/ROLLBACK. Safe with connection pools.
- `SET` (without LOCAL) persists on the connection. Always use `RESET` in a `finally` block before releasing the client.
- `RESET ROLE` must run in `finally` after any `SET LOCAL role = '...'` — the `withClaims()` wrapper handles this.
- Never use `pool.query()` for multi-statement transactions — it may use different connections for each statement.

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| `sql.run('INSERT ...'); sql.run('UPDATE ...');` | Not atomic — first succeeds, second can fail | Wrap in `sql.transaction()` |
| `const row = await sql.get(...); await sql.run('UPDATE ... SET x = $1', row.x + 1);` | TOCTOU race | `UPDATE ... SET x = x + 1` or `FOR UPDATE` |
| `if (!await sql.get(...)) await sql.run('INSERT ...');` | TOCTOU race on insert | `INSERT ... ON CONFLICT ... DO NOTHING` |
| `await pool.query('BEGIN'); await pool.query('INSERT ...'); await pool.query('COMMIT');` | Pool may use different connections | Use `pool.connect()` for dedicated client |
| `sql.run('UPDATE ... SET status = $1', newStatus)` | No status guard — concurrent transitions bypass state machine | `WHERE status = $2` with expected current status |

## Actionable Links

> Ensure CTAs link to destinations and factual claims cite sources with verified URLs _globs: `**/*.tsx`_

# Actionable Links & Reference Citations

Every call to action must link somewhere. Every factual claim about an external technology, standard, or organization must cite a source. Every link must resolve to a real page.

## Calls to Action

If text tells the user to do something — install, browse, submit, author, explore, get started — it must include a link to where they can do it.

| Text pattern | Required link |
|---|---|
| "Install skills" / "Browse skills" | `/skills` |
| "Submit feedback" / "gather feedback" | `/feedback` |
| "View governance" / "Review queue" | `/governance` |
| "MCP server" (as a feature reference) | `/mcp-servers` |
| "See how it works" | `/about#stages` |
| Specific skill name (e.g., "generate-uat") | `/skills/{slug}` |

Use Next.js `<Link>` for internal routes. Style with `className="font-medium text-primary hover:underline"`.

## Factual Claims & Technology References

When copy references an external technology, standard, protocol, or organization by name, link to its official site on first mention within the component.

| Reference | Verified URL |
|---|---|
| Model Context Protocol / MCP (spec) | `https://modelcontextprotocol.io` |
| Anthropic | `https://www.anthropic.com` |
| Cursor (general) | `https://cursor.com` |
| Cursor MCP docs | `https://docs.cursor.com/en/context/mcp` |
| Node.js | `https://nodejs.org` |
| JSON-RPC | `https://www.jsonrpc.org/specification` |
| GitHub tokens | `https://github.com/settings/tokens` |
| Brave Search API | `https://brave.com/search/api` |
| Slack API | `https://api.slack.com/apps` |

Use `<a>` with `target="_blank" rel="noopener noreferrer"`. Style with `className="text-primary underline underline-offset-2 hover:text-primary-hover"`.

## Before Adding a New External Link

1. Verify the URL resolves (use `WebFetch` or `WebSearch`).
2. Prefer official documentation over blog posts or third-party summaries.
3. Link the most specific page (e.g., Cursor MCP docs, not just cursor.com) when the context warrants it.

## Quick Self-Check

Before shipping UI text, ask: "If I were a new user reading this, could I click through to do or learn what the text describes?" If not, add a link.

## Adversarial Review Gate

> Require adversarial review before declaring any code-producing work complete _always-applied_

# Adversarial Review Gate

Before declaring work complete on any code-producing task (pushing a branch, opening a PR, or telling the user "done"), run an adversarial review proportional to the change size.

**Use the adversarial-review skill for the full protocol.** This gate rule is the trigger; the skill at `.cursor/skills/adversarial-review/SKILL.md` is the implementation. The skill defines both diff-audit mode (used here) and design-debate mode (used for contested proposals).

## Proportionality

| Change size | Review depth |
|---|---|
| Trivial (1-2 files, style/copy/rename only) | One line in `TLDR.md`, no separate review file |
| Small feature (3-10 files) | Diff-audit: five lenses, save review file |
| Multi-file refactor or rebase | Diff-audit: full file-by-file vs `origin/main`; verify no accidental reversions |
| Architecture / new system | Diff-audit first; escalate to design-debate if contested |

## Five Lenses (Diff-Audit)

Examine `git diff origin/main...HEAD` through:

1. **Accidental reversions** — Did conflict resolution, rebase, or cherry-pick silently drop upstream changes?
2. **Scope creep** — Does the diff contain changes unrelated to the stated goal?
3. **Semantic correctness** — Do the changes actually achieve what was asked?
4. **Edge cases** — What happens when the happy path doesn't hold?
5. **Test coverage** — If behavior changed, are tests updated?

## When Rebase or Conflict Resolution Was Involved

Always compare the final diff against upstream to catch silent reversions. The pattern that triggered this rule: `git checkout --theirs` during a rebase took the wrong side and stripped upstream features without anyone noticing until the adversarial review caught it.

## Open Follow-Ups

Before pushing, scan `docs/adversarial-review/reviews/TLDR.md` for unchecked follow-ups (`- [ ]`) that are related to files in the current diff. Surface them — do not silently skip.

## Output

State findings concisely before proceeding:
- **Clean** — no issues found, proceeding to push/merge
- **Found N issues** — list each, fix them, then re-review the fix

## Agent Branching

> One agent session = one worktree = one PR. Never commit in the primary worktree or directly to main. _always-applied_

# Agent Branching Workflow

**Rule: Start a PR for every agent session on its own worktree.**

Every **top-level** agent session that produces code changes MUST work in a **dedicated git worktree** on a dedicated branch, and MUST end with a pushed branch and open PR. Never commit in the primary worktree. Never commit directly to `main`.

**Subagents are exempt.** Subagents (launched via the Task tool) inherit the parent agent's workspace and worktree. They do not create their own worktrees — they commit, edit, and run commands in whatever worktree the parent is already using.

## Workflow

1. **Create the worktree FIRST — before any edits.** The very first action in any code-producing session is creating the worktree. Do not read files, do not edit files, do not run exploratory commands in the primary worktree and "move changes later." Set up the worktree, `cd` into it, then start working.
   ```bash
   git fetch origin main
   git worktree add -b <type>/<branch-name> ../rust-blog-wt/<short-name> origin/main
   cd ../rust-blog-wt/<short-name>
   ```
   Or, if this repo has `scripts/setup-worktree.sh`:
   ```bash
   bash scripts/setup-worktree.sh <type>/<branch-name> <short-name>
   cd ../rust-blog-wt/<short-name>
   ```
   Use conventional branch prefixes: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `test/`.

   If the branch already has a worktree, `cd` into it: check `git worktree list` first.

2. **Work in the worktree.** All edits, commits, and dev server runs happen there — not in the primary checkout.

3. **Commit as you go** following the conventional commits rule.

4. **When work is complete**, push and open a PR:
   ```bash
   git push -u origin HEAD
   gh pr create --title "<title>" --body "<summary>"
   ```
   Follow the PR formatting rules in `pull-requests.mdc`.

5. **Return the PR URL** to the user.

## Why Worktrees

- The primary worktree stays on `main` — clean, always runnable, the production baseline.
- Each worktree gets its own `node_modules`, `.next` cache, dev server port, and database.
- Multiple agents (or one agent + one human) can work on different features in parallel without branch switching, stash juggling, or port conflicts.
- A Cursor hook (`.cursor/hooks/enforce-worktree.sh`) blocks `git commit` and `git checkout -b` in the primary worktree.

## Branch Naming

- `feat/branch-specific-db` — new capability
- `fix/seed-crash-on-empty` — bug fix
- `refactor/extract-db-path` — restructuring
- `chore/update-deps` — maintenance

Keep names short (3-5 words), lowercase, hyphen-separated.

## What NOT to Do

- Do not edit files in the primary worktree — not even "just to check something." Create the worktree first, then edit.
- Do not commit in the primary worktree — the `enforce-worktree` hook will block it.
- Do not use `git checkout -b` in the primary worktree — use `scripts/setup-worktree.sh` instead.
- Do not commit to `main` directly — even "small" changes.
- Do not make edits on `main` and copy them to a worktree later — this wastes time and risks forgetting files.
- Do not leave uncommitted changes and tell the user to handle it.
- Do not create a branch without eventually pushing and opening a PR (unless the user cancels the task).

## Cleanup

After a PR is merged:
```bash
git worktree remove ../rust-blog-wt/<short-name>
git branch -d <branch-name>
```

## Api Route Auth Guard

> Every API route handler must explicitly handle authentication — either enforce it or document why the route is public _always-applied_

# API Route Auth Guard — Learned from auth gap audit

An adversarial audit found 10+ API routes exposing sensitive data or accepting mutations without any authentication check. The middleware (`middleware.ts`) only protects `/api/governance` and `/api/auth/impersonate`. All other routes pass through the middleware unauthenticated and must enforce auth in their handler. Several routes — feedback GET (emails), logs (application internals), contributions PATCH (review approval), DORA POST (metric injection) — were left completely open.

## The Rule

Every API route handler under `src/app/api/` must do one of the following:

### 1. Enforce authentication (default for sensitive routes)

```typescript
import { getSessionFromCookies } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  // ... handler logic
}
```

### 2. Mark as intentionally public with a comment

```typescript
// AUTH: Public — catalog data, no PII, read-only
export async function GET(request: NextRequest) {
  // ... handler logic
}
```

There is no third option. A route without either an auth check or an `AUTH:` comment is a deficiency.

## Classification Guide

| Route type | Auth required? | Example |
|---|---|---|
| Public catalog reads (skills, rules, MCP servers) | No | `GET /api/skills`, `GET /api/rules` |
| User-submitted content reads (feedback, contributions) | Yes — contains PII | `GET /api/feedback` |
| Any mutation (POST, PATCH, PUT, DELETE) | Yes | `POST /api/contributions` |
| Administrative data (logs, DORA metrics, usage) | Yes — internal data | `GET /api/logs` |
| Health check | No | `GET /api/health` |

## Routes Currently Missing Auth

| Route | Method | Severity | Issue |
|---|---|---|---|
| `/api/feedback` | GET | Critical | Exposes user emails |
| `/api/logs` | GET | Critical | Exposes application logs |
| `/api/logs/streams` | GET | Critical | Exposes log streams |
| `/api/logs/stats` | GET | Critical | Exposes log statistics |
| `/api/logs/groups` | GET | Critical | Exposes log groups |
| `/api/contributions` | POST | High | Anonymous contribution creation |
| `/api/contributions/[id]` | PATCH | Critical | Anonymous review approval |
| `/api/dora/incidents` | POST | High | Fake metric injection |
| `/api/dora/deployments` | POST | High | Fake metric injection |
| `/api/suggestions/[id]` | PATCH | High | Anonymous accept/dismiss |

## Middleware Is Not Sufficient

The middleware only blocks unauthenticated requests to paths matching `PROTECTED_MUTATION_PREFIXES`. Adding a route to the middleware prefix list protects it at the infrastructure level, but handler-level auth is still required because:

1. The middleware allows all reads (GET) through — sensitive data endpoints need handler-level auth
2. Middleware prefix matching is coarse — it can't distinguish between public and private sub-routes
3. Handler-level auth gives access to the session object for authorization (role checks, ownership)

## Examples

### Wrong (caused the deficiency)

```typescript
// No auth check — anyone can read all feedback including emails
export async function GET(request: NextRequest) {
  try {
    const allFeedback = await getAllFeedback();
    return NextResponse.json({ feedback: allFeedback });
  } catch {
    return NextResponse.json({ feedback: [], total: 0 });
  }
}
```

### Right (prevents recurrence)

```typescript
export async function GET(request: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const allFeedback = await getAllFeedback();
    return NextResponse.json({ feedback: allFeedback });
  } catch {
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
```

## Origin

- **Failure**: Adversarial audit found 10+ routes with no auth — feedback emails, application logs, contribution approvals, and DORA metrics all accessible to anonymous callers
- **Date**: 2026-03-13
- **Root cause**: Middleware only protects governance and impersonation routes; handler-level auth was applied inconsistently (some routes check, others don't)
- **PR**: feat/adversarial-deficiency-tests

## Detection Acceleration

- **Level**: Unit test (CI)
  **What was added**: `src/__tests__/adversarial/evil-user/unauthenticated-routes.test.ts` and `src/__tests__/adversarial/security/unauthenticated-mutations.test.ts` — maintain an inventory of all routes and their auth status. When a new route is added, it must be added to the inventory with its auth classification.
  **Diagnosis time before**: No systematic way to detect auth gaps — discovered only during manual security review
  **Diagnosis time after**: Test failure with descriptive message identifying the unprotected route

## Auth Redirect — Return to Intended Destination

> Always return users to their intended destination after login/SSO _always-applied_

# Auth Redirect — Return to Intended Destination

After any auth flow (SSO, email login, session expiry re-auth), the user must land on the page they were trying to reach — not a generic home page or dashboard.

## Mechanism: `redirectTo` Query Param

Store the intended URL in a `redirectTo` query parameter throughout the auth flow.

### 1. Capture the intended URL

When an unauthenticated user hits a protected route, redirect to the login page with their original URL encoded as `redirectTo`:

```tsx
// middleware.ts — protecting routes
const url = request.nextUrl.clone();
const intended = url.pathname + url.search;
url.pathname = "/login";
url.searchParams.set("redirectTo", intended);
return NextResponse.redirect(url);
```

### 2. Preserve through the login form

The login page reads `redirectTo` and includes it in the auth request:

```tsx
const searchParams = useSearchParams();
const redirectTo = searchParams.get("redirectTo") ?? "/";

async function handleLogin(credentials: FormData) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ ...credentials, redirectTo }),
  });
  if (res.ok) {
    window.location.href = redirectTo;
  }
}
```

### 3. Server-side redirect (preferred)

When possible, redirect server-side after setting the session cookie to avoid cookie timing issues:

```tsx
// API route — after successful auth
const redirectTo = validateRedirectTo(body.redirectTo);
const response = NextResponse.redirect(new URL(redirectTo, request.url));
response.cookies.set(sessionCookieOptions(token, expiresAt));
return response;
```

## Security: Validate `redirectTo`

Never redirect to an arbitrary URL. Validate that `redirectTo` is a safe, relative path on the same origin.

```typescript
function validateRedirectTo(value: string | undefined | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (value.includes("://")) return "/";
  return value;
}
```

**Reject**: absolute URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`), anything containing `://`. **Default**: fall back to `/`.

## Rules

1. Every auth gate (middleware, API route, client-side check) must capture the current URL before redirecting to login.
2. The login page/component must read `redirectTo` from its URL and carry it through the entire auth flow.
3. After successful authentication, redirect to `redirectTo` (validated). Never drop it.
4. Prefer server-side redirects (`NextResponse.redirect`) over client-side (`router.push`) after setting cookies.
5. For inline login forms (e.g., sign-in shown on the same page), preserve the current URL + query params so the page state survives the auth round-trip.

## SSO / OAuth Flows

For OAuth or SAML SSO, the same principle applies:

1. Store `redirectTo` in the session or `state` parameter before redirecting to the identity provider.
2. The callback route reads it back after the IdP returns.
3. Final redirect lands the user on their intended page.

The OAuth `state` parameter is the standard way to carry `redirectTo` through an external IdP redirect — encode it there rather than relying on cookies or server-side session storage alone.

## Auto Pull Main

# Auto-Pull Main — Background LaunchAgent

A macOS LaunchAgent keeps the primary worktree's local `main` in sync with `origin/main` automatically. It runs on login and stays alive in the background.

## What It Does

Every 60 seconds, `~/.cursor/scripts/auto-pull-main.sh` fetches `origin/main` and fast-forward merges the primary worktree. Feature worktrees always branch from a current `main` without manual `git pull`.

## Locations

| File | Purpose |
|---|---|
| `~/.cursor/scripts/auto-pull-main.sh` | The polling script (stable location, not branch-dependent) |
| `~/Library/LaunchAgents/com.skills-hub.auto-pull-main.plist` | macOS LaunchAgent that starts it on login |
| `~/.cursor/logs/auto-pull-main.log` | stdout/stderr log |
| `scripts/auto-pull-main.sh` | Repo copy (canonical source — sync to `~/.cursor/scripts/` after changes) |

## Management

```bash
# Check status
launchctl list | grep auto-pull

# View recent log
tail -20 ~/.cursor/logs/auto-pull-main.log

# Stop
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.skills-hub.auto-pull-main.plist

# Start
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.skills-hub.auto-pull-main.plist

# Restart (after editing the script)
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.skills-hub.auto-pull-main.plist
cp scripts/auto-pull-main.sh ~/.cursor/scripts/auto-pull-main.sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.skills-hub.auto-pull-main.plist
```

## After Modifying the Script

If `scripts/auto-pull-main.sh` is updated on a branch and merged to main, re-copy it to the stable location:

```bash
cp /Users/jdetlefs001/one/skills-hub/scripts/auto-pull-main.sh ~/.cursor/scripts/auto-pull-main.sh
```

The LaunchAgent picks up the change on next restart (or immediately if you `bootout` + `bootstrap`).


## Biome A11y Patterns

> Accessibility patterns enforced by Biome — buttons, ARIA roles, labels, SVGs, semantic elements, keyboard interactions _globs: `**/*.tsx`_

# Biome A11y Patterns — Learned from 231 biome warnings

A codebase-wide biome audit found 113 files with accessibility violations that had accumulated as warnings. These patterns are now enforced by Biome and blocked by the pre-commit hook. This rule teaches the correct patterns so violations never reach the linter.

## The Rules

### 1. Every `<button>` needs an explicit `type`

Buttons without `type` default to `type="submit"`, which silently submits the nearest `<form>` ancestor. Always declare intent.

```tsx
// WRONG — defaults to type="submit", may trigger form submission
<button onClick={handleClick}>Cancel</button>

// RIGHT — explicit non-submit button
<button type="button" onClick={handleClick}>Cancel</button>

// RIGHT — explicit submit button
<button type="submit">Save</button>
```

**Biome rule**: `a11y/useButtonType`

### 2. ARIA props require a supporting role on generic elements

`aria-label`, `aria-describedby`, and other ARIA properties are only valid on elements that have an implicit or explicit ARIA role. A plain `<div>` has no implicit role — screen readers ignore the ARIA prop.

```tsx
// WRONG — aria-label on a plain div (no implicit role)
<div className="overflow-y-auto" aria-label="Chat messages">

// RIGHT — add role="region" so the label is announced
<div className="overflow-y-auto" role="region" aria-label="Chat messages">

// BETTER — use a semantic element that already has an implicit role
<section className="overflow-y-auto" aria-label="Chat messages">
```

**When to use which role:**

| Content | Element or role |
|---|---|
| Landmark section with a label | `<section aria-label="...">` or `<div role="region" aria-label="...">` |
| Navigation links | `<nav aria-label="...">` |
| List of items | `<ul>` / `<ol>` with `<li>` children |
| Log / live region | `<div role="log" aria-label="...">` |
| Alert | `<div role="alert">` |
| Search | `<search>` or `<div role="search">` |

**Biome rule**: `a11y/useAriaPropsSupportedByRole`

### 3. Use semantic HTML elements instead of ARIA roles on divs

If a semantic HTML element exists for the purpose, use it. ARIA roles are a fallback, not a first choice.

```tsx
// WRONG — div with role when a semantic element exists
<div role="navigation">...</div>
<div role="banner">...</div>
<div role="main">...</div>
<div role="complementary">...</div>

// RIGHT — semantic elements
<nav>...</nav>
<header>...</header>
<main>...</main>
<aside>...</aside>
```

| Role | Semantic element |
|---|---|
| `navigation` | `<nav>` |
| `banner` | `<header>` (when child of `<body>`) |
| `main` | `<main>` |
| `complementary` | `<aside>` |
| `contentinfo` | `<footer>` (when child of `<body>`) |
| `search` | `<search>` |
| `form` | `<form>` |
| `region` | `<section>` (with `aria-label`) |

**Biome rule**: `a11y/useSemanticElements`

### 4. Every `<label>` must be associated with a form control

A `<label>` that isn't connected to an input is invisible to screen readers and unusable via click-to-focus.

```tsx
// WRONG — label floats without a target
<label className="text-sm">Video URL</label>
<input type="url" value={url} onChange={...} />

// RIGHT — htmlFor + id association
<label htmlFor="video-url" className="text-sm">Video URL</label>
<input id="video-url" type="url" value={url} onChange={...} />

// ALSO RIGHT — nesting (no htmlFor needed)
<label className="text-sm">
  Video URL
  <input type="url" value={url} onChange={...} />
</label>
```

For groups of related inputs (e.g., radio buttons, checkboxes), use `<fieldset>` + `<legend>`:

```tsx
// WRONG — div with aria-label wrapping radios
<div aria-label="Select difficulty">
  <label><input type="radio" /> Easy</label>
  <label><input type="radio" /> Hard</label>
</div>

// RIGHT — fieldset + legend
<fieldset>
  <legend>Select difficulty</legend>
  <label><input type="radio" name="difficulty" value="easy" /> Easy</label>
  <label><input type="radio" name="difficulty" value="hard" /> Hard</label>
</fieldset>
```

**Biome rule**: `a11y/noLabelWithoutControl`

### 5. SVGs need `aria-hidden` or `<title>`

Decorative SVGs should be hidden from the accessibility tree. Meaningful SVGs need a text alternative.

```tsx
// WRONG — SVG exposed to screen readers with no description
<svg viewBox="0 0 24 24"><path d="..." /></svg>

// RIGHT — decorative icon (most common case)
<svg aria-hidden="true" viewBox="0 0 24 24"><path d="..." /></svg>

// RIGHT — meaningful icon (rare — only when the SVG IS the content)
<svg viewBox="0 0 24 24" role="img" aria-label="Warning">
  <title>Warning</title>
  <path d="..." />
</svg>
```

For lucide-react icons: most are decorative (adjacent to text). Pass `aria-hidden="true"` or rely on the wrapper element for labeling:

```tsx
// Decorative — icon + text label
<button type="button"><PlusIcon aria-hidden="true" /> Add skill</button>

// Icon-only button — label on the button, hide the icon
<button type="button" aria-label="Add skill"><PlusIcon aria-hidden="true" /></button>
```

**Biome rule**: `a11y/noSvgWithoutTitle`

### 6. No click handlers on static elements

`<div>` and `<span>` are not interactive — adding `onClick` without keyboard support excludes keyboard and screen reader users.

```tsx
// WRONG — div pretending to be a button
<div onClick={handleClick} className="cursor-pointer">Click me</div>

// RIGHT — use a button
<button type="button" onClick={handleClick}>Click me</button>

// RIGHT — if it navigates, use an anchor
<a href="/skills" onClick={handleNavigation}>View skills</a>

// ACCEPTABLE — when wrapping complex content where button/anchor styling is impractical
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(e); }}
>
  Complex card content
</div>
```

**Biome rule**: `a11y/noStaticElementInteractions`

## Quick Reference: Element Selection

When you're about to write JSX, choose the element based on what it DOES:

| Behavior | Element |
|---|---|
| Triggers an action | `<button type="button">` |
| Navigates to a URL | `<a href="...">` |
| Submits a form | `<button type="submit">` |
| Contains form inputs | `<form>` |
| Groups related inputs | `<fieldset>` + `<legend>` |
| Labels an input | `<label htmlFor="...">` |
| Sections content with a heading | `<section aria-label="...">` |
| Contains navigation links | `<nav aria-label="...">` |
| Displays a list | `<ul>` or `<ol>` + `<li>` |
| Dismisses an overlay (click-outside) | `<button>` with transparent overlay styling |
| Has no behavior | `<div>` or `<span>` (no onClick, no ARIA) |

## Origin

- **Failure**: 231 biome warnings accumulated across 113 files, including `useButtonType` (missing type on buttons), `useAriaPropsSupportedByRole` (aria-label on plain divs), `noLabelWithoutControl` (orphaned labels), `noSvgWithoutTitle` (unlabeled SVGs), `useSemanticElements` (divs with roles), `noStaticElementInteractions` (onClick on divs)
- **Date**: 2026-03-15
- **Root cause**: Agents and developers wrote JSX without considering which element or ARIA pattern Biome expects — accessibility rules were configured as warnings and ignored
- **PR**: cinema branch biome cleanup

## Detection Acceleration

- **Level**: Pre-commit (editor + CI)
  **What was added**: All rules listed here are enforced by Biome as warnings in `biome.json`. The `.husky/pre-commit` hook runs `bun run lint` which invokes `biome check .` — violations block the commit.
  **Diagnosis time before**: Warnings accumulated silently for weeks; only discovered during a manual audit
  **Diagnosis time after**: Blocked at commit time with the specific file, line, and violation name

## Biome Clean Gate

> Every agent session that produces code must end with a perfectly clean biome report — zero errors and zero warnings on all changed files _always-applied_

# Biome Clean Gate — No Shipping With Lint Violations

Before declaring any code-producing work complete — committing, pushing, opening a PR, or telling the user "done" — the agent **must** run `bunx biome check .` and verify the output shows **zero errors and zero warnings** on files touched in the session.

## The Rule

Every code-producing agent session ends with:

```bash
bunx biome check .
```

The session is not done until the output reads:

```
Checked N files in Xms. No fixes applied.
```

with **no errors and no warnings** listed. Any other output means there is work left to do.

## Workflow

1. **After every substantive edit**, run `bunx biome check --write <changed-files>` to auto-fix what Biome can.
2. **Before the final commit**, run `bunx biome check .` (full project) and verify clean output.
3. **If warnings remain** that Biome cannot auto-fix:
   - Fix them manually (see the fix table below and in `zero-warnings.mdc`)
   - If the warning is pre-existing and not introduced by this session, note it but do not block on it — the goal is to never **increase** the warning count
4. **If errors remain**, they must be fixed before committing. No exceptions.

## Pre-Existing Warnings

If `biome check .` reports warnings that existed before the agent's changes:

- Run `biome check` scoped to only the files the agent changed: `bunx biome check <file1> <file2> ...`
- If the scoped check is clean, the session passes
- If the scoped check has warnings, fix them — the agent introduced or failed to fix them

To determine if a warning is pre-existing, compare against `origin/main`:

```bash
git stash && bunx biome check . 2>&1 | tail -5 && git stash pop
```

## What "Clean" Means

| Output | Verdict |
|---|---|
| `Checked N files in Xms. No fixes applied.` (no errors/warnings above) | Clean — work is done |
| `Found 1 warning.` (pre-existing, not in changed files) | Acceptable — note it |
| `Found 1 warning.` (in a file the agent touched) | Not clean — fix it |
| `Found N errors.` | Not clean — fix all errors |
| `Found N errors. Found M warnings.` | Not clean — fix everything |

## Common Fixes

| Biome diagnostic | Fix |
|---|---|
| `noUnusedImports` | Remove the unused import |
| `useButtonType` | Add `type="button"` to non-submit buttons |
| `noArrayIndexKey` | Use a stable unique key |
| `noExplicitAny` | Replace `any` with a concrete type or `unknown` |
| `useFocusableInteractive` | Add `tabIndex` to interactive elements |
| `noSvgWithoutTitle` | Add `aria-hidden="true"` (decorative) or `<title>` (meaningful) |
| `useSemanticElements` | Use semantic HTML (`<nav>`, `<header>`, `<main>`) |

## What NOT to Do

- Do not push with `--no-verify` to skip lint — the pre-commit hook runs Biome, and bypassing it just defers the failure to CI
- Do not suppress warnings with `biome-ignore` unless the suppression is genuinely warranted and includes a reason
- Do not tell the user "done" when `biome check` has unfixed warnings in files you touched
- Do not run `biome check` only on changed files and skip the full project check — pre-existing issues in files you import from may surface

## Biome Hygiene And Import Safety

> Prevent recurring Biome and import-safety regressions _always-applied_

# Biome Hygiene and Import Safety

Apply these rules to all JS/TS work, especially in `apps/command-center/modules/web`.

## Required Workflow

- Before finishing a JS/TS change, run:
  - `bunx biome check --write .` in the touched package
  - then `bun run lint` from that package
- Never leave "would have printed" formatter diffs unresolved.
- Never leave "organize imports" diagnostics unresolved.

## Import Rules

- Always use `node:` protocol for Node.js builtins (for example `node:path`, `node:fs`).
- Keep imports sorted according to Biome's organize-imports output.

## Safety Rules

- Avoid non-null assertions (`!`) in DOM bootstrapping and runtime critical paths.
- For React root mounting, guard `document.getElementById(...)` and throw a clear error if absent.

## Enforcement

- If Biome reports any error, warning, or info in changed files, the change is not done.
- Prefer fixing issues with code changes rather than suppressing diagnostics.

## Biome Output Directory Exclusion

> When adding tools that generate output directories, exclude them from Biome — not just .gitignore _globs: `**/biome.json`_

# Biome Output Exclusion — Learned from .unlighthouse flooding lint with 901 errors

Adding `@unlighthouse/cli` generated HTML reports into `.unlighthouse/`. The directory was gitignored but Biome scanned it anyway, producing 901 lint errors and 24,275 warnings that blocked all commits via the pre-commit hook. Biome does not respect `.gitignore` — it has its own file exclusion system in `biome.json`.

## The Rule

When adding any tool that generates output files (test reports, coverage, build artifacts, scan results), exclude its output directory in **both** `.gitignore` **and** `biome.json`. Neither is sufficient alone.

### Where to exclude

| File | Syntax | Purpose |
|---|---|---|
| `.gitignore` | `.unlighthouse/` | Prevents committing generated files |
| `biome.json` → `files.includes` | `"!!.unlighthouse"` | Prevents Biome from scanning the directory |

The `!!` prefix in Biome's `files.includes` array means "exclude this path." It is a negation pattern — the rest of the array is implicitly `**` (include everything), so `!!` entries carve out exclusions.

### Checklist when adding a new tool

1. Does the tool create an output directory? (e.g., `.unlighthouse/`, `coverage/`, `.nyc_output/`, `playwright-report/`)
2. Add the directory to `.gitignore`
3. Add `"!!<dirname>"` to the `files.includes` array in `biome.json`
4. Run `bun run lint` to verify the file count is unchanged (compare against `main`)

### Currently excluded in biome.json

```json
{
  "files": {
    "includes": [
      "**",
      "!!.next",
      "!!out",
      "!!build",
      "!!playwright-report",
      "!!test-results",
      "!!coverage",
      "!!screenshots",
      "!!e2e/.auth-state.json",
      "!!external-skills",
      "!!tools/notify-agent/target",
      "!!tools/teams-notify/target",
      "!!tools/ado-reparent/target",
      "!!tools/boss-deliberate/target",
      "!!tools/dns-registrar/target",
      "!!agent-os/target",
      "!!agent-os/src",
      "!!SkillsHubSetup/.build",
      "!!SkillsHubSetup/.swiftpm",
      "!!apps/l1-triage/build",
      "!!apps/setup/.build",
      "!!apps/setup/.swiftpm",
      "!!.unlighthouse"
    ]
  }
}
```

### Why `.gitignore` isn't enough

Biome is a standalone linter — it resolves its own file list using the `files` configuration in `biome.json`, not git's tracking rules. A directory can be:

| In `.gitignore`? | In `biome.json` excludes? | Result |
|---|---|---|
| Yes | Yes | Correct — not committed, not linted |
| Yes | No | **Problem** — not committed but linted, blocks commits |
| No | Yes | Not linted but committed — usually wrong (generated files shouldn't be committed) |
| No | No | Committed and linted — correct for source code |

## Examples

### Wrong (caused the failure)

```
# .gitignore — has the exclusion
.unlighthouse/

# biome.json — missing the exclusion
{
  "files": {
    "includes": ["**", "!!.next", "!!coverage"]
  }
}
```

Biome scans `.unlighthouse/reports/*.html`, finds 901 errors in generated Lighthouse HTML reports, and the pre-commit hook rejects the commit.

### Right (prevents recurrence)

```
# .gitignore
.unlighthouse/

# biome.json
{
  "files": {
    "includes": ["**", "!!.next", "!!coverage", "!!.unlighthouse"]
  }
}
```

## Detection

After adding a new tool, run:

```bash
bun run lint 2>&1 | tail -3
```

Compare the "Checked N files" count against main. If the count jumped significantly, the tool's output directory is being scanned.

## Origin

- **Failure**: Adding `@unlighthouse/cli` generated `.unlighthouse/reports/` with HTML files. Biome scanned them, found 901 errors, and blocked all commits via the pre-commit hook. The directory was in `.gitignore` but not in `biome.json`.
- **Date**: 2026-03-16
- **Root cause**: Biome does not respect `.gitignore` — it uses its own `files.includes` exclusion list in `biome.json`
- **PR**: feat/quality-audit-tests (#211)

## Biome React Patterns

> React patterns enforced by Biome — stable keys, no dangerouslySetInnerHTML, no forEach return values _globs: `**/*.tsx`_

# Biome React Patterns — Learned from 231 biome warnings

A codebase-wide biome audit found React-specific anti-patterns that had accumulated as warnings: array indices used as keys causing reconciliation bugs, `dangerouslySetInnerHTML` bypassing XSS protection, and `.forEach()` callbacks accidentally returning values. This rule teaches the correct patterns.

## The Rules

### 1. Never use array indices as React keys

Array indices as keys cause React to reuse DOM nodes incorrectly when items are reordered, inserted, or deleted. State gets attached to the wrong items, animations break, and inputs lose their values.

```tsx
// WRONG — index key breaks on reorder/insert/delete
{items.map((item, i) => (
  <li key={i}>{item.name}</li>
))}

// RIGHT — stable unique identifier from the data
{items.map((item) => (
  <li key={item.id}>{item.name}</li>
))}

// RIGHT — slug or other natural key
{skills.map((skill) => (
  <SkillCard key={skill.slug} skill={skill} />
))}
```

**Finding a stable key:**

| Data source | Key to use |
|---|---|
| Database row | `id` (primary key) |
| Slug-based entity | `slug` |
| API response item | `id`, `uri`, or `href` |
| Enum/constant array | The enum value itself (`key={category}`) |
| User-entered list | Generate a stable ID on creation (`crypto.randomUUID()`) |
| Static content | A descriptive string literal (`key="intro-section"`) |

**When index keys are acceptable** (all three conditions must be true):
1. The list is static — items are never reordered, inserted, or deleted
2. Items have no internal state or controlled inputs
3. No stable ID exists in the data

Even then, prefer generating a stable key at data creation time.

**Biome rule**: `suspicious/noArrayIndexKey`

### 2. Never use `dangerouslySetInnerHTML`

`dangerouslySetInnerHTML` bypasses React's XSS protection. Raw HTML from any source — database, API, user input, markdown renderer — can contain `<script>`, `onclick`, or other attack vectors.

```tsx
// WRONG — XSS vector
<div dangerouslySetInnerHTML={{ __html: userContent }} />
<div dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />

// RIGHT — use React components to render structured content
<ReactMarkdown>{content}</ReactMarkdown>

// RIGHT — for simple HTML-like content, parse and render as React elements
{paragraphs.map((p) => (
  <p key={p.id}>{p.text}</p>
))}

// RIGHT — if raw HTML is truly unavoidable (e.g., CMS output), sanitize first
import DOMPurify from "dompurify";
const clean = DOMPurify.sanitize(rawHtml);
<div dangerouslySetInnerHTML={{ __html: clean }} />
```

**When `dangerouslySetInnerHTML` is genuinely needed**, add a biome-ignore comment with a justification:

```tsx
{/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized CMS output */}
<div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
```

The comment must explain WHY it's safe, not just acknowledge the warning.

**Biome rule**: `security/noDangerouslySetInnerHtml`

### 3. Don't return values from `.forEach()` callbacks

`.forEach()` ignores return values. If you're returning something, you probably want `.map()`, `.filter()`, or `.some()`.

```tsx
// WRONG — return value is silently discarded
items.forEach((item) => {
  if (item.active) return <li key={item.id}>{item.name}</li>;
});

// RIGHT — use .map() when building a new array
const elements = items.map((item) => (
  <li key={item.id}>{item.name}</li>
));

// WRONG — early return in forEach (doesn't break the loop)
items.forEach((item) => {
  if (item.id === targetId) return item;
});

// RIGHT — use .find() for searching
const target = items.find((item) => item.id === targetId);

// WRONG — filtering inside forEach
const results: Item[] = [];
items.forEach((item) => {
  if (item.active) results.push(item);
});

// RIGHT — use .filter()
const results = items.filter((item) => item.active);
```

**Choosing the right iteration method:**

| Intent | Method |
|---|---|
| Transform each item → new array | `.map()` |
| Keep items matching a condition | `.filter()` |
| Find the first match | `.find()` |
| Check if any/all match | `.some()` / `.every()` |
| Reduce to a single value | `for...of` loop (see typescript-style rule) |
| Side effects only (DOM mutation, logging) | `.forEach()` — but no return value |

**Biome rule**: `suspicious/useIterableCallbackReturn`

## Self-Check Before Committing React Components

1. Search for `key={i}` or `key={index}` — replace with a stable identifier from the data
2. Search for `dangerouslySetInnerHTML` — replace with React components or add sanitization + biome-ignore comment
3. Search for `.forEach(` followed by `return` — switch to `.map()`, `.filter()`, or `.find()`
4. Verify every list renders items with a key derived from the item's identity, not its position

## Origin

- **Failure**: 231 biome warnings accumulated across 113 files, including `noArrayIndexKey` (index keys on dynamic lists), `noDangerouslySetInnerHtml` (raw HTML injection), `useIterableCallbackReturn` (forEach with return values)
- **Date**: 2026-03-15
- **Root cause**: Agents used convenience patterns (index keys, forEach with returns) that work superficially but cause subtle bugs — warnings were configured but not enforced
- **PR**: cinema branch biome cleanup

## Detection Acceleration

- **Level**: Pre-commit (editor + CI)
  **What was added**: All rules listed here are enforced by Biome as warnings in `biome.json`. The `.husky/pre-commit` hook runs `bun run lint` which invokes `biome check .` — violations block the commit.
  **Diagnosis time before**: Warnings accumulated silently; only caught during manual audit
  **Diagnosis time after**: Blocked at commit time with specific file, line, and rule name

## Biome TypeScript Safety

> TypeScript safety patterns enforced by Biome — no non-null assertions, no explicit any, no implicit any let, no assignment in expressions, Node.js import protocol _globs: `**/*.{ts,tsx}`_

# Biome TypeScript Safety — Learned from 231 biome warnings

A codebase-wide biome audit found widespread TypeScript safety violations configured as warnings: non-null assertions masking null checks, `any` types erasing type safety, untyped `let` declarations, and Node.js imports missing the `node:` protocol. This rule teaches the correct patterns so they are written right the first time.

## The Rules

### 1. Never use the `!` non-null assertion operator

The `!` operator tells TypeScript "trust me, this isn't null" — but TypeScript already has narrowing. If you need `!`, you haven't narrowed properly.

```typescript
// WRONG — masks a potential null at runtime
const name = user!.name;
const el = document.getElementById("app")!;
process.env.DATABASE_URL!;

// RIGHT — optional chaining (when null is acceptable)
const name = user?.name;

// RIGHT — explicit null check (when null is an error)
const el = document.getElementById("app");
if (!el) throw new Error("Missing #app element");
el.textContent = "loaded";

// RIGHT — default value
const dbUrl = process.env.DATABASE_URL ?? "";

// RIGHT — early return
function getUser(id: string) {
  const user = users.get(id);
  if (!user) return null;
  return user.name;
}
```

**When refactoring existing `!` usage:**

| Pattern | Replacement |
|---|---|
| `obj!.prop` | `obj?.prop` or `if (!obj) return/throw` |
| `array[i]!` | `const item = array[i]; if (!item) ...` |
| `process.env.VAR!` | `const v = process.env.VAR; if (!v) throw ...` or `?? fallback` |
| `ref.current!` | `if (!ref.current) return;` then use `ref.current` |
| `map.get(key)!` | `const v = map.get(key); if (!v) throw ...` |

**Biome rule**: `style/noNonNullAssertion`

### 2. Never use `any` — use `unknown` or a concrete type

`any` silently disables all type checking for the value and everything it touches. It propagates: `any` assigned to a typed variable makes that variable `any` too.

```typescript
// WRONG — any spreads and disables safety
function parse(data: any) { return data.items; }
const result: any = fetch("/api");
} catch (err: any) {

// RIGHT — unknown forces narrowing before use
function parse(data: unknown) {
  if (!isItemsResponse(data)) throw new Error("Invalid response");
  return data.items;
}

// RIGHT — concrete type
interface ApiResponse { items: Item[]; total: number; }
const result: ApiResponse = await fetch("/api").then(r => r.json());

// RIGHT — for catch blocks, narrow the error
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
}

// RIGHT — for library callbacks with opaque params, use Parameters<>
type ResolveParams = Parameters<typeof originalResolve>;
```

**Common `any` replacements:**

| `any` usage | Replacement |
|---|---|
| Catch clause `catch (e: any)` | `catch (e: unknown)` + narrowing |
| JSON parse result | Define an interface, validate with Zod |
| Event handler `(e: any)` | `React.MouseEvent`, `React.ChangeEvent<HTMLInputElement>`, etc. |
| Library callback params | `Parameters<typeof fn>[N]` or the library's exported types |
| Generic utility | `<T>` type parameter |
| Dynamic object | `Record<string, unknown>` |

**Biome rule**: `suspicious/noExplicitAny`

### 3. Always annotate `let` declarations

A bare `let x;` gets type `any` implicitly. Always provide an initial value or a type annotation.

```typescript
// WRONG — implicit any
let result;
let count;

// RIGHT — type annotation
let result: string | undefined;
let count: number = 0;

// RIGHT — initialized (TypeScript infers the type)
let result = "";
let count = 0;

// RIGHT — when the value comes later but the type is known
let connection: pg.PoolClient | undefined;
try {
  connection = await pool.connect();
  // ...
} finally {
  connection?.release();
}
```

**Biome rule**: `suspicious/noImplicitAnyLet`

### 4. No assignments inside expressions

Assignments inside `while`, `if`, or `for` conditions are error-prone — they look like equality checks (`==`) and hide side effects.

```typescript
// WRONG — assignment in while condition
let match;
while ((match = pattern.exec(text)) !== null) {
  process(match);
}

// RIGHT — assign before the loop, update at the end
let match = pattern.exec(text);
while (match !== null) {
  process(match);
  match = pattern.exec(text);
}

// RIGHT — for-of with matchAll (preferred for regex iteration)
for (const match of text.matchAll(pattern)) {
  process(match);
}

// WRONG — assignment in if condition
let result;
if ((result = compute()) !== null) { ... }

// RIGHT — assign, then check
const result = compute();
if (result !== null) { ... }
```

**Biome rule**: `suspicious/noAssignInExpressions`

### 5. Use the `node:` protocol for Node.js built-in imports

The `node:` prefix disambiguates Node.js built-ins from npm packages with the same name and makes the import's origin explicit.

```typescript
// WRONG — ambiguous, could be an npm package
import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import Module from "module";

// RIGHT — explicit Node.js built-in
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Module from "node:module";
```

This applies to all Node.js built-in modules: `fs`, `path`, `crypto`, `os`, `http`, `https`, `url`, `util`, `stream`, `events`, `buffer`, `child_process`, `module`, `net`, `dns`, `tls`, `zlib`, `assert`, `querystring`, `string_decoder`, `timers`, `worker_threads`, `perf_hooks`, `async_hooks`.

**Biome rule**: `style/useNodejsImportProtocol`

### 6. No control characters in regex

Control characters (`\x00`–`\x1f`) in regex patterns are almost always typos. They match invisible characters that rarely appear in real data.

```typescript
// WRONG — likely a typo (matches ASCII control char SOH)
const pattern = /\x01/;

// RIGHT — if you genuinely need to match control chars, use Unicode escapes and comment why
const pattern = /\u0001/; // Match SOH delimiter in legacy binary protocol
```

**Biome rule**: `suspicious/noControlCharactersInRegex`

## Self-Check Before Committing TypeScript

1. Search for `!.` and `!;` — every non-null assertion needs justification or replacement
2. Search for `: any` and `as any` — replace with concrete types or `unknown`
3. Search for `let ` without `=` or `:` — add a type annotation or initial value
4. Search for `import ... from "fs"` (etc.) without `node:` prefix — add the prefix
5. Check `while (` and `if (` for `=` that should be `===`

## Origin

- **Failure**: 231 biome warnings accumulated across 113 files, including `noNonNullAssertion` (masking null checks), `noExplicitAny` (erasing type safety), `noImplicitAnyLet` (untyped lets), `noAssignInExpressions` (assignments in conditions), `useNodejsImportProtocol` (missing node: prefix), `noControlCharactersInRegex` (suspicious regex patterns)
- **Date**: 2026-03-15
- **Root cause**: Agents wrote TypeScript using shortcut patterns (`!`, `any`, bare `let`) instead of the safer alternatives — warnings were configured but not enforced
- **PR**: cinema branch biome cleanup

## Detection Acceleration

- **Level**: Pre-commit (editor + CI)
  **What was added**: All rules listed here are enforced by Biome as warnings in `biome.json`. The `.husky/pre-commit` hook runs `bun run lint` which invokes `biome check .` — violations block the commit.
  **Diagnosis time before**: Warnings accumulated silently; only caught during manual audit
  **Diagnosis time after**: Blocked at commit time with specific file, line, and rule name

## Blog Design System

> Apply wabi-sabi mid-century editorial design system to homepage and all blog post pages _always-applied_

# Blog Design System

Use this visual direction for all edits to `index.html` and `posts/*.html`:

- Aesthetic: wabi-sabi + mid-century modern.
- Inspiration baseline: New York Times editorial rhythm + Apple clarity and restraint.
- Tone: calm, warm, imperfect-on-purpose, content-first.

## Required Style System

- Shared stylesheet source of truth: `posts/blog.css`.
- Pages must link the shared stylesheet with:
  - `<link rel="stylesheet" href="/posts/blog.css">`
- Reuse existing CSS primitives instead of creating one-off inline styles:
  - `.site-shell`, `.frame`, `.article`, `.eyebrow`, `.page-title`, `.byline`, `.article-content`, `.nav-row`

## Required Structure For Posts

For every `posts/<id>.html`:

1. Use semantic sections:
   - `main.site-shell`
   - `div.frame.article`
   - `header.list-header`
   - `article.article-content`
   - `nav.nav-row`
2. Include navigation links to:
   - `/posts`
   - `/`
3. Keep copy readable:
   - body text line length near editorial width
   - generous whitespace and clear hierarchy

## Homepage Rules

- `index.html` should use the same stylesheet and primitives.
- Keep hierarchy clear: masthead -> leading statement -> concise context -> supporting panel.
- Prefer muted, earthy palette and subtle texture over bright gradients or glassy effects.

## Do Not

- Do not add inline `<style>` blocks for blog/page styling unless fixing an urgent issue.
- Do not switch to saturated neon palettes or heavy animation.
- Do not break route assumptions (`/`, `/posts`, `/posts/:id`).

## Blog Voice

> Writing voice and anti-AI-slop guidelines for blog posts _always-applied_

# Blog Writing Voice

When writing or editing blog post content, match John's natural voice and avoid common AI writing tells.

## Voice characteristics

- Casual, direct, conversational. Use contractions freely.
- Blunt when appropriate ("corporate bullshit", "getting shit done").
- Self-deprecating asides and admissions of confusion or laziness.
- Technical specifics dropped casually without over-explaining.
- Sentences vary wildly in length. Long run-on sentences mixed with short punchy ones.
- Parenthetical asides, not em dashes. Avoid excessive em dash usage.
- Imperfect structure. Not every section transitions smoothly. Paragraph lengths vary.
- Personal tangents and real anecdotes over abstract claims.

## AI patterns to avoid

### Banned phrases

- "The uncomfortable truth"
- "It's important to note that"
- "In today's fast-paced world"
- "In the realm of"
- "At the end of the day"
- "Hopefully this [post/article] makes that [clearer/more concrete]"
- "commodity analytics tooling" or similar overwrought noun phrases
- "delve", "leverage" (as verb), "tapestry", "landscape", "robust", "comprehensive", "nuanced", "paradigm", "synergy", "holistic"

### Banned structural patterns

- "It's not X — it's Y" or "The problem isn't X. The problem is Y." (the #1 AI tell)
- "Not X. Not Y. Just Z." dramatic countdown
- Bold-keyword formatted lists (`**Term.** Description.`) — use flowing prose instead
- Perfectly smooth transitions between every section
- Textbook five-act escalation structure
- Uniform paragraph lengths
- Grand sweeping declarative statements ("The web was not built with privacy as a default")
- Clean AI-style sign-off closers

### Prefer instead

- Start with a personal anecdote or specific detail, not a thesis statement
- Let sections feel slightly rough around the edges
- End with something direct and personal, not a polished summary
- Use "like a normal person" not "like a human"
- Name specific tools and costs instead of abstract descriptions
- Mix question-and-answer into prose naturally rather than using rhetorical question lists

## Branch Scope Alignment

> Do not push work to a branch whose name doesn't match the work scope; create a separate worktree instead. _always-applied_

# Branch Scope Alignment

**Rule: Never push work that is irrelevant to the branch name.**

If the work you're about to commit/push does not match the current branch name (e.g., analytics backend work on `feat/e2e-smoke-test`), do **not** push it to that branch. Create a separate worktree with a branch name that reflects the work.

## Workflow

1. **Check scope before staging.** Does the work match the branch? `feat/e2e-smoke-test` implies E2E/smoke test work. Analytics, deployment scripts, and unrelated features do not belong there.

2. **If scope mismatches**, create a dedicated worktree and branch:
   ```bash
   git fetch origin main
   git worktree add -b feat/<scope-matched-name> ../rust-blog-wt/<short-name> origin/main
   cd ../rust-blog-wt/<short-name>
   # Copy or apply changes, then commit and push from here
   ```

3. **Push only to branches whose names align with the work.** Examples:
   - Analytics backend + setup script → `feat/analytics-backend`
   - Azure deployment → `feat/azure-deploy` or combined with above
   - E2E smoke tests → `feat/e2e-smoke-test`

## Why

- Keeps PRs and branches logically scoped; reviewers and history stay coherent.
- Avoids mixed-concern branches (e2e tests + analytics + deployment) that are hard to review and revert.
- Matches the convention: branch name describes what the branch contains.

## Build Queue

# Build & Test Queue

When working in a worktree (not the primary checkout on `main`), use queue-aware `q:*` scripts for all heavy operations. These scripts check system resource pressure via crib and OS metrics, and only queue operations when resources are strained.

## When to Use

Use `q:*` variants for these operations in worktrees:

| Instead of | Use |
|---|---|
| `bun test` | `bun run q:test` or `make q-test` |
| `bun run build` | `bun run q:build` or `make q-build` |
| `bun run db:seed` | `bun run q:seed` or `make q-seed` |
| `bun run db:reset` | `bun run q:reset` |
| `bun run test:e2e` | `bun run q:e2e` or `make q-e2e` |
| `bun run dev` | `bun run q:dev` or `make q-dev` |

In the primary worktree on `main`, bare commands are fine — there's only one primary.

## How It Works

1. The `run-queued.ts` wrapper reads `~/.crib/state.json` (written by the crib daemon) plus `os.loadavg()` and `os.freemem()` to classify system pressure as `clear`, `strained`, or `critical`.
2. If `clear`, the command runs immediately with near-zero overhead.
3. If `strained` or `critical`, the command enters a file-based queue (`~/.crib/queue/`) and waits for a slot. Higher-priority operations (tests) run before lower-priority ones (dev servers).
4. Write-heavy DB operations (`db:seed`, `db:reset`) also acquire a per-DB advisory lock to prevent concurrent seeding of the same database.

## Checking Resource Pressure

Run `bun run q:probe` or `make q-probe` to see the current verdict without running any operation.

## When NOT to Use

- `bun run lint` — lightweight, no queuing needed
- `bun run start` — production start, not a dev operation
- Reading/editing files — not a heavy operation
- Any operation in the primary worktree on `main`

## Priority Order

When queued, operations drain in this order:

1. Unit tests (fastest feedback)
2. Database seed/reset (prerequisite for tests)
3. Build (prerequisite for e2e)
4. E2E / Playwright tests (heavy, long-running)
5. Dev server startup (can wait longest)


## Bun Mock Module

> Prevent bun:test mock.module cross-contamination across test files _globs: `tests/**/*.test.ts, tests/**/*.test.tsx`_

# bun:test mock.module — Cross-File Contamination

`mock.module()` in bun:test is **process-global**. Once a module is mocked in one test file, every subsequent file in the same bun process sees the mocked version — not the real one. Test file execution order is non-deterministic and differs between macOS and Linux CI.

## The Rule

**Never `mock.module()` a module that another test file imports as the system under test.**

If `foo.test.tsx` imports and tests `Foo`, no other test file may call `mock.module("@/components/Foo", ...)`. Doing so turns `foo.test.tsx` into a test of the mock stub — which passes or fails depending on execution order.

### Safe

```typescript
// header.test.tsx — tests the Header, needs to mock its CHILDREN
mock.module("next/navigation", () => ({ usePathname: () => "/" }));
mock.module("@/components/layout/AuthProvider", () => ({ useAuth: () => ({...}) }));
// ↑ Safe: next/navigation and AuthProvider are infrastructure — no test file
//   imports usePathname or useAuth as the thing being tested.
```

### Unsafe (caused CI failure 2026-03-12)

```typescript
// governance-nav.test.tsx — tests Header, mocks ThemeToggle as a stub
mock.module("@/components/layout/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));
// ↑ Breaks theme-toggle.test.tsx — when it runs AFTER this file,
//   it imports the stub instead of the real ThemeToggle.
```

## What to Do Instead

1. **Don't mock leaf components.** If ThemeToggle and UserMenu render fine in happy-dom (they do — localStorage, useEffect, and DOM APIs all work), let them render for real. Your test assertions target specific elements anyway.

2. **Only mock infrastructure modules** that no test file tests directly:
   - `next/navigation` (useRouter, useSearchParams, usePathname)
   - `next/link`
   - `@/components/layout/AuthProvider` (useAuth)
   - `server-only`
   - `framer-motion` (when animations interfere with assertions)

3. **If you must mock a component**, check first: does any `*.test.tsx` file import it? Search with:
   ```bash
   rg "from.*@/components/layout/ThemeToggle" tests/
   ```
   If another test imports it as the subject, you cannot mock it.

4. **For complex parents with many children**, prefer rendering the real children. If a child causes genuine test problems (network calls, heavy side effects), mock the child's *dependencies* instead of the child itself.

## Why This Is Order-Dependent

bun test runs files in a single process. The execution order varies by OS, filesystem, and bun version. A test suite that passes on macOS but fails on Ubuntu CI is the signature symptom of mock.module contamination.

## Diagnosis Checklist

When a DOM test fails in CI but passes locally:

1. Check the error — does the rendered HTML contain `data-testid` or stub content that doesn't exist in the real component?
2. Search for `mock.module("@/path/to/failing/component"` across all test files
3. If found, the mock is contaminating the failing test
4. Fix: remove the mock and let the real component render, or mock the component's dependencies instead

## Origin

- **Failure**: `ThemeToggle` tests passed locally (macOS) but failed in CI (Ubuntu) — all 5 tests got a `<div data-testid="theme-toggle" />` stub instead of the real `<button>`
- **Root cause**: `governance-nav.test.tsx` called `mock.module("@/components/layout/ThemeToggle", ...)` which leaked into `theme-toggle.test.tsx` when CI ran files in alphabetical order
- **Date**: 2026-03-12
- **PR**: test/dom-coverage

## Bun Test Ci Safety

> Prevent bun test hangs in CI and local pre-push hooks _always-applied_

# Bun Test CI Safety — Learned from coverage deadlock + macOS file-count hang

Two distinct Bun test runner bugs caused the CI `lint-build-test` job to hang indefinitely: (1) `bun test --coverage` never exits when coverage instrumentation interacts with tests that spawn background processes, and (2) `bun test` on macOS deadlocks when invoked with >= 7 test files (all tests pass but the process never exits).

## The Rules

### 1. Always use `scripts/test-ci.sh` to run tests

Never invoke `bun test` with a bare directory glob in CI or pre-push hooks. Use `scripts/test-ci.sh`, which handles platform detection, core-aware parallelism, batching, and timeouts automatically.

```yaml
# ci.yml
- name: Unit tests (lib)
  run: bash scripts/test-ci.sh
  timeout-minutes: 2
```

```json
// package.json
"test:ci": "bash scripts/test-ci.sh"
```

### 2. Never run `bun test --coverage` against tests that spawn background processes

Tests that call `Bun.spawn()`, `child_process.exec()`, or launch background shell scripts prevent the coverage instrumentation from completing. The LCOV reporter waits for all spawned processes to exit, but orphaned background processes (e.g., PR pollers, watchers) never do.

**Always scope coverage to test files you control:**

```bash
# WRONG — includes notification tests that spawn background shell scripts
bun test --coverage src

# RIGHT — explicit paths, skip directories with spawned processes
bun test --coverage src/__tests__/*.test.ts src/__tests__/adversarial/
```

And exclude the offending source files from coverage in `bunfig.toml`:

```toml
coveragePathIgnorePatterns = [
  "**/learn/intern-quest/_data/**",
  "**/learn/intern-quest/_components/**",
]
```

### 3. Always set step-level timeouts on CI test steps

```yaml
- name: Run unit tests
  run: bash scripts/test-ci.sh
  timeout-minutes: 2
```

If `bun test` hangs, the step is killed after 2 minutes instead of consuming the full job timeout (default 360 minutes on GitHub Actions).

### 4. On macOS, batch test files in groups of <= 5

`bun test` on macOS (as of v1.3.x) deadlocks when invoked with 7+ test files. All tests pass and results are printed, but the process never exits. This does **not** happen on Linux.

`scripts/test-ci.sh` handles this automatically: it detects macOS (no `timeout` command available) and batches files in groups of 5.

### 5. On Linux, split files across parallel processes by core count

`bun test` runs all files in a single process sequentially. To use multiple cores, `test-ci.sh` splits files round-robin across `$(nproc)` parallel `bun test` processes, each wrapped in `timeout`.

```bash
# What test-ci.sh does on Linux with 4 cores and 7 test files:
timeout 60 bun test --bail=1 file1.test.ts file5.test.ts &   # core 0
timeout 60 bun test --bail=1 file2.test.ts file6.test.ts &   # core 1
timeout 60 bun test --bail=1 file3.test.ts file7.test.ts &   # core 2
timeout 60 bun test --bail=1 file4.test.ts &                 # core 3
wait  # collect exit codes
```

### 6. Timeout at every level (defense in depth)

| Level | Mechanism | Default |
|---|---|---|
| Per-test | `timeout = 10000` in `bunfig.toml` | 10s |
| Per-process | `timeout 60 bun test ...` in `test-ci.sh` | 60s |
| Per-CI-step | `timeout-minutes: 2` in workflow YAML | 2min |
| Per-CI-job | `timeout-minutes: 10` on the job | 10min |

If any level times out, the next level up catches it. A deadlocked `bun test` process is killed by the 60s `timeout` wrapper; if the wrapper itself hangs, the 2-minute step timeout kills it; if the step somehow survives, the 10-minute job timeout is the final safety net.

### 7. Skip local coverage on macOS

Coverage + many files + macOS = guaranteed hang. Generate coverage only in CI (Linux) where neither bug manifests.

### 8. Tests that spawn processes must clean up in afterEach

Any test that calls `Bun.spawn()` or creates child processes must kill them in `afterEach`:

```typescript
const spawned: Subprocess[] = [];

afterEach(() => {
  for (const proc of spawned) {
    proc.kill();
  }
  spawned.length = 0;
});

// In test:
const proc = Bun.spawn(["bash", "script.sh"]);
spawned.push(proc);
```

## Bun Concurrency Model

Bun's `--concurrent` flag runs async tests concurrently **within a single process** (event loop interleaving). It does NOT spawn worker threads or processes. For true multi-core parallelism, you must launch multiple `bun test` processes externally — which is what `test-ci.sh` does.

| Mechanism | Scope | Multi-core? | When to use |
|---|---|---|---|
| `--concurrent` | Intra-file async interleaving | No | I/O-bound async tests |
| `--max-concurrency N` | Caps concurrent tests (default 20) | No | Prevent resource exhaustion |
| `test-ci.sh` multi-process | File-level parallelism | Yes | CI with 4+ cores |
| `test.serial()` | Force sequential under `--concurrent` | N/A | Tests with shared mutable state |

## Examples

### Wrong (caused the CI hang)

```bash
# test-ci.sh — runs ALL tests under src/ including notification tests
bun test --grep-invert 'LocalStack' src &
# Then runs coverage against everything
bun test --coverage src
```

### Right (prevents recurrence)

```yaml
# ci.yml — uses the parallel runner with timeout at every level
- name: Unit tests (lib)
  run: bash scripts/test-ci.sh
  timeout-minutes: 2
```

```bash
# test-ci.sh — core-aware, platform-aware, timeout-wrapped
CORES=$(nproc 2>/dev/null || sysctl -n hw.logicalcpu 2>/dev/null || echo 2)
# Linux: split round-robin across $CORES processes
# macOS: batch in groups of 5
```

## Origin

- **Failure**: CI `lint-build-test` job cancelled after 9+ minutes — `bun test --coverage` hung after all tests passed
- **Secondary failure**: Pre-push hook hung indefinitely on macOS — `bun test` with 21 files deadlocked
- **Date**: 2026-03-13
- **Root cause**: (1) Notification tests spawn background shell processes via `Bun.spawn()` that prevent coverage instrumentation from completing. (2) Bun v1.3.x on macOS deadlocks when processing >= 7 test files in a single invocation.
- **PR**: feat/intern-quest-game

## Detection Acceleration

- **Level**: CI
  **What was added**: `timeout-minutes: 2` on the test step in `ci.yml`, plus `timeout-minutes: 10` on the job. Previously the step ran until the job's default timeout (360 min), wasting CI minutes and blocking the PR.
  **Diagnosis time before**: 9+ minutes of CI runtime before manual cancellation
  **Diagnosis time after**: 2 minutes max, with clear "timeout" signal in CI logs

- **Level**: Pre-commit / Pre-push
  **What was added**: Platform-aware batching and multi-process parallelism in `scripts/test-ci.sh`. macOS batches files in groups of 5; Linux splits across cores with `timeout 60` per process.
  **Diagnosis time before**: Pre-push hook hung indefinitely, requiring manual `kill -9`
  **Diagnosis time after**: Completes in ~1s on Linux (parallel), ~5.5s on macOS (batched), 60s max per process

- **Level**: Config
  **What was added**: `bunfig.toml` with `timeout = 10000` (10s per-test timeout). Previously tests had no per-test timeout, so a single hung test would block forever.
  **Diagnosis time before**: Single hung test blocks the entire suite indefinitely
  **Diagnosis time after**: Hung test fails after 10s with a clear timeout error

## Card Link Display

> Prevent card Link elements from using inline display _globs: `["src/**/*.tsx"]`_

# Card Link Display — Block-Level Links in Grid/Flex Layouts

Next.js `<Link>` renders an `<a>` element, which defaults to `display: inline`. When a Link is styled as a card (with `bg-card`, `border`, `rounded-*`, `p-*`), the inline display causes the background and border to NOT fill the full grid cell. This produces partially-covered content — the background wraps the inline content box instead of filling the container.

## The Rule

Every `<Link>` that functions as a card — meaning it has a background color, border, padding, and multi-line content — MUST include an explicit display class:

- `flex` (preferred for cards with vertically stacked content)
- `block` (for simple cases)
- `grid` (for complex layouts)

### Correct

```tsx
<Link href="/skills" className="flex h-full flex-col rounded-xl border border-border bg-card p-5">
  <div className="mb-3 flex items-center gap-2">...</div>
  <p className="mb-auto text-xs text-muted">{description}</p>
  <span className="mt-3 text-xs text-primary">Explore →</span>
</Link>
```

### Wrong — inline display breaks card background

```tsx
<Link href="/skills" className="rounded-xl border border-border bg-card p-5">
  <div className="mb-3 flex items-center gap-2">...</div>
  <p className="text-xs text-muted">{description}</p>
  <span className="mt-3 text-xs text-primary">Explore →</span>
</Link>
```

## When This Applies

- Any `<Link>` or `<a>` with `bg-card`, `bg-surface`, or any background color
- Any `<Link>` inside a CSS Grid or Flexbox container
- Any `<Link>` that contains block-level children (`<div>`, `<p>`, headings)

## Additional Best Practices

- Use `h-full` on card Links inside grids so all cards in a row have equal height
- Use `flex flex-col` with `mb-auto` on the description to push the CTA to the bottom
- The `e2e/card-layout.spec.ts` test enforces that card Links use block-level display

## Origin

- **Failure**: Card descriptions on the About page's "Get Started" section were partially hidden — the `<a>` element's `display: inline` caused `bg-card` to not fill the grid cell, leaving description text visible against the page background but overlapped by card border/background fragments
- **Date**: 2026-03-11
- **Root cause**: Next.js `<Link>` renders as `<a>` (inline by default); adding `bg-card`, `border`, and `rounded-xl` to an inline element doesn't create a proper box

## Cls Prevention

# CLS Prevention — Learned from Lighthouse audit enforcement

Cumulative Layout Shift (CLS) is the most heavily weighted performance metric in Lighthouse (weight=25). Two patterns in the codebase caused CLS scores of 0.25+ (the "good" threshold is < 0.1): client components that start hidden then appear after mount, and Suspense boundaries with no height placeholder. Both patterns cause visible content to shift after the initial paint.

## The Rules

### 1. Never use `useState(false)` → `useEffect` → `setState(true)` for conditional UI

When a client component starts with `useState(false)` and then shows itself in `useEffect`, SSR renders nothing. After hydration, the component appears and pushes all content below it down — a textbook layout shift.

**Invert the default.** Start visible during SSR, then hide on the client if the user previously dismissed it. For new visitors (and Lighthouse), the content is present from the first paint.

```tsx
// WRONG — hidden during SSR, appears after mount, causes CLS
export function Banner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("dismissed")) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;
  return <div>Banner content</div>;
}

// RIGHT — visible during SSR, hides after mount if dismissed
export function Banner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("dismissed")) {
      setDismissed(true);
    }
  }, []);

  if (dismissed) return null;
  return <div>Banner content</div>;
}
```

**When to apply:** Any component that conditionally shows based on a client-only signal (localStorage, cookies, feature flags read client-side, auth state). The question is: "What should the server render?" The answer should be the **most common case** for first-time visitors.

**Exception:** Components that should genuinely be hidden by default (modals, dropdowns, tooltips) start as `null` and that's correct — they aren't part of the page layout until triggered.

### 2. Never use `Suspense fallback={null}` for content that occupies layout space

When a dynamically imported component renders inside `<Suspense fallback={null}>`, the page renders with no space reserved. When the component loads, it expands and pushes content below it — a layout shift.

**Always provide a fallback that reserves the expected height.**

```tsx
// WRONG — no space reserved, content shifts when chart loads
<div className="mb-6">
  <Suspense fallback={null}>
    <CategoryBarChart categories={categories} />
  </Suspense>
</div>

// RIGHT — reserves approximate height, no shift when chart loads
<div className="mb-6 min-h-[52px]">
  <Suspense fallback={<div className="h-[52px]" />}>
    <CategoryBarChart categories={categories} />
  </Suspense>
</div>
```

**How to choose the fallback height:**

1. Render the component normally and measure its height at the target viewport
2. Use that measurement as a `min-h-[]` on the wrapper and `h-[]` on the fallback
3. It doesn't need to be pixel-perfect — within 20% is enough to prevent CLS

**When `fallback={null}` is acceptable:**

- The component is below the fold (not visible during initial viewport render)
- The component is inside a fixed-height container that won't shift
- The component replaces existing content (e.g., a tab panel swap) rather than inserting new content

### 3. Use `display: "optional"` for Next.js fonts, never `display: "swap"`

`font-display: swap` shows the fallback font immediately, then swaps to the web font when loaded. The swap causes text to reflow — different glyph widths shift surrounding content. This is a measurable CLS source.

`font-display: optional` gives the browser a very short window (~100ms) to load the font. If it misses, the fallback is used for the entire page load — no swap, no reflow, no CLS. On subsequent navigations the font is cached and loads instantly.

```tsx
// WRONG — swap causes text reflow CLS
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// RIGHT — optional eliminates font-swap CLS
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "optional",
});
```

**Trade-off:** First-time visitors on slow connections may see the system font instead of the web font. This is acceptable — no CLS is better than a prettier font that shifts the page.

### 4. Reserve viewport height on `<main>` to prevent footer shifting

When the `<main>` content area starts small during SSR (e.g., a skeleton or loading state) and expands during hydration, the `<footer>` shifts from inside the viewport to below it. Lighthouse measures this as CLS because the footer's position changes between the initial and final render.

Fix: set `minHeight` on `<main>` to push the footer below the fold from the first paint:

```tsx
// WRONG — footer starts inside viewport, shifts down as content loads
<main id="main-content" className="min-w-0 flex-1">
  {children}
</main>
<Footer />

// RIGHT — footer starts below fold, no shift regardless of content loading
<main
  id="main-content"
  className="min-w-0 flex-1"
  style={{ minHeight: "calc(100dvh - 3.5rem)" }}
>
  {children}
</main>
<Footer />
```

The `3.5rem` accounts for the header height. Adjust if the header height differs. Use `100dvh` (dynamic viewport height) not `100vh` to handle mobile browser chrome correctly.

### 5. Audit CLS sources when adding client components to server-rendered pages

When adding a new client component to a server-rendered page (especially in the root layout or high-traffic pages like `/skills`, `/rules`):

1. Check if the component's initial client state differs from its SSR output
2. If it renders `null` during SSR and content on mount → CLS risk
3. If it changes height/width between SSR and client hydration → CLS risk
4. Run `bun run test:lighthouse` to verify CLS stays below 0.1

## Common CLS Sources in Next.js

| Source | Mechanism | Fix |
|---|---|---|
| Banners/alerts that appear after mount | `useState(false)` → `useEffect` → `setState(true)` | Invert: default visible, dismiss on client |
| Dynamic imports with `Suspense fallback={null}` | No space reserved for lazy component | Add height-matching fallback |
| Client-only auth UI (login button vs avatar) | Different HTML between SSR and hydration | Use skeleton with same dimensions |
| Font loading (`font-display: swap`) | Fallback font → web font causes text reflow | Use `display: "optional"` in `next/font` config |
| Footer shifting during hydration | Content expands post-SSR, pushes footer down | `minHeight: calc(100dvh - header)` on `<main>` |
| Images without dimensions | Browser doesn't know size until image loads | Use `next/image` with `width`/`height` or `fill` |
| Animations that trigger on mount | `framer-motion` initial → animate changes layout | Use `layout` prop or set initial state to final position |
| CSS grid/flex transitions on mount | `grid-template-rows: 0fr → 1fr` causes measurable shift | Avoid animating layout properties; use `transform` instead |

## Anti-Pattern: CSS Grid Transitions to "Fix" CLS

An early attempt to fix the WhatsNewBanner CLS used `grid-template-rows: 0fr → 1fr` to smoothly expand the banner after mount. This **worsened** CLS from 0.25 to 0.35 because the grid expansion itself is a layout shift — Lighthouse measures the movement of downstream elements, not whether the transition is smooth.

The lesson: layout shifts are measured by the **displacement of elements**, not by the visual smoothness of the displacement. A perfectly smooth CSS transition that moves content 50px is the same CLS as a sudden 50px jump.

## Origin

- **Failure 1**: Lighthouse performance score of 86/100 on `/skills` — CLS of 0.269 from WhatsNewBanner appearing after mount and CategoryBarChart loading with no placeholder
- **Failure 2**: Attempted grid-template-rows fix worsened CLS to 0.35 — smooth transitions still count as layout shifts
- **Failure 3**: Consistent CLS of 0.248 across all pages caused by footer shifting during hydration as content expanded
- **Date**: 2026-03-16
- **Root cause**: (1) WhatsNewBanner used `useState(false)` → `useEffect` → `setVisible(true)`. (2) CategoryBarChart `Suspense fallback={null}`. (3) Font `display: "swap"` causing text reflow. (4) `<main>` had no minimum height, so footer started in-viewport and shifted down.
- **PR**: test/lighthouse-enforcement (#209), feat/quality-audit-tests (#211)

## Detection Acceleration

- **Level**: E2E test (CI)
  **What was added**: `e2e/lighthouse-audit.spec.ts` — Lighthouse audit enforcing 90+ scores in performance, accessibility, best practices, and SEO across 7 routes. CLS above 0.1 drops performance below 90.
  **Diagnosis time before**: CLS issues only discoverable through manual Lighthouse runs or user reports of "jumpy" pages
  **Diagnosis time after**: CI fails with specific CLS score, weight, and improvement opportunities listed in the error message


## Color Contrast (A11y)

> WCAG 2.1 AA color contrast requirements — approved text/background pairings, semantic color usage, tinted background guidance, and dark mode compliance _always-applied; globs: `**/*.tsx,**/*.css`_

# Color Contrast — WCAG 2.1 AA Compliance

Every text element must meet WCAG 2.1 AA minimum contrast ratios against its rendered background. This applies to both light and dark modes.

## Thresholds

| Content type | Minimum ratio | Examples |
|---|---|---|
| Normal text (< 18px, or < 14px bold) | **4.5:1** | Body copy, labels, badges, captions |
| Large text (>= 18px, or >= 14px bold) | **3:1** | Headings, hero text, large CTAs |
| UI components and icons | **3:1** | Icon-only buttons, focus rings, borders conveying state |

These are minimums. Aim for 7:1 (AAA) where practical, especially for body text.

## Design Token Pairings — Light Mode

The following table lists every approved text/background combination with its computed contrast ratio. Use only these pairings for semantic tokens.

### High-contrast pairings (body text safe)

| Text token | Hex | Background token | Hex | Ratio | Verdict |
|---|---|---|---|---|---|
| `text-foreground` | `#111827` | `bg-background` | `#f9fafb` | 17.4:1 | AA + AAA |
| `text-foreground` | `#111827` | `bg-card` / `bg-surface` | `#ffffff` | 18.2:1 | AA + AAA |
| `text-foreground` | `#111827` | `bg-secondary` | `#f3f4f6` | 16.5:1 | AA + AAA |
| `text-muted` | `#6b7280` | `bg-background` | `#f9fafb` | 4.6:1 | AA |
| `text-muted` | `#6b7280` | `bg-card` / `bg-surface` | `#ffffff` | 5.0:1 | AA |
| `text-white` | `#ffffff` | `bg-primary` | `#d04a02` | 4.5:1 | AA |
| `text-white` | `#ffffff` | `bg-foreground` | `#111827` | 18.2:1 | AA + AAA |

### Semantic text-safe tokens (use `-text` variants for body text)

| Text token | Hex | Background token | Hex | Ratio | Verdict |
|---|---|---|---|---|---|
| `text-primary-text` | `#c44000` | `bg-background` | `#f9fafb` | 4.9:1 | AA |
| `text-primary-text` | `#c44000` | `bg-card` | `#ffffff` | 5.1:1 | AA |
| `text-success-text` | `#15803d` | `bg-background` | `#f9fafb` | 4.8:1 | AA |
| `text-success-text` | `#15803d` | `bg-card` | `#ffffff` | 5.1:1 | AA |
| `text-warning-text` | `#b45309` | `bg-background` | `#f9fafb` | 4.8:1 | AA |
| `text-warning-text` | `#b45309` | `bg-card` | `#ffffff` | 5.1:1 | AA |
| `text-accent-text` | `#b45309` | `bg-background` | `#f9fafb` | 4.8:1 | AA |
| `text-error-text` | `#dc2626` | `bg-background` | `#f9fafb` | 4.8:1 | AA |
| `text-error-text` | `#dc2626` | `bg-card` | `#ffffff` | 5.0:1 | AA |

### Borderline / restricted pairings

| Text token | Hex | Background token | Hex | Ratio | Restriction |
|---|---|---|---|---|---|
| `text-muted` | `#6b7280` | `bg-secondary` | `#f3f4f6` | 4.4:1 | Large text or bold only (>= 18px / >= 14px bold) |
| `text-primary` | `#d04a02` | `bg-background` | `#f9fafb` | 4.3:1 | Large text or bold only; use `text-primary-text` for body text |
| `text-primary` | `#d04a02` | `bg-card` | `#ffffff` | 4.5:1 | AA pass on pure white only; prefer `text-primary-text` |

### Failing pairings — never use for text

| Text token | Hex | Background | Ratio | Why it fails |
|---|---|---|---|---|
| `text-success` | `#22c55e` | any light bg | 2.2:1 | Green-500 is too bright for text; use `text-success-text` |
| `text-warning` | `#e88d14` | any light bg | 2.4:1 | Amber is too bright for text; use `text-warning-text` |
| `text-accent` | `#e88d14` | any light bg | 2.4:1 | Same as warning; use `text-accent-text` |
| `text-error` | `#ef4444` | any light bg | 3.6:1 | Red-400 fails for normal text; use `text-error-text` |

## Design Token Pairings — Dark Mode

Dark mode reassigns background tokens but keeps `--primary`, `--success`, `--warning`, `--error` unchanged. The `-text` variants switch to lighter shades that contrast against dark surfaces.

### High-contrast pairings (body text safe)

| Text token | Hex (dark) | Background token | Hex (dark) | Ratio | Verdict |
|---|---|---|---|---|---|
| `text-foreground` | `#f9fafb` | `bg-background` | `#111827` | 17.4:1 | AA + AAA |
| `text-foreground` | `#f9fafb` | `bg-card` / `bg-surface` | `#1f2937` | 14.2:1 | AA + AAA |
| `text-foreground` | `#f9fafb` | `bg-secondary` | `#1f2937` | 14.2:1 | AA + AAA |
| `text-muted` | `#9ca3af` | `bg-background` | `#111827` | 7.2:1 | AA + AAA |
| `text-muted` | `#9ca3af` | `bg-card` | `#1f2937` | 5.9:1 | AA |

### Semantic text-safe tokens (dark mode values)

| Text token | Hex (dark) | Background token | Hex (dark) | Ratio | Verdict |
|---|---|---|---|---|---|
| `text-primary-text` | `#f97316` | `bg-background` | `#111827` | 6.5:1 | AA + AAA (large) |
| `text-primary-text` | `#f97316` | `bg-card` | `#1f2937` | 5.3:1 | AA |
| `text-success-text` | `#4ade80` | `bg-background` | `#111827` | 10.4:1 | AA + AAA |
| `text-success-text` | `#4ade80` | `bg-card` | `#1f2937` | 8.5:1 | AA + AAA |
| `text-warning-text` | `#fbbf24` | `bg-background` | `#111827` | 10.9:1 | AA + AAA |
| `text-warning-text` | `#fbbf24` | `bg-card` | `#1f2937` | 8.9:1 | AA + AAA |
| `text-accent-text` | `#fbbf24` | `bg-background` | `#111827` | 10.9:1 | AA + AAA |
| `text-error-text` | `#f87171` | `bg-background` | `#111827` | 6.6:1 | AA + AAA (large) |
| `text-error-text` | `#f87171` | `bg-card` | `#1f2937` | 5.4:1 | AA |

## Tinted Background Pattern

The `bg-X/10 text-X` pattern (e.g., `bg-success/10 text-success`) is common for soft badges and status pills. However, the base semantic colors fail contrast on their own tinted backgrounds in light mode because the tinted bg is nearly white and the text color is too bright.

### Correct tinted pairings

```tsx
// WRONG — text-success (#22c55e) on near-white bg is 2.2:1
<span className="bg-success/10 text-success">Active</span>

// CORRECT — use the -text variant
<span className="bg-success/10 text-success-text">Active</span>

// WRONG — text-warning on near-white bg is 2.4:1
<span className="bg-warning/10 text-warning">Pending</span>

// CORRECT
<span className="bg-warning/10 text-warning-text">Pending</span>

// WRONG — text-error on near-white bg is 3.6:1
<span className="bg-error/10 text-error">Failed</span>

// CORRECT
<span className="bg-error/10 text-error-text">Failed</span>
```

Exception: `bg-primary/10 text-primary` is borderline (4.3–4.5:1 depending on the underlying background). Use `text-primary-text` for body-sized text; `text-primary` is acceptable when the text is >= 18px or >= 14px bold.

## When to Use Base vs `-text` Variants

| Base token (`--success`, etc.) | `-text` variant (`--success-text`, etc.) |
|---|---|
| Filled backgrounds (`bg-success`) | Text on light/dark backgrounds |
| Icon fill on dark/contrasting bg | Standalone text labels, badge text |
| Decorative accents, borders | Links, status indicators, inline labels |
| Chart colors, data viz | Body copy with semantic meaning |

The base token is the "brand" shade — vivid and recognizable. The `-text` variant is the contrast-safe shade — darker in light mode, lighter in dark mode.

## Rules

1. **Default to `text-foreground`** for all body text. It passes AAA on every standard background in both themes.
2. **Use `text-muted`** for secondary/supporting text on `bg-background`, `bg-card`, or `bg-surface`. Avoid on `bg-secondary` unless the text is large/bold.
3. **Never use `text-success`, `text-warning`, `text-accent`, or `text-error`** as text colors. Always use their `-text` variants (`text-success-text`, `text-warning-text`, `text-accent-text`, `text-error-text`).
4. **Use `text-primary-text`** instead of `text-primary` for body-sized text. `text-primary` is allowed only for large/bold text (headings, hero text, large buttons).
5. **White text** (`text-white`) may only appear on backgrounds with luminance <= 0.18 (dark enough). Safe backgrounds: `bg-primary`, `bg-foreground`, `bg-red-600`, `bg-green-600`, `bg-yellow-600`. Unsafe: `bg-secondary`, `bg-card`, `bg-accent`, any `/10` or `/20` tinted backgrounds.
6. **Arbitrary hex colors** (`text-[#abc123]`) require a manual contrast check before use. Verify against the actual rendered background using the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).
7. **Dark mode** must be checked independently. The `-text` tokens auto-switch between light and dark variants via CSS custom properties, so using them is inherently safe.

## Self-Check Workflow

Before shipping any color change:

1. Identify the text color and its rendered background color (including opacity, tints, and stacking).
2. Look up the pairing in the tables above. If it's listed as "AA" or better, you're done.
3. If the pairing isn't listed, compute the contrast ratio at [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) or [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/).
4. Verify >= 4.5:1 for normal text or >= 3:1 for large text.
5. Check both light and dark mode.
6. If the ratio fails, switch to the appropriate `-text` variant or choose a different pairing from the approved table.

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| `text-success` on any background | 2.2:1 in light mode | `text-success-text` |
| `text-warning` or `text-accent` as label text | 2.4:1 in light mode | `text-warning-text` / `text-accent-text` |
| `text-error` on light background | 3.6:1, fails AA for normal text | `text-error-text` |
| `text-primary` for body copy | 4.3:1 on `bg-background` | `text-primary-text` |
| `text-white` on `bg-secondary` | White on near-white | `text-foreground` on `bg-secondary` |
| `text-white` on `bg-accent` or tinted bg | Low contrast | `text-foreground` or `-text` variant |
| `text-[#hexvalue]` without verification | Unknown ratio | Check with contrast tool first |
| Relying on `opacity-` to lighten text | Reduces contrast unpredictably | Use `text-muted` or a defined token |

## Relationship to Other Rules

- **`tailwind-classes.mdc`** — defines the design token system and `cn()` composition. The tokens referenced here are defined in `globals.css` and exposed via `@theme inline`.
- **`responsive-testing.mdc`** — the visual sweep step should verify contrast using this rule's pairing table as the source of truth.
- **`tailwind-components.mdc`** — CVA variant definitions in `button.tsx`, `badge.tsx`, etc. must use approved pairings. When adding a new variant, check its colors against this table.

## Content Drift

> Prevent content changes from being lost when feature branches sit unmerged _always-applied_

# Content Drift — Learned from cinema overlay images & Kobayashi Maru swap lost across branches

The cinema learning experience had two content changes (`feat/cinema-overlays` with 27 background images, and a planned WarGames→Kobayashi Maru swap) that lived on feature branches for weeks without being merged to `origin/main` via GitHub PR. A local "sweep everything" session merged them into a local `main` but the push either never happened or was overwritten by subsequent work. The content was silently lost — no error, no test failure, just missing images and stale data that only a human would notice.

## The Rule

Content-only branches (images, copy, data changes with no code dependencies) must be merged to `origin/main` within 24 hours of creation. They have no merge conflicts worth worrying about and no CI risk. Letting them sit on feature branches is how content gets lost.

### Classification

| Branch type | Max age before merge | Why |
|---|---|---|
| Content-only (images, copy, static data) | 24 hours | Zero conflict risk, zero test risk — merge immediately |
| Feature + content (new page + its images) | Merge together as one PR | Content depends on the code — ship atomically |
| Infrastructure / refactor | Normal PR review cycle | Needs careful review |

### Prevention checklist

When creating a branch that adds or modifies static content (`public/`, data files, copy in TSX):

1. **Open the PR immediately** — don't wait for the code to be "ready." Content PRs are reviewable on their own.
2. **Merge content PRs same-day** when possible. The longer a content branch lives, the more likely it drifts.
3. **Never rely on local merges** — a `git merge` into your local `main` is not a merge. Only a squash-merged PR on GitHub counts.
4. **After any "merge sweep" session**, verify with `git log origin/main --oneline -5` that the remote actually has the changes. If it doesn't, push.

### Detection

After completing cinema or learn content changes, verify the content exists on `origin/main`:

```bash
git fetch origin main
git ls-tree --name-only origin/main -- public/cinema/ | wc -l
```

If the count is 0 and it shouldn't be, the content never made it to remote.

## Origin

- **Failure**: 27 cinema overlay images and a WarGames→Kobayashi Maru content swap lived on feature branches for weeks without reaching `origin/main`. A local merge sweep appeared to fix it but was never pushed or was overwritten. Content was silently lost.
- **Date**: 2026-03-15
- **Root cause**: Content-only branches treated with the same review cadence as code branches, plus reliance on local merges without verifying the remote.
- **PR**: fix/cinema-kobayashi-overlays (#197)

## Conventional Commits

> Conventional Commits - enforce commit format and PR commit storytelling _always-applied_

# Conventional Commits

All commits in this repository MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Allowed Types

| Type | When to use |
|------|-------------|
| `feat` | A new feature or capability |
| `fix` | A bug fix |
| `docs` | Documentation-only changes (README, SKILL.md, CHANGELOG, comments) |
| `style` | Formatting, whitespace, linting — no logic changes |
| `refactor` | Code restructuring without changing behavior |
| `test` | Adding or updating tests |
| `chore` | Build, CI, tooling, dependency updates |
| `perf` | Performance improvements |
| `ci` | CI/CD configuration changes |
| `revert` | Reverting a previous commit |

## Rules

1. **Type is required** — every commit message starts with a type prefix followed by a colon and space.
2. **Description is lowercase** — do not capitalize the first word after the colon (e.g., `feat: add miro skill` not `feat: Add miro skill`).
3. **No period at the end** — the subject line does not end with a period.
4. **Scope is optional** — use it to clarify which module/skill is affected (e.g., `fix(compare-deep-dives): handle empty cells`).
5. **Breaking changes** — append `!` after the type/scope (e.g., `feat!: rename skill directory`) or add a `BREAKING CHANGE:` footer.
6. **Body wraps at 72 characters** — the optional body provides context for *why*, not *what*.
7. **Imperative mood** — write "add feature" not "added feature" or "adds feature".

## PR Commit Storytelling

Each PR's commits should read like a linear narrative — a reviewer reading them top-to-bottom should understand *how* the work evolved, not just *what* changed.

### Principles

1. **One logical change per commit.** A commit that adds a feature AND fixes a lint error is two commits.
2. **Order commits by dependency.** Infrastructure before the code that uses it. Schema before queries. Types before implementations.
3. **Scaffolding first, behavior second, polish last.** A typical PR reads:
   - `chore:` or `refactor:` — prep work (new files, dependency changes, config)
   - `feat:` or `fix:` — the core change
   - `test:` — tests for the core change
   - `docs:` — documentation, changelogs, README updates
   - `style:` — formatting cleanup (always last)
4. **Each commit should leave the repo in a passing state.** Don't commit broken code with a "fix it in the next commit" plan — squash or reorder so every commit is green.
5. **Don't mix refactoring with behavior changes.** If you need to refactor something to enable a feature, that's two commits: one `refactor:` and one `feat:`.

### Anti-patterns

- **"WIP" commits** — squash these before pushing. The reviewer doesn't need your save points.
- **"fix lint" after every feature commit** — run the formatter *before* committing the feature.
- **One giant commit** — if the diff is 500+ lines, find the seams and split it.
- **Interleaved concerns** — don't alternate between test/feat/test/feat. Group by concern.

### Example: well-structured PR

```
chore: add python-docx dependency for UAT generation
feat(generate-uat): implement core document builder
feat(generate-uat): add chat export parser
test(generate-uat): add parametrized tests for builder and parser
docs(generate-uat): add SKILL.md and CHANGELOG entry
docs(readme): add generate-uat to skills catalog
```

Each commit builds on the last. A reviewer can read them in order and understand exactly how the skill was built.

## Copilot Review

> Auto-trigger Copilot coding agent to implement PR review feedback, poll for completion, and merge _always-applied_

# Copilot Review — Default Behavior

After any `git push` to a branch with an open PR that has unresolved review comments, the agent should:

1. Fetch the review comments to summarize what needs fixing
2. Post a `@copilot` trigger comment on the PR with a summary of the required changes
3. Run `poll-and-merge.sh` to wait for Copilot to finish and CI to pass
4. Prompt the user for confirmation before merging

## Opting Out

To disable this behavior, set `alwaysApply: false` in this rule or delete it entirely. The skill at `.cursor/skills/copilot-review/SKILL.md` remains available for manual invocation regardless.

## Merge Policy

Merges to `main` are always squash merges. The poll-and-merge script enforces this automatically — non-squash strategies are overridden when the PR targets `main`.

## Skill Reference

See `.cursor/skills/copilot-review/SKILL.md` for the full workflow, prerequisites, and edge case handling.

## Dag Active Node State

> Visual patterns for showing active, pending, completed, and failed nodes in DAG UIs

# DAG Active Node State — Visualizing Liveness in Orchestration Graphs

Every node in an orchestration DAG has a lifecycle state. The visualization must communicate state without requiring hover or click. Color, animation, and iconography encode state at rest.

## State Color Encoding

Every orchestration system uses the same color vocabulary. Don't invent new meanings for these colors.

| State | Background | Border | Icon | Animation |
|---|---|---|---|---|
| **Pending / Queued** | `bg-gray-100` / `bg-purple-50` | Dashed, `border-gray-300` | Clock or empty circle | None |
| **Running** | `bg-blue-50` / `bg-cyan-50` | Solid, `border-blue-400` | Spinner or play | Pulse ring or shimmer |
| **Completed** | `bg-green-50` | Solid, `border-green-400` | Checkmark | Brief scale-up on completion, then static |
| **Failed** | `bg-red-50` | Solid, `border-red-400` | X mark | None (failures should be visually stable, not distracting) |
| **Retrying** | `bg-amber-50` | Dashed, `border-amber-400` | Refresh/retry arrow | Slow pulse |
| **Skipped** | `bg-gray-50` | Dotted, `border-gray-200` | Skip arrow | None, reduced opacity |
| **Cancelled** | `bg-gray-100` | Solid, `border-gray-300` | Slash circle | None, reduced opacity |

Use `-text` variants for any text labels inside state-colored nodes (per `color-contrast.mdc`).

## Animation Patterns for Active Nodes

Four patterns from production orchestration systems, ordered by visual density (least noisy to most):

### 1. Shimmer sweep (best at scale)

A gradient sweep across the node surface. Produces less visual noise than pulses when many nodes are active simultaneously. Dagster switched to this (PR #24390) because pulse rings didn't scale well with dozens of concurrent materializations.

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.node-running {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(59, 130, 246, 0.08) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}
```

### 2. Spinning border (React Flow's built-in)

React Flow's `NodeStatusIndicator` component provides this out of the box with `loadingVariant="border"`. A `conic-gradient` rotates around the node border. Clean, compact, doesn't affect node dimensions.

```css
@keyframes spin-border {
  to { --angle: 360deg; }
}

.node-running {
  border: 2px solid transparent;
  background-image:
    linear-gradient(white, white),
    conic-gradient(from var(--angle), #3b82f6 0%, transparent 30%, transparent 70%, #3b82f6 100%);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  animation: spin-border 1.5s linear infinite;
}
```

### 3. Pulse ring / sonar (Dagster PR #20556)

Expanding concentric rings that fade out. Good for drawing attention to a single active node. Bad when 20+ nodes pulse simultaneously (visual overload).

```css
@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.4; }
  80% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1.6); opacity: 0; }
}

.node-running::before,
.node-running::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: inherit;
  border: 2px solid currentColor;
  animation: pulse-ring 2s ease-out infinite;
}

.node-running::after {
  animation-delay: 0.6s;
}
```

Use `opacity` and `transform` only — these are compositor-friendly and won't trigger layout (per `transition-property-specificity.mdc`).

### 4. Animated edges (data flowing)

Edges from a running node to its pending children show movement — a dot or dash pattern traveling along the edge path. React Flow supports this with SVG `animateMotion`:

```tsx
<circle r="3" fill="#3b82f6">
  <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
</circle>
```

This is subtle but powerful for showing which parts of the graph are "hot" without adding noise to the nodes themselves.

## State Transition Animations

When a node changes state, animate the transition rather than snapping:

| Transition | Animation |
|---|---|
| Pending → Running | Border color fade (150ms), shimmer/pulse starts |
| Running → Completed | Green flash (scale 1.05 → 1.0 over 300ms), shimmer stops, check icon fades in |
| Running → Failed | Red flash (similar to completion), X icon fades in |
| Any → Retrying | Brief amber pulse, then slow pulse continues |

Use Framer Motion's `AnimatePresence` and `motion.div` for coordinated state transitions across multiple properties. Raw CSS transitions work but are harder to orchestrate when color, border, icon, and animation all change simultaneously.

```tsx
<motion.div
  animate={{
    borderColor: stateColors[status].border,
    backgroundColor: stateColors[status].bg,
    scale: status === "completed" ? [1.05, 1.0] : 1.0,
  }}
  transition={{ duration: 0.2, scale: { duration: 0.3 } }}
>
  {children}
</motion.div>
```

## Surfacing Active and Failed Nodes

Users shouldn't have to scroll or search to find what needs attention.

### Auto-pan to active region

When execution starts or a failure occurs, smoothly pan the viewport to center the active/failed nodes. React Flow's `fitView` with a node filter:

```typescript
reactFlowInstance.fitView({
  nodes: nodes.filter((n) => n.data.status === "running" || n.data.status === "failed"),
  padding: 0.3,
  duration: 400,
});
```

### Sidebar summary

Show a compact list of active and failed nodes in a sidebar, ordered by state priority (failed first, then running, then pending). Each entry links to the node in the graph (click to pan). Dagster's asset sidebar uses status dots for this.

### Minimap coloring

React Flow's `MiniMap` accepts a `nodeColor` function. Color minimap nodes by state so the user can see at a glance where activity is concentrated without inspecting individual nodes:

```tsx
<MiniMap
  nodeColor={(node) => ({
    running: "#3b82f6",
    failed: "#ef4444",
    completed: "#22c55e",
    pending: "#d1d5db",
  })[node.data.status] ?? "#d1d5db"}
/>
```

## What Not to Do

- Don't use `transition-all` on DAG nodes — hundreds of nodes transitioning every CSS property kills performance. Use specific transition properties (per `transition-property-specificity.mdc`).
- Don't conditionally render DOM for state changes (`{running && <Spinner />}`). Always keep state indicators in the DOM and toggle with `opacity` (per `hover-content-jank.mdc`).
- Don't unmount the graph to show a loading spinner during re-layout. Overlay the indicator. Users should be able to inspect the previous state while the new layout computes.
- Don't use the same animation intensity for 1 active node and 100 active nodes. Switch from pulse rings to shimmer when > 10 nodes are active simultaneously.

## Dag Layout Algorithms

> Layout algorithms and paradigms for rendering orchestration DAGs

# DAG Layout Algorithms — Orchestration Graph Rendering

When building a visual DAG for an orchestration or workflow system, the layout algorithm determines whether the graph is readable or a spaghetti disaster. Choose the algorithm based on graph shape, node count, and whether the DAG has massive fan-out.

## Three Visualization Paradigms

Orchestration DAGs can be rendered in three complementary views. No single view answers every question. Build at least two.

| Paradigm | Answers | Best for | Example systems |
|---|---|---|---|
| **Node-link graph** (classic DAG) | "What depends on what?" | Structural understanding, dependency debugging | Dagster, Airflow Graph View, React Flow |
| **Timeline / Gantt** | "What's running now? How long has it taken?" | Real-time monitoring, duration analysis | Temporal Timeline, Perfetto, GitHub Actions |
| **Terminal tree** (git-log style) | "What just happened?" | Developer-facing CLI tools, streaming output | Dagger TUI, `git log --graph` |

### Node-link graph

The standard. Nodes are boxes, edges show dependencies, layout flows top-to-bottom or left-to-right. Uses the Sugiyama/layered algorithm: assign nodes to layers, minimize edge crossings, assign coordinates.

The problem with wide fan-outs: when 50+ nodes run in parallel at the same layer, the graph goes ultra-wide and edges from the fan-in node become unreadable. Mitigate with group collapsing (see `dag-parallel-scale.mdc`).

### Timeline / Gantt

Each task is a horizontal bar on a time axis. Parallel tasks stack vertically at the same time offset. Color encodes state. Excellent for answering "what's running right now and how long has it been running?" but loses dependency structure.

Temporal uses `vis-timeline` under the hood. Dagger.jl exports Chrome Trace Format viewable in Perfetto. The Rust `tracing-durations-export` crate does the same for `tracing` spans.

### Terminal tree

Dagger's TUI linearizes the DAG into a vertically scrolling tree where columns represent parallel branches. Active operations blink. Completed operations show duration and a green check. Failures float to the top. Sidesteps the entire graph layout problem by using the terminal's scroll buffer as natural history. Implementable with `ratatui` in Rust.

## Layout Algorithm Selection

| Algorithm | Library | Best for | Handles wide fan-out? | Bundle size |
|---|---|---|---|---|
| **ELK Layered** | elkjs | Production DAG UIs with ports and hierarchy | Yes — partitioning, compaction, `crossingMinimization.semiInteractive` | ~500KB (WASM) |
| **Sugiyama** | d3-dag | Moderate DAGs, pure JS, clean TS types | Adequate | ~30KB |
| **Dagre** | dagrejs/dagre | Simple prototypes, React Flow default | Poor with wide graphs | ~30KB |
| **Force-directed** | d3-force, Cosmograph | Exploratory/organic layouts | No inherent direction — bad for DAGs | Varies |

### ELK.js configuration for orchestration DAGs

ELK's layered algorithm is the only one that handles 100+ node parallel layers gracefully. Key options:

```typescript
const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "DOWN",
  "elk.layered.spacing.nodeNodeBetweenLayers": "80",
  "elk.spacing.nodeNode": "40",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.compaction.postCompaction.strategy": "EDGE_LENGTH",
  "elk.portConstraints": "FIXED_SIDE",
};
```

- `LAYER_SWEEP` for crossing minimization handles wide layers without exponential blowup
- `NETWORK_SIMPLEX` for node placement produces tighter, more balanced layouts than `LINEAR_SEGMENTS`
- Post-compaction by edge length reduces wasted whitespace in sparse regions
- `FIXED_SIDE` port constraints keep edges anchored to top/bottom of nodes, preventing spaghetti

### When to use Sugiyama (d3-dag) instead

Use d3-dag's Sugiyama when:
- The DAG has < 200 nodes
- You need pure JS with no WASM dependency
- The layout runs client-side and bundle size matters
- You don't need port constraints or hierarchical nesting

d3-dag is in maintenance mode. For new projects, prefer ELK.js.

## Layout Execution

### Compute layout off the main thread

ELK.js layout computation is synchronous and CPU-intensive for large graphs. Run it in a Web Worker to avoid blocking the UI:

```typescript
const worker = new Worker(new URL("elkjs/lib/elk.bundled.js", import.meta.url));
const elk = new ELK({ workerFactory: () => worker });
const layout = await elk.layout(graph);
```

### Animate position transitions

When the layout recomputes (node added, state change triggers re-layout), animate nodes from old positions to new positions rather than snapping. React Flow supports this natively with `fitView` transitions. For custom implementations, use Framer Motion's `animate` on x/y.

### Keep the graph rendered during updates

Never unmount the graph to show a spinner. Dagster learned this the hard way (PR #28336). Overlay a loading indicator on top of the existing graph. The user should be able to pan and inspect the previous state while the new layout computes.

## Edge Routing

| Strategy | Use when |
|---|---|
| **Polyline** (ELK default) | Clean orthogonal edges, good for layered layouts |
| **Spline / Bezier** | Softer aesthetic, React Flow default, good for moderate density |
| **Straight** | Very sparse graphs only — becomes unreadable with crossings |

For dense parallel DAGs, polyline routing with ELK produces the most readable result because edges follow grid lines and avoid overlapping node bodies.

## Dag Parallel Scale

> Techniques for visualizing massively parallel DAGs with hundreds of concurrent nodes

# DAG Parallel Scale — Visualizing Massive Fan-Out in Orchestration Systems

When an orchestration system fans out to hundreds of parallel tasks, naive node-link rendering collapses. The graph goes ultra-wide, edges become spaghetti, and the browser chokes rendering 500 SVG nodes. These techniques keep the visualization readable and performant at scale.

## Group Collapsing (the most important technique)

When a fan-out produces 10+ parallel tasks of the same type, render them as a single **batch node** showing aggregate state. Click to expand into individual nodes.

### Batch node display

```
┌─────────────────────────────────┐
│  Process Records (47/50)        │
│  ██████████████████████░░░ 94%  │
│  ✓ 47  ⟳ 2  ✗ 1               │
└─────────────────────────────────┘
```

The batch node shows:
- Task type name and total count
- Progress bar (completed / total)
- State breakdown: completed (check), running (spinner), failed (x)

### Expansion behavior

Clicking a batch node expands it inline, showing individual task nodes in a compact grid or list within a bordered group. The group maintains a single incoming edge and single outgoing edge to the rest of the graph. ELK.js supports this natively with its hierarchical layout — child nodes inside a parent node.

### When to collapse

| Parallel count | Render as |
|---|---|
| 1–5 | Individual nodes |
| 6–20 | Collapsible group (expanded by default if < 10, collapsed if >= 10) |
| 21–100 | Batch node with progress bar |
| 100+ | Batch node with count only (no individual expansion — use a detail panel instead) |

## Swim Lanes

Partition parallel tasks into vertical columns by worker, executor, or task type. Tasks flow top-to-bottom within a lane. Cross-lane edges show data dependencies.

```
Worker A     Worker B     Worker C     Worker D
─────────    ─────────    ─────────    ─────────
[Task 1]     [Task 2]     [Task 3]     [Task 4]
   │            │            │            │
[Task 5]     [Task 6]     [Task 7]     [Task 8]
   │            │            │            │
   └────────────┴────────────┴────────────┘
                     │
               [Aggregate]
```

This layout works well when tasks naturally map to workers/executors (CI/CD pipelines, distributed compute). GitHub Actions uses a version of this for its workflow visualization.

Implement with ELK.js by setting `elk.partitioning.activate: true` and assigning each node a `elk.partitioning.partition` value corresponding to its lane.

## Heat Map Overlay

Instead of showing individual node states in a wide parallel layer, color the entire layer by completion percentage. A gradient from blue (0% done) through cyan (50%) to green (100%) gives instant "how far along is this batch?" without rendering hundreds of nodes.

```tsx
const layerColor = (completed: number, total: number) => {
  const pct = completed / total;
  if (pct >= 1.0) return "#22c55e";
  if (pct >= 0.5) return `color-mix(in oklch, #22c55e ${pct * 100}%, #06b6d4)`;
  return `color-mix(in oklch, #06b6d4 ${pct * 200}%, #3b82f6)`;
};
```

Apply this as a background on the layer's bounding box in the graph. Individual nodes within the layer can still be rendered but with reduced visual weight (smaller, no border, just dots).

## Radial Layout for Extreme Fan-Out

For extreme fan-outs (hundreds of parallel tasks from a single parent), a radial/sunburst layout around the parent node is more compact than a horizontal spread. Each spoke is a task. Active tasks pulse at their spoke tip.

```
         [Task 12]
      [Task 11]  [Task 13]
    [Task 10]      [Task 14]
   [Task 9]          [Task 15]
  [Task 8]    [Parent]    [Task 1]
   [Task 7]          [Task 2]
    [Task 6]      [Task 3]
      [Task 5]  [Task 4]
```

This works when:
- All children are at the same depth (single fan-out, not a multi-level tree)
- The parent node is a natural visual anchor
- There's no meaningful ordering among the children

D3's `d3.tree` with a radial projection handles this. For React Flow integration, compute positions with d3 and pass them as node coordinates.

## Rendering Technology by Scale

| Visible node count | Technology | Why |
|---|---|---|
| < 500 | SVG (React Flow, d3) | Rich interactivity, React components inside nodes, accessibility |
| 500–10,000 | Canvas (Sigma.js) | SVG DOM overhead becomes prohibitive; Canvas draws directly |
| 10,000+ | WebGL (Cosmograph, Sigma.js v3) | GPU-accelerated rendering, handles millions of elements |

For orchestration DAGs, group collapsing should keep you under 500 visible nodes at any time. Use SVG with React Flow. If you genuinely need to render thousands of concurrent tasks without collapsing, Sigma.js with WebGL is the move — but you lose the ability to put rich React components inside nodes.

### Sigma.js for large graphs

Sigma.js renders graphs of thousands of nodes and edges using WebGL. It pairs with `graphology` for the data model. Supports React integration via `@react-sigma`:

```typescript
import { SigmaContainer } from "@react-sigma/core";
import Graph from "graphology";

const graph = new Graph();
// ... add nodes and edges
<SigmaContainer graph={graph} settings={{ renderLabels: true }} />
```

### Cosmograph for extreme scale

Cosmograph uses GPU-accelerated force layout computation — layout runs on the GPU, not the CPU. Handles graphs that CPU-based force layouts can't (> 100K nodes). Overkill for typical orchestration DAGs but relevant if visualizing a distributed trace with millions of spans.

## Minimap + Detail View

React Flow's built-in `MiniMap` component shows the full graph structure while the main viewport zooms into the active region. For large parallel DAGs:

1. Color minimap nodes by state (blue = running, green = done, red = failed, gray = pending)
2. Show a "viewport rectangle" on the minimap so the user knows which slice they're looking at
3. Auto-pan the viewport to the active execution frontier when "follow mode" is enabled
4. Let the user click on the minimap to jump to any region

## Library Stack for TypeScript/React

| Purpose | Library | Role |
|---|---|---|
| Graph canvas | React Flow (xyflow) | Nodes are React components, built-in minimap, controls, animated edges |
| Layout engine | ELK.js (layered algorithm) | Compute node positions, handle hierarchy and port constraints |
| State transitions | Framer Motion | Animate color, scale, opacity when node state changes |
| Node styling | Tailwind CSS | `animate-pulse` for active nodes, color classes for state encoding |
| Large graph fallback | Sigma.js + graphology | WebGL rendering when SVG can't keep up |

## Library Stack for Rust TUI

| Purpose | Library | Role |
|---|---|---|
| TUI framework | ratatui | Dagger-style git-log tree with custom rendering |
| Span instrumentation | tracing + tracing-durations-export | Record parallel spans, export to Chrome Trace Format |
| Trace viewer | Perfetto (external) | View exported traces as timeline/Gantt with full zoom |
| Graph layout (if needed) | petgraph + custom layering | Compute DAG layers for terminal column assignment |

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Rendering 200+ individual SVG nodes in a fan-out | Browser lag, unreadable layout | Group collapse into batch node |
| Force-directed layout for a DAG | No inherent direction, unstable positions | Use ELK layered or Sugiyama |
| Fixed viewport (no zoom/pan) for large graphs | User can't inspect dense regions | React Flow provides zoom/pan by default |
| Re-running layout on every state change | Nodes jump around, disorienting | Only re-layout when topology changes (add/remove nodes), not state changes |
| Same visual treatment for 1 and 100 active nodes | Pulse rings at scale create visual overload | Switch animation strategy based on active count |

## Direct Database Access

> Prefer direct SQL over ORMs. Types are the schema — define once, use everywhere. _always-applied_

# Direct Database Access

Prefer direct SQL over ORMs. ORMs add abstraction, indirection, and generated code that obscure what's actually happening at the database layer. Direct SQL with typed query helpers gives better performance, clearer intent, and end-to-end type safety without the baggage.

## Core Principle: Types ARE the Schema

Define TypeScript interfaces that match database columns 1:1. These same types flow from the database layer through API routes into React components. One source of truth, zero mapping layers.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ schema.pg.sql│────▶│  types/db.ts  │────▶│  Component   │
│  (columns)   │     │  (interfaces) │     │  (props)     │
└──────────────┘     └──────────────┘     └──────────────┘
    CREATE TABLE        interface Skill       skill.name
    "Skill" (           { name: string;      skill.category
      name TEXT,          category: string;
      category TEXT,      ...
      ...               }
    )
```

If a column is added to the table, add it to the interface. If the interface changes, the compiler catches every callsite. No codegen, no introspection, no drift.

## Rules

1. **Write SQL directly** — `await sql.get<Skill>('SELECT * FROM "Skill" WHERE slug = $1', slug)` is clearer than any ORM equivalent. No query builders, no method chaining, no magic.

2. **Name columns to match types** — Use camelCase for both SQL column names and TypeScript properties. PostgreSQL requires quoting camelCase identifiers (`"skillId"`, `"createdAt"`). This eliminates the need for any row-to-model mapping.

3. **Thin wrappers, not abstractions** — A function that runs a parameterized query and returns typed results is fine. A class hierarchy that generates SQL from method calls is not.

4. **Schema lives in .sql files** — `CREATE TABLE` is the schema definition. Keep it in `schema.pg.sql` that can be read, diffed, and applied directly. Migrations are sequential `.sql` files, not framework-specific DSLs.

5. **Type assertions at the boundary** — Cast query results at the point they leave the database layer: `rows as Skill[]`. This is safe because you control both the schema and the type. If they drift, tests catch it immediately.

6. **No generated code** — Don't depend on code generators, schema introspection tools, or build-time type generation. Hand-written types are easier to understand, debug, and refactor.

## Preferred Stack

| Need | Use | Avoid |
|---|---|---|
| PostgreSQL | pg + @types/pg | prisma, typeorm, sequelize, drizzle |
| Migrations | Sequential .sql files | ORM migration frameworks |
| Type safety | Interfaces matching columns | Generated types from introspection |
| Query building | Template literals with $N parameterized values | Query builder libraries |
| Connection pooling | pg.Pool with withClaims() wrapper | Direct client connections |

## Pattern: Typed Query Module

```typescript
interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  currentVersion: string;
  isDeprecated: boolean;
  createdAt: string;
}

async function getSkillBySlug(slug: string): Promise<Skill | undefined> {
  return await sqlReadOnly.get<Skill>(
    'SELECT * FROM "Skill" WHERE slug = $1', slug
  );
}

async function getSkillsByCategory(category: string): Promise<Skill[]> {
  return await sqlReadOnly.all<Skill>(
    'SELECT * FROM "Skill" WHERE category = $1', category
  );
}
```

## PostgreSQL Type Conventions

| Concept | PG type | TypeScript type | Notes |
|---|---|---|---|
| Boolean | BOOLEAN | boolean | Native true/false |
| Date/time | TIMESTAMPTZ | string | pg.types configured to return ISO strings |
| ID | TEXT | string | Use gen_random_uuid()::TEXT or app-generated CUIDs |
| Nullable | column without NOT NULL | `T \| null` | Explicit in both SQL and TS |
| Integer | INTEGER | number | |
| Decimal | REAL / NUMERIC | number | |
| JSON | JSONB | object / string | Use JSONB for queryable JSON |

## Query Conventions

- **Placeholders**: Use `$1, $2, $3...` positional parameters (not `?`)
- **Identifiers**: Quote all camelCase names with double quotes: `"skillId"`, `"createdAt"`
- **Timestamps**: Use `now()` (not `datetime('now')`)
- **Intervals**: Use `now() - interval '30 days'` (not datetime arithmetic)
- **Booleans**: Use native `true`/`false` (not 0/1)
- **Upserts**: Use `INSERT ... ON CONFLICT ... DO UPDATE SET` (not `INSERT OR REPLACE`)

## Anti-Patterns

- **ORM model classes** — adds decorators, metadata, a class hierarchy, and a runtime dependency for something an interface does in zero bytes.
- **Schema-generated types** — if the generated output is wrong or changes unexpectedly, you're debugging someone else's codegen.
- **Eager loading / includes** — hides a JOIN or N+1. Write the JOIN explicitly so the query plan is obvious.
- **Migration DSLs** — `table.addColumn('name', 'varchar(255)')` is just SQL with extra steps. Write the SQL.
- **Unquoted camelCase** — PostgreSQL folds unquoted identifiers to lowercase. Always quote: `"createdAt"`, not `createdAt`.

## Dev Server Sso

# Dev Server — Always Start Mock SSO

The `dev` script must always start both Next.js and the mock SSO server together. Never run Next.js alone as the default dev experience.

## Script Layout

| Script | What it does | When to use |
|---|---|---|
| `bun run dev` | Starts Next.js + mock SSO via `concurrently` | **Default — always use this** |
| `bun run dev:next` | Starts Next.js only (no SSO) | Escape hatch for rare cases (e.g., debugging Next.js startup in isolation) |
| `bun run sso:mock` | Starts mock SSO server only | Escape hatch for debugging SSO in isolation |

## Rules

1. **`dev` = both processes.** The `dev` script in `package.json` must run `concurrently` with both `dev:next` and `sso:mock`. If someone runs `bun run dev`, they get the full local environment including auth.
2. **Never split them by default.** Don't create a `dev` script that only runs Next.js with a separate `dev:sso` that runs both. The combined behavior is the default, not the exception.
3. **Makefile mirrors package.json.** `make dev` calls `bun run dev` (both). `make dev-next` calls `bun run dev:next` (Next.js only). No `make dev-sso` target.
4. **Worktree setup prints `bun run dev`.** The `setup-worktree.sh` output tells users to run `bun run dev`, which starts both processes on the worktree's assigned ports.
5. **`concurrently` is a devDependency.** It must be listed in `devDependencies` in `package.json`.
6. **Port coordination.** The mock SSO server reads `MOCK_SSO_PORT` from the environment (default 4000). Worktrees use `.env.local` to assign unique port pairs (Next.js port + SSO port = Next.js port + 1000).


## Edge Runtime Safety

> Avoid Node.js-only APIs in code reachable from Edge Runtime contexts (middleware, instrumentation, edge API routes) _always-applied_

# Edge Runtime Safety — Learned from runtime crash

`process.pid` was used in `CloudWatchLoggerProvider` to generate a default log stream name. This code was imported by `instrumentation.ts`, which Next.js runs in both the Node.js and Edge runtimes. The Edge Runtime does not provide `process.pid`, causing a crash on every request routed through Edge. The build passed because `next build` doesn't statically analyze all Node.js API usage in Edge contexts — it only catches direct `import` of banned modules, not property access on globals.

## The Rule

Code that is imported (directly or transitively) by any of these files runs in the Edge Runtime and **must not use Node.js-only APIs**:

- `src/middleware.ts`
- `src/instrumentation.ts`
- Any route with `export const runtime = "edge"`

### Banned APIs in Edge-reachable code

| Banned | Edge-safe replacement |
|---|---|
| `process.pid` | `globalThis.process?.pid ?? crypto.randomUUID().slice(0, 8)` |
| `process.cwd()` | Not available — restructure to avoid needing it |
| `process.env.X` | `process.env.X` **is** available in Edge (env vars are the exception) |
| `require()` / `createRequire()` | Use `import` (ESM only in Edge) |
| `fs`, `path`, `child_process`, `net`, `dns`, `os` | Not available — use Web APIs or restructure |
| `node:crypto` (createHash, createHmac) | `crypto` (Web Crypto API): `crypto.subtle.digest()`, `crypto.randomUUID()` |
| `Buffer` | `Uint8Array` + `TextEncoder`/`TextDecoder` |
| `setTimeout`/`setInterval` (long-running) | Available but execution time is capped — avoid long delays |

### Safe patterns

`process.env`, `console.*`, `fetch`, `crypto` (Web Crypto), `URL`, `URLSearchParams`, `TextEncoder`/`TextDecoder`, `Headers`, `Request`, `Response`, `AbortController`, `structuredClone`, `atob`/`btoa`, `queueMicrotask`, `performance.now()`.

## Before editing shared library code

When modifying any file under `src/lib/` that could be imported by middleware or instrumentation:

1. **Trace the import chain** — is this file reachable from `middleware.ts` or `instrumentation.ts`?
2. **Check for Node.js globals** — search for `process.pid`, `process.cwd`, `__dirname`, `__filename`, `Buffer`, `require`
3. **Use optional chaining for `process` properties** — `globalThis.process?.pid` instead of `process.pid`, since `process` itself may not exist in Edge
4. **Test with `process` absent** — unit tests should simulate Edge Runtime by setting `globalThis.process = undefined` and verifying the code still works

## Examples

### Wrong (caused the failure)

```typescript
// src/lib/cloudwatch/provider.ts
export class CloudWatchLoggerProvider implements LoggerProvider {
  constructor(logGroupName?: string, logStreamName?: string) {
    this.logGroupName = logGroupName ?? DEFAULT_GROUP;
    this.logStreamName = logStreamName ?? `server-${process.pid}`;
    //                                              ^^^^^^^^^^^ crashes in Edge Runtime
  }
}
```

### Right (prevents recurrence)

```typescript
export class CloudWatchLoggerProvider implements LoggerProvider {
  constructor(logGroupName?: string, logStreamName?: string) {
    this.logGroupName = logGroupName ?? DEFAULT_GROUP;
    this.logStreamName =
      logStreamName ?? `server-${globalThis.process?.pid ?? crypto.randomUUID().slice(0, 8)}`;
  }
}
```

### Wrong — using node:crypto in Edge-reachable code

```typescript
import { createHmac } from "node:crypto";

function sign(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}
```

### Right — using Web Crypto API

```typescript
async function sign(data: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}
```

## Edge Runtime entry points in this project

| File | Why it runs in Edge |
|---|---|
| `src/middleware.ts` | Next.js middleware always runs in Edge Runtime |
| `src/instrumentation.ts` | `register()` is called in both Node.js and Edge runtimes |

Any module these files import (and any module *those* modules import, transitively) must be Edge-safe.

## Origin

- **Failure**: `process.pid` in `CloudWatchLoggerProvider` crashed at runtime when `instrumentation.ts` loaded it in the Edge Runtime
- **Date**: 2026-03-12
- **Root cause**: Node.js-only API (`process.pid`) used in a module transitively imported by `instrumentation.ts`, which runs in both Node.js and Edge runtimes
- **PR**: [#133](https://github.com/pwc-us-adv-genai-commercial-factory/skills-hub/pull/133)

## Detection Acceleration

Three layers were added to catch this class of failure earlier:

- **Level**: Unit test (editor/CI)
  **What was added**: `Edge Runtime safety` test group in `cloudwatch-provider.test.ts` — simulates `process.pid` being `undefined` and `process` being entirely absent. Fails with a descriptive message if the provider crashes without `process`.
  **Diagnosis time before**: Runtime crash in production/staging with a generic `TypeError`
  **Diagnosis time after**: Immediate test failure with "constructs without error when process.pid is unavailable"

- **Level**: CI
  **What was added**: `bash scripts/smoke.sh --no-build` step in `ci.yml` — boots the production build, health-checks critical routes. Catches any runtime crash that `next build` misses.
  **Diagnosis time before**: Discovered only after deployment or e2e tests
  **Diagnosis time after**: CI fails in the `Smoke test` step with the specific route that crashed

- **Level**: Build
  **What was added**: `scripts/smoke.sh` now exists (was previously a dead reference in `package.json`). Developers can run `bun run smoke` locally before pushing.
  **Diagnosis time before**: No local equivalent existed
  **Diagnosis time after**: `bun run smoke` catches boot failures in ~30 seconds

## Env Pg Url

> Enforce valid PostgreSQL DATABASE_URL in .env and .env.local — prevent stale SQLite URLs from breaking the app _always-applied_

# PostgreSQL DATABASE_URL — Learned from DB migration drift

After migrating from SQLite to PostgreSQL, `.env` retained a stale `file:./dev.db` URL. The `pg` driver, `db-reset.ts`, and every query module silently received an unparseable connection string, producing `TypeError: <url> cannot be parsed` and `database "dev.db" does not exist` errors on fresh start.

## The Rule

`DATABASE_URL` must always be a valid PostgreSQL connection string in every env file (`.env`, `.env.local`, `.env.example`).

### Required format

```
postgresql://<user>:<password>@<host>:<port>/<dbname>
```

### Validation checklist

When editing `.env`, `.env.local`, or `.env.example`:

1. `DATABASE_URL` must start with `postgresql://` or `postgres://` — never `file:`, `sqlite:`, or any other scheme.
2. The database name (path component after the last `/`) must match the expected naming convention: `skills_hub_dev` for the primary worktree, `skills_hub_<branch_slug>` for feature worktrees.
3. The port must match the Docker Compose PostgreSQL port (`5433` by default, not the PostgreSQL standard `5432`).

### When creating a new worktree

`scripts/setup-worktree.sh` generates `.env.local` with the correct `DATABASE_URL` for the branch. Never override it manually with a SQLite URL.

### When `.env.example` changes

If `.env.example` updates `DATABASE_URL` (e.g., new port, new credentials), verify that `.env` and `.env.local` are updated to match. `.env.example` is the source of truth for connection string format.

## Examples

### Wrong (caused the failure)

```env
# Stale SQLite URL from before the PG migration
DATABASE_URL="file:./dev.db"
```

### Right (prevents recurrence)

```env
# PostgreSQL (local Docker Compose instance on port 5433)
DATABASE_URL="postgresql://skills_hub:skills_hub@localhost:5433/skills_hub_dev" # pragma: allowlist secret
```

## Origin

- **Failure**: Fresh-start script failed — `pg-connection-string` threw `TypeError` on `file:./dev.db`, then `db-reset.ts` errored with `database "dev.db" does not exist`
- **Date**: 2026-03-11
- **Root cause**: `.env` retained a SQLite `DATABASE_URL` after the project migrated to PostgreSQL; no validation caught the stale format before the `pg` driver tried to parse it
- **PR**: fix/learn-pg-failures

## Error Transparency

> API routes must return appropriate HTTP error codes on failure — never mask errors as 200 with empty data _always-applied_

# Error Transparency — Learned from silent error swallowing

The `GET /api/feedback` route catches all database errors and returns `{ status: 200, body: { feedback: [], total: 0 } }`. Callers cannot distinguish "no feedback exists" from "the database is down." This pattern was found in multiple locations across the codebase, including grounding verification, companion apps JSON parsing, and MCP popularity recomputation.

## The Rule

API route error handlers must return the correct HTTP status code. Never mask a server-side failure as a successful empty response.

### Status code requirements

| Scenario | Status | Response shape |
|---|---|---|
| Success with data | 200 | `{ data: [...] }` |
| Success with no data | 200 | `{ data: [], total: 0 }` |
| Client error (bad input) | 400 | `{ error: "description" }` |
| Authentication required | 401 | `{ error: "Authentication required" }` |
| Forbidden | 403 | `{ error: "Forbidden" }` |
| Not found | 404 | `{ error: "Not found" }` |
| Rate limited | 429 | `{ error: "Too many requests", retryAfter: "..." }` |
| Server error (DB down, unhandled) | 500 | `{ error: "Failed to ..." }` |

### The pattern to use

```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await fetchFromDb();
    return NextResponse.json({ data });
  } catch (err) {
    console.error("Route description:", err);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 },
    );
  }
}
```

### The pattern to avoid

```typescript
export async function GET(request: NextRequest) {
  try {
    const data = await fetchFromDb();
    return NextResponse.json({ data });
  } catch {
    // WRONG: returns 200 with empty data — caller thinks everything is fine
    return NextResponse.json({ data: [], total: 0 });
  }
}
```

## Silent Catch Classification

Not all `catch` blocks are equal. Use this guide:

| Pattern | Acceptable? | When |
|---|---|---|
| Return 5xx with error message | Yes | API route handlers — always |
| Log and return fallback | Sometimes | Background tasks where the caller can retry (e.g., popularity recompute) |
| Return `false` silently | Rarely | Validation helpers where `false` is a valid semantic return (e.g., fingerprint check) |
| Return empty array/200 | Never | API routes — this hides failures from monitoring and callers |

When a silent catch is intentional (background task, optional enrichment), add a comment explaining why:

```typescript
try {
  await recomputePopularity();
} catch {
  // Non-critical: popularity is eventually consistent. Next request retriggers.
}
```

## Known Violations

| File | Pattern | Fix |
|---|---|---|
| `src/app/api/feedback/route.ts` (GET) | Returns 200 + empty on DB error | Return 500 + error message |
| `src/lib/grounding.ts` (verifyFingerprint) | Returns `false` on HMAC key error | Acceptable — but log a warning |
| `src/mcp/server.ts` (recomputePopularity) | Silent catch on DB timeout | Acceptable — add comment explaining why |
| `src/lib/companion-apps.ts` (parseFeatures) | Returns `[]` on JSON parse error | Acceptable — JSON fallback is intentional |

## Examples

### Wrong (caused the deficiency)

```typescript
// src/app/api/feedback/route.ts — GET handler
export async function GET(request: NextRequest) {
  try {
    const allFeedback = await getAllFeedback();
    const page = allFeedback.slice(offset, offset + limit);
    return NextResponse.json({ feedback: page, total: allFeedback.length });
  } catch {
    return NextResponse.json({ feedback: [], total: 0 });
    //     ^^^^^^^^^^^^^^^^^ 200 status — indistinguishable from empty
  }
}
```

### Right (prevents recurrence)

```typescript
export async function GET(request: NextRequest) {
  try {
    const allFeedback = await getAllFeedback();
    const page = allFeedback.slice(offset, offset + limit);
    return NextResponse.json({ feedback: page, total: allFeedback.length });
  } catch (err) {
    console.error("Failed to fetch feedback:", err);
    return NextResponse.json(
      { error: "Failed to fetch feedback" },
      { status: 500 },
    );
  }
}
```

## Origin

- **Failure**: `GET /api/feedback` returns 200 with empty data on database errors — monitoring sees no failures, callers display "no feedback" instead of an error state
- **Date**: 2026-03-13
- **Root cause**: Catch block uses `NextResponse.json({ feedback: [], total: 0 })` without a status code, defaulting to 200
- **PR**: feat/adversarial-deficiency-tests

## Detection Acceleration

- **Level**: Unit test (CI)
  **What was added**: `src/__tests__/adversarial/contracts/error-transparency.test.ts` and `src/__tests__/adversarial/chaos/error-swallowing.test.ts` — verify that error handlers return 5xx codes and document all known silent-catch locations.
  **Diagnosis time before**: Errors only discoverable through user reports ("I see no feedback") or manual log inspection
  **Diagnosis time after**: Test failure with clear message: "current behavior: DB failure returns 200 with empty array"

## Express Rate Limiting

> All Express routes that perform authorization must use express-rate-limit. Applies when editing Express server files. _globs: `["**/server.ts", "**/server.js", "**/app.ts", "**/app.js", "scripts/**/*.ts"]`_

# Express Rate Limiting

Every Express application in this repository must apply the `express-rate-limit` middleware. CodeQL's `js/missing-rate-limiting` rule flags any route handler that performs authorization without rate limiting as a high-severity security vulnerability — and this check blocks PR merges.

## Required Setup

```typescript
import rateLimit from "express-rate-limit";

const app = express();
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
```

Apply rate limiting **before** any route definitions. The middleware must be from the `express-rate-limit` package — CodeQL does not recognize inline/custom rate limiters.

## Why `express-rate-limit` Specifically

CodeQL's static analysis looks for the `express-rate-limit` package import by name. A hand-rolled Map-based rate limiter with identical behavior will still trigger the alert. This is a tooling constraint, not a technical one.

## Configuration

| Setting | Default | Notes |
|---|---|---|
| `windowMs` | `60_000` (1 min) | Adjust based on expected traffic |
| `max` | `60` | Requests per window per IP |
| `standardHeaders` | `true` | Sends `RateLimit-*` headers |
| `legacyHeaders` | `false` | Disables `X-RateLimit-*` headers |

For dev-only servers (like `scripts/mock-sso/server.ts`), the defaults are fine. For production servers, tune `max` based on expected legitimate traffic patterns.

## Adding `express-rate-limit`

```bash
bun add -d express-rate-limit
```

Use `-d` (devDependency) for dev-only servers. Use `bun add express-rate-limit` (regular dependency) for production servers.

## Fullscreen Overlay Background

> Background layers in fullscreen overlays must cover the entire visible area, not just the viewport _always-applied; globs: `src/components/**/*.tsx, src/app/**/*.tsx`_

# Fullscreen Overlay Background Coverage — Learned from repeated foreword regression

The foreword (love-note) overlay background has regressed to viewport-only coverage **multiple times**. Each time, an edit to the overlay structure or wrapper classes caused the gradient, blur orbs, or base color to stop covering the full scrollable area. The user scrolls past the viewport and sees raw white/transparent background below.

## The Rule

In any `fixed inset-0` overlay with scrollable content, background layers must be **direct children of the fixed wrapper**, positioned with `absolute inset-0`. They must never be placed inside the scrollable content div or on a non-fixed container.

### Required layer architecture

```
┌─ fixed inset-0 overflow-y-auto bg-[base-color] ─────────────┐
│  overscroll-behavior-y: none                                  │
│                                                               │
│  ┌─ absolute inset-0 (gradient) ─────────────────────────┐   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ absolute inset-0 (decorative orbs / particles) ──────┐   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ relative z-10 (scrollable content) ──────────────────┐   │
│  │  my-auto py-16                                         │   │
│  │  ... text, buttons, etc ...                            │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Why this works

- The `fixed inset-0` wrapper is viewport-sized and never moves. It IS the viewport.
- `absolute inset-0` children are positioned relative to the fixed wrapper's padding box — they fill the viewport rectangle and stay pinned there regardless of scroll position.
- The scrollable content (`relative z-10`) slides over the background layers. Because the backgrounds are pinned to the viewport, they always fill the visible area.
- The base `bg-[color]` on the wrapper itself provides a fallback — even if absolute layers somehow fail, the base color covers everything.
- `overscroll-behavior-y: none` prevents mobile rubber-banding from exposing the page behind the overlay.

### The four ways this breaks

| Regression pattern | What happens | Why it happens |
|---|---|---|
| Wrapper changed from `fixed` to `relative`/`min-h-screen`/`h-screen` | Background stops at initial viewport height, white gap below | Developer changes layout without understanding the `fixed` is load-bearing for background coverage |
| Background layers moved inside the content div | Backgrounds scroll with content, leaving gaps at top/bottom during scroll | Refactoring moves elements inside the wrong parent |
| `bg-[base-color]` removed from wrapper | Transparent flash between gradient load and scroll | Style cleanup removes "redundant" background |
| `<html>` background not matched during overlay | Mobile overscroll/rubber-band exposes light `<html>` background behind the dark overlay | `overscroll-behavior` not set, or `document.documentElement.style.backgroundColor` not synchronized |

### Correct pattern (the VideoOnboardingYouTube overlay)

```tsx
// Wrapper: fixed + base color + overflow-y-auto + overscroll prevention
<div
  className="fixed inset-0 z-[9999] flex justify-center overflow-y-auto bg-[#0a0a1a]"
  style={{ overscrollBehaviorY: "none" }}
>

  {/* Background layer 1: gradient — absolute, direct child of fixed wrapper */}
  <div className="absolute inset-0 bg-gradient-to-br from-[#1a0a2e] via-[#16213e] to-[#0a1628]" />

  {/* Background layer 2: decorative blur orbs — absolute, direct child */}
  <div className="absolute inset-0">
    <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl" />
    <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
  </div>

  {/* Background layer 3: particles — absolute, direct child */}
  <div className="absolute inset-0 overflow-hidden">
    {/* particle elements */}
  </div>

  {/* Content: relative, scrolls within the fixed wrapper */}
  <div className="relative z-10 my-auto max-w-3xl px-6 py-16">
    {/* foreword text, buttons, etc. */}
  </div>
</div>
```

### Scroll lock + `<html>` background synchronization

When a dark overlay takes over the screen, the `<html>` element's background must match the overlay's base color. On mobile, overscroll rubber-banding can expose the `<html>` background even when the overlay itself has `overscroll-behavior-y: none` (the browser may still rubber-band the root viewport).

```tsx
// On mount / show:
function lockScroll() {
  document.body.style.overflow = "hidden";
  document.documentElement.style.backgroundColor = "#0a0a1a";
}

// On unmount / dismiss:
function unlockScroll() {
  document.body.style.overflow = "";
  document.documentElement.style.backgroundColor = "";
}
```

Both `lockScroll` and `unlockScroll` must be called in every code path that shows or hides the overlay — mount, dismiss, navigation away, and `useEffect` cleanup.

### Wrong patterns

```tsx
// WRONG 1: wrapper is not fixed — background scrolls away
<div className="min-h-screen bg-[#0a0a1a] overflow-y-auto">
  <div className="absolute inset-0 bg-gradient-to-br ..." />
  <div className="relative z-10">...</div>
</div>

// WRONG 2: gradient is inside the content div — scrolls with content
<div className="fixed inset-0 overflow-y-auto">
  <div className="relative z-10 my-auto py-16">
    <div className="absolute inset-0 bg-gradient-to-br ..." />
    <p>Foreword text...</p>
  </div>
</div>

// WRONG 3: no base color on wrapper — transparent gap possible
<div className="fixed inset-0 overflow-y-auto">
  <div className="absolute inset-0 bg-gradient-to-br ..." />
  <div className="relative z-10">...</div>
</div>

// WRONG 4: min-h-dvh on a fixed element — unnecessary, can confuse layout
<div className="fixed inset-0 min-h-dvh overflow-y-auto bg-[#0a0a1a]">
  ...
</div>

// WRONG 5: no overscroll prevention — rubber-banding reveals page behind
<div className="fixed inset-0 overflow-y-auto bg-[#0a0a1a]">
  ...
</div>
```

## Checklist before modifying any fullscreen overlay

1. Is the outermost wrapper `fixed inset-0`? — Do NOT change this to `relative`, `min-h-screen`, `h-screen`, or any other positioning. Do NOT add `min-h-dvh` (a fixed element is already viewport-sized).
2. Does the wrapper have a solid `bg-[color]` as a fallback? — Never remove it.
3. Does the wrapper have `overscroll-behavior-y: none`? — Prevents rubber-banding on mobile from exposing the page behind the overlay.
4. Are all decorative background layers (`gradient`, `blur`, `particles`) **direct children** of the `fixed` wrapper with `absolute inset-0`? — Never move them inside the content div.
5. Is the content div `relative z-10` (above the backgrounds) and the only non-absolute child? — It must be the only element that scrolls.
6. Does the mount/show logic set `document.documentElement.style.backgroundColor` to match the overlay's base color? — This prevents mobile overscroll from flashing the light page background.
7. Does the unmount/dismiss logic restore `document.documentElement.style.backgroundColor` to `""`? — Failing to restore breaks the page background after the overlay is dismissed.
8. After the change, scroll the overlay on a short viewport (375×667). Does the background fill the entire visible area throughout the scroll, including during overscroll bounce? — If not, the layer architecture is broken.

## Automated Detection

The `e2e/scroll-bg-consistency.spec.ts` test catches background regression by:

1. Scrolling every major route to the bottom and sampling edge-pixel colors at multiple scroll positions
2. For the foreword overlay specifically, verifying that the dark base color (#0a0a1a) is present at all corners throughout the scroll
3. Checking that the `<html>` element's background-color matches the overlay's base color while the overlay is active

Run it with: `bunx playwright test e2e/scroll-bg-consistency.spec.ts`

## Cross-reference

- `fullscreen-overlay-scroll.mdc` — covers the scrollability and centering aspects (overflow-y-auto, my-auto vs items-center)
- `sticky-zindex-hierarchy.mdc` — the overlay uses z-[9999], above all other layers

## Origin

- **Failure**: Foreword background only covered the viewport — scrolling revealed a bare/white area below the initial screen
- **Date**: 2026-03-15 (third occurrence of this class of regression)
- **Root cause**: Edits to the overlay structure displaced background layers from their `absolute inset-0` positions relative to the `fixed` wrapper, causing them to only render within the initial viewport rectangle
- **Prior fixes**: #172 (overflow scrolling), #173 (overflow prevention rule + typography)
- **PR**: docs/foreword-bg-rule

## Detection Acceleration

- **Level**: E2E test (CI)
  **What was added**: `e2e/scroll-bg-consistency.spec.ts` — scrolls every major route and the foreword overlay, sampling background colors at viewport edges to detect gaps, white flashes, or mismatched colors. Also verifies `<html>` background synchronization and `overscroll-behavior` values.
  **Diagnosis time before**: Only discoverable through manual testing on a mobile device with overscroll
  **Diagnosis time after**: Test failure with clear message: "Expected dark background at bottom-right corner after scroll, got rgba(249,250,251,1)"

- **Level**: Editor (this rule)
  **What was added**: Updated checklist includes overscroll prevention, `<html>` background sync, and prohibition of `min-h-dvh` on fixed elements.
  **Diagnosis time before**: Agent adds `min-h-dvh` or removes `overscroll-behavior` without realizing the downstream effects
  **Diagnosis time after**: Rule triggers before the edit is committed — agent sees the checklist items and avoids the mistake

## Fullscreen Overlay Scroll

> Prevent overflow clipping in fullscreen overlays _always-applied; globs: `src/components/**/*.tsx, src/app/**/*.tsx`_

# Fullscreen Overlay Scroll Safety — Learned from foreword content clipping

A fullscreen onboarding overlay used `overflow-hidden` on all phases, including text-heavy screens. On shorter viewports the bottom of the foreword was clipped with no way to scroll. The bug was invisible on tall desktop screens and only surfaced on mobile/tablet heights.

## The Rule

Every `fixed inset-0` overlay that displays dynamic or multi-paragraph content must allow vertical scrolling. Never use `overflow-hidden` on a container whose children might exceed the viewport height.

### Pattern: scrollable overlay with centered content

```tsx
// CORRECT — scrollable wrapper + auto-centering child
<div className="fixed inset-0 z-50 overflow-y-auto bg-black">
  <div className="my-auto flex min-h-dvh items-center justify-center px-6 py-16">
    {/* content that may exceed viewport */}
  </div>
</div>
```

### Why `my-auto` instead of `items-center` on the scroll container

Combining `overflow-y-auto` with `flex items-center` on the **same element** causes a well-known CSS bug: when content exceeds the container, flexbox centers the overflow equally above and below the visible area. The top of the content is clipped because the scrollbar only starts from the container's top edge — it cannot scroll upward into the negative overflow.

The fix: apply `overflow-y-auto` to the outer wrapper **without** `items-center`. Place a child div with `my-auto` inside. `margin: auto` in flexbox centers when there's spare space, but collapses to `0` when the child is larger than the parent — content starts at the top and scrolls naturally downward.

```tsx
// WRONG — top of content clipped when it overflows
<div className="fixed inset-0 flex items-center justify-center overflow-y-auto">
  <div className="max-w-2xl">{longContent}</div>
</div>

// CORRECT — content centers when short, scrolls from top when tall
<div className="fixed inset-0 flex justify-center overflow-y-auto">
  <div className="my-auto max-w-2xl py-16">{longContent}</div>
</div>
```

### When `overflow-hidden` is acceptable

Use `overflow-hidden` only when the content has a **fixed, known size** that is guaranteed to fit the viewport:

- Video players with a constrained `aspect-ratio` and `max-width`
- Single-line confirmation dialogs
- Loading spinners

If content length is dynamic (user-generated text, multi-paragraph prose, animated sequences with varying height), use `overflow-y-auto`.

### Padding for breathing room

Always add vertical padding (`py-12` to `py-16`) to the scrollable content container. This:

1. Keeps content away from the viewport edges on short screens
2. Prevents text from hiding behind fixed-position UI elements (close buttons, progress indicators)
3. Gives visual breathing room that makes the content feel less cramped

## Checklist for fullscreen overlays

When creating or modifying a `fixed inset-0` component:

1. Does any child content have variable or unbounded height? → Use `overflow-y-auto`
2. Is the content centered? → Use `my-auto` on the child, not `items-center` on the scroll container
3. Are there fixed-position elements (close button, skip button)? → Add sufficient `py-*` padding so content doesn't tuck behind them
4. Test at 375×667 (iPhone SE) — the shortest common viewport. If content clips, the overflow strategy is wrong.

## Cross-reference

- `fullscreen-overlay-background.mdc` — covers the background layer architecture (ensuring gradient/blur/particles always fill the visible area during scroll)
- `sticky-zindex-hierarchy.mdc` — z-index assignments for overlays vs headers vs page content

## Origin

- **Failure**: Foreword (love-note phase) text was clipped at the bottom on mobile viewports — no way to scroll to the "Show me" button
- **Date**: 2026-03-14
- **Root cause**: `overflow-hidden` on the `fixed inset-0` wrapper prevented scrolling; content exceeded viewport height on screens shorter than ~800px
- **PR**: fix/foreword-overflow (#172)

## Github Org Url

# GitHub Organization URL

All PwC GitHub links MUST use the `pwc-us-adv-genai-commercial-factory` organization. Never use `pwc-us/` as the org prefix — it is incorrect.

## Canonical Values

| Identifier | Value |
|---|---|
| GitHub org | `pwc-us-adv-genai-commercial-factory` |
| Base URL | `https://github.com/pwc-us-adv-genai-commercial-factory` |
| Skills repo | `pwc-us-adv-genai-commercial-factory/agentos-te-skills` |

## Shared Constants

Import from `src/lib/github.ts` — never hard-code the org or repo slug:

```typescript
import { GITHUB_ORG, GITHUB_BASE_URL, SKILL_REPO, SKILL_REPO_URL } from "@/lib/github";
```

## Rules

1. **Never hard-code `pwc-us/`** anywhere in TypeScript, seed data, or configuration. Always reference the constants in `src/lib/github.ts`.
2. **Seed data** uses the full URL form: `https://github.com/pwc-us-adv-genai-commercial-factory/agentos-te-skills`.
3. **Runtime code** imports the constant rather than constructing the URL from a string literal.
4. **A unit test** (`src/__tests__/github-org.test.ts`) scans all `.ts` and `.tsx` files for stale `pwc-us/` references. It will fail the build if the old org surfaces again.
5. When adding a new PwC repository reference, add it to the seed `repos` array with `owner: "pwc-us-adv-genai-commercial-factory"`.

## Quick Self-Check

Before shipping any code that references GitHub: "Am I using `pwc-us-adv-genai-commercial-factory`, not `pwc-us`?"


## Hover Content Jank

> Prevent layout jank when hover interactions reveal new content _always-applied; globs: `src/**/*.tsx`_

# Hover Content Jank — Learned from layout shifts across multiple components

Multiple components conditionally render DOM elements on hover (`{hovered && <div>}`), causing layout reflows, content pop-in, and visual jank. The PlatformFlywheel mounts a detail block on hover that shifts all content below it. The SkillEvolutionChart mounts inline text that widens its row. The SkillCard tooltip flickers on fast mouse movement across the card grid because there is no hover intent delay.

## The Rules

### 1. Never conditionally render DOM on hover

Content revealed by hover must always exist in the DOM, hidden via `opacity-0`, `invisible`, `scale-0`, or `pointer-events-none`. Toggle visibility with CSS transitions — never mount/unmount React elements in response to `onMouseEnter`/`onMouseLeave`.

```tsx
// WRONG — mounts/unmounts on hover, causes layout reflow
{isHovered && (
  <div className="ml-3 text-xs text-muted">
    {entries.map((e) => <span key={e.type}>{e.count} {e.label}</span>)}
  </div>
)}

// RIGHT — always in DOM, opacity transition, no layout shift
<div
  className={cn(
    "ml-3 text-xs text-muted transition-opacity duration-200",
    isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
  )}
>
  {entries.map((e) => <span key={e.type}>{e.count} {e.label}</span>)}
</div>
```

### 2. Reserve layout space for hover-revealed content

If hover-revealed content occupies flow space (not absolute/fixed positioned), the container must have a fixed height or min-height that accommodates the content. Otherwise, the content appearing will push surrounding elements.

Preferred strategies in order:

1. **Absolute positioning** — tooltip/popover floats above/below the trigger, no layout impact
2. **Fixed-height container** — reserve the space whether content is visible or not
3. **`visibility: hidden`** — element keeps its box model but is invisible (`invisible` in Tailwind)

```tsx
// WRONG — detail block appears and shifts content below
{activeItem && (
  <div className="mt-6 max-w-2xl">
    <p>{activeItem.detail}</p>
  </div>
)}

// RIGHT — container always rendered with fixed height, content fades in
<div className="mt-6 h-20 max-w-2xl">
  <div
    className={cn(
      "transition-opacity duration-200",
      activeItem ? "opacity-100" : "opacity-0"
    )}
  >
    {activeItem && <p>{ITEMS.find(s => s.id === activeItem)?.detail}</p>}
  </div>
</div>
```

### 3. Debounce hover intent for grids and repeated items

When hovering across a row or grid of items that each reveal rich hover content (tooltips, detail panels, stat breakdowns), use the `useHoverIntent` hook with a 100–200ms delay. This prevents rapid state thrashing as the cursor crosses multiple items.

```tsx
import { useHoverIntent } from "@/hooks/useHoverIntent";

function StageGrid({ stages }: Props) {
  const { activeItem, getHandlers } = useHoverIntent<string>(150);

  return (
    <div className="grid grid-cols-6">
      {stages.map((stage) => (
        <button key={stage.id} {...getHandlers(stage.id)}>
          {stage.title}
        </button>
      ))}
    </div>
  );
}
```

When NOT to debounce:
- Single isolated hover targets (one button, one card in isolation)
- Hover effects that only change CSS properties (color, opacity, transform) without state updates
- `group-hover` patterns that use pure CSS and no React state

### 4. Never animate max-height for show/hide

The `max-h-0` to `max-h-[N]` pattern forces layout recalculation every animation frame because the browser must compute the element's actual height at each step. Use `grid-template-rows: 0fr / 1fr` instead — the browser can interpolate the grid track without triggering full layout.

```tsx
// WRONG — layout recalculation every frame
<div className={cn(
  "overflow-hidden transition-all duration-300",
  open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
)}>
  {content}
</div>

// RIGHT — GPU-friendly grid interpolation
<div
  className={cn(
    "grid transition-[grid-template-rows,opacity] duration-300",
    open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
  )}
>
  <div className="overflow-hidden">
    {content}
  </div>
</div>
```

### 5. Use compositor-only properties for hover transitions

Only `opacity` and `transform` (translate, scale, rotate) are handled by the GPU compositor without triggering layout or paint. All other properties (`width`, `height`, `margin`, `padding`, `border-width`, `box-shadow`) trigger layout or paint recalculation.

| Property | Triggers | GPU composited? |
|---|---|---|
| `opacity` | Composite only | Yes |
| `transform` | Composite only | Yes |
| `color`, `background-color` | Paint | No |
| `box-shadow` | Paint | No |
| `width`, `height` | Layout + Paint | No |
| `margin`, `padding` | Layout + Paint | No |

For hover effects, prefer `opacity` and `transform` transitions. Color and shadow transitions are acceptable (paint-only, no layout) but should use specific transition classes, not `transition-all`.

## Known Violations (fixed)

| Component | File | Fix applied |
|---|---|---|
| PlatformFlywheel | `src/components/landing/PlatformFlywheel.tsx` | Always-rendered detail container with opacity/transform transition + useHoverIntent |
| SkillEvolutionChart | `src/components/analytics/SkillEvolutionChart.tsx` | Replaced conditional render with opacity toggle for entry breakdown |
| ConceptContext | `src/components/shared/ConceptContext.tsx` | Replaced max-h accordion with grid-rows-[0fr]/[1fr] |
| SkillCard | `src/components/skills/SkillCard.tsx` | Added transition delay to prevent tooltip flicker |

## Origin

- **Failure**: Hovering icons in the PlatformFlywheel caused visible layout shifts as a detail block mounted below the grid. SkillEvolutionChart bars shifted when hover text appeared inline. Fast mouse movement across SkillCard grids caused tooltip flicker.
- **Date**: 2026-03-16
- **Root cause**: Conditional rendering (`{condition && <div>}`) used for hover-revealed content instead of always-in-DOM with opacity transitions; no hover intent debounce for grid interactions; `max-height` animations triggering layout recalculation every frame.
- **PR**: fix/hover-animation-jank

## Https Dev Server

> Next.js HTTPS dev server configuration — the three-flag requirement _globs: `scripts/dev-with-ports.ts, scripts/lib/https-args.ts, .cursor/skills/start-hub/scripts/start-hub.sh`_

# HTTPS Dev Server — Three-Flag Requirement

Next.js 16 requires **all three** flags to serve HTTPS with custom certificates:

```
--experimental-https
--experimental-https-cert <path>
--experimental-https-key  <path>
```

Passing only `--experimental-https-cert` and `--experimental-https-key` without the base `--experimental-https` flag causes Next.js to **silently fall back to HTTP**. The dev server starts on the configured port, the banner URL says `https://`, but the server actually speaks HTTP — producing `ERR_SSL_PROTOCOL_ERROR` in the browser.

## Shared Utility

All HTTPS arg construction goes through a single function:

```ts
import { getHttpsNextArgs } from "./lib/https-args";

const nextArgs = ["--bun", "next", "dev", "--port", String(port)];
if (HAS_CERTS) {
  nextArgs.push(...getHttpsNextArgs(CERT_PATH, KEY_PATH));
}
```

**Never construct these flags inline.** The shared utility is tested (`src/__tests__/https-args.test.ts`) and guarantees the base flag is always included.

## Automated Guards

| Guard | What it catches | Location |
|-------|----------------|----------|
| `getHttpsNextArgs()` | Impossible to forget `--experimental-https` | `scripts/lib/https-args.ts` |
| Unit test | Args array shape and ordering | `src/__tests__/https-args.test.ts` |
| Config drift TLS handshake check | Server not actually serving TLS | `scripts/check-config-drift.ts` (Check 8, `--live` mode) |

## History

This rule exists because PR #62 added cert/key flags but omitted `--experimental-https`. The bug survived 4 subsequent PRs (#66, #71, #72, #74) that touched the same file. It was only caught when a user reported `ERR_SSL_PROTOCOL_ERROR` after the domain migration to `skills-hub.local`.

## Idempotent Schema

> PostgreSQL schema files must be safe to re-apply. Applies when editing schema.pg.sql or creating migration files. _globs: `["schema.pg.sql", "migrations/**/*.sql"]`_

# Idempotent PostgreSQL Schemas

Every DDL statement in `schema.pg.sql` and migration files must be safe to run multiple times. The schema is applied by both `psql` in CI and by `seed.ts` at runtime — if any statement fails on re-run, CI breaks for every open PR.

## Rules by Statement Type

| Statement | Idempotent Pattern |
|---|---|
| `CREATE TABLE` | `CREATE TABLE IF NOT EXISTS` |
| `CREATE INDEX` | `CREATE INDEX IF NOT EXISTS` |
| `CREATE EXTENSION` | `CREATE EXTENSION IF NOT EXISTS` |
| `CREATE FUNCTION` | `CREATE OR REPLACE FUNCTION` |
| `CREATE TYPE` | Wrap in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` |
| `CREATE POLICY` | Prepend `DROP POLICY IF EXISTS <name> ON "<Table>";` (PG has no `IF NOT EXISTS` for policies) |
| `CREATE TRIGGER` | Prepend `DROP TRIGGER IF EXISTS <name> ON "<Table>";` (PG has no `IF NOT EXISTS` for triggers) |
| `CREATE ROLE` | Wrap in `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '...') THEN CREATE ROLE ...; END IF; END $$;` |
| `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` | Already idempotent (no-op if already enabled) |
| `GRANT` | Already idempotent |

## Why This Matters

The CI pipeline runs `psql -f schema.pg.sql` to set up the database structure, then `seed.ts` re-applies the same schema before inserting data. If any DDL statement is not idempotent, the second application fails and blocks all CI jobs.

## Quick Check Before Committing

Search for bare `CREATE POLICY` without a preceding `DROP POLICY IF EXISTS`:

```bash
rg "^CREATE POLICY" schema.pg.sql | while read -r line; do
  name=$(echo "$line" | awk '{print $3}')
  table=$(echo "$line" | awk '{print $5}')
  rg -q "DROP POLICY IF EXISTS $name ON $table" schema.pg.sql || echo "MISSING: DROP POLICY IF EXISTS $name ON $table"
done
```

If any output appears, add the missing `DROP POLICY IF EXISTS` statement immediately before the corresponding `CREATE POLICY`.

## Image Quality Gate

> Validate image quality and contextual relevance before committing cinema images or changing video IDs _globs: `public/cinema/**, src/app/learn/(cinema)/_shared/cinema-data.ts`_

# Image Quality Gate — Resolution, Sharpness, and Relevance

Every image added to `public/cinema/` and every YouTube `videoId` referenced in `cinema-data.ts` must pass three quality checks before committing: resolution floor, sharpness threshold, and contextual relevance. A fuzzy Star Trek thumbnail that doesn't show Captain Kirk is the class of failure this prevents.

## The Three Checks

### 1. Resolution Floor

| Image source | Minimum resolution | How to verify |
|---|---|---|
| `public/cinema/*.jpg` (local overlays) | 1280 x 720 | `bun run scripts/validate-cinema-images.ts` or `sharp(path).metadata()` |
| YouTube thumbnail (`maxresdefault.jpg`) | 1280 x 720 | HTTP HEAD check — if maxresdefault returns a 120x90 gray placeholder, the video lacks a high-res thumbnail and must be replaced |

If a YouTube video doesn't have a `maxresdefault.jpg` (YouTube returns a small gray placeholder when it's missing), find an alternative clip that does. Never settle for `hqdefault.jpg` (480x360) as the canonical thumbnail.

### 2. Sharpness (Laplacian Variance)

Blurry images have low variance in their Laplacian (second derivative). The validation script computes this:

| Score | Meaning |
|---|---|
| >= 500 | Sharp — crisp, detailed |
| 100–499 | Acceptable — usable for 20% opacity overlays |
| < 100 | Blurry — reject and find a better source |

Run `bun run scripts/validate-cinema-images.ts` to check all images. The script reports per-image scores.

### 3. Contextual Relevance (Vision Check)

This check uses multimodal AI and cannot be automated in CI. The agent performs it at commit time.

**Protocol when adding or changing an image:**

1. **Read the image** using the Read tool (which supports jpeg/png/gif/webp)
2. **Describe what you see**: identify people, setting, objects, movie/show if recognizable
3. **Compare against metadata**: check the entry's `movie`, `scene`, `concept`, and `source` fields
4. **Reject if the primary subject is not clearly identifiable**:
   - If the entry says "Kirk cheats the Kobayashi Maru" and the image doesn't clearly show Kirk → reject
   - If the entry says "The Borg" and the image shows a generic spaceship → reject
   - If the entry says "The Dark Knight" and the image is from a different Batman film → reject
5. **Document the result** in the commit message body: `Vision check: [description of what was verified]`

### When to Run Each Check

| Trigger | Resolution | Sharpness | Relevance |
|---|---|---|---|
| Adding/replacing `public/cinema/*.jpg` | Yes | Yes | Yes |
| Changing a `videoId` in `cinema-data.ts` | Yes (check maxresdefault) | Yes (download and measure) | Yes |
| Routine audit (`bun run scripts/validate-cinema-images.ts`) | Yes | Yes | No (manual) |

## Running the Validation Script

```bash
bun run scripts/validate-cinema-images.ts
```

The script checks all local cinema images and all YouTube thumbnails referenced in `cinema-data.ts`. It reports a table with resolution, sharpness score, and pass/fail status. Non-zero exit code if any image fails.

## Fixing Failures

### YouTube thumbnail has no maxresdefault

1. Search YouTube for an alternative clip of the same scene
2. Verify the alternative has `maxresdefault.jpg`: `curl -sI "https://img.youtube.com/vi/NEW_ID/maxresdefault.jpg" | head -5`
3. Check that the thumbnail isn't the 120x90 gray YouTube placeholder: `curl -s "https://img.youtube.com/vi/NEW_ID/maxresdefault.jpg" | identify -` (should be 1280x720)
4. Update the `videoId` in `cinema-data.ts`

### Local image is blurry or too small

1. Find a higher-resolution source frame from the movie/show
2. Resize to at least 1280x720 (prefer 1920x1080)
3. Save as JPEG with quality >= 80
4. Replace the file in `public/cinema/`

### Image doesn't match its context

1. Read the entry's `movie`, `scene`, and `concept` fields
2. Search for a frame that clearly depicts the described scene
3. The primary subject (character, ship, setting) must be immediately recognizable
4. Prefer iconic frames: Kirk in the captain's chair, the Borg cube, the ferry with Joker

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Using `hqdefault.jpg` because it's "good enough" | 480x360 is visibly pixelated on retina displays | Find a clip with `maxresdefault.jpg` |
| Downloading a random Google Image result | Unknown resolution, potential copyright issues | Use YouTube thumbnails or properly licensed stills |
| Accepting the first search result without vision check | Image may not show the expected subject | Always Read the image and verify content |
| Using a movie poster instead of a scene frame | Posters don't convey the specific scene being discussed | Use an actual frame from the described scene |

## Origin

- **Failure**: `public/cinema/unwinnable-games.jpg` was a fuzzy, low-resolution thumbnail that didn't clearly show Captain Kirk in the Kobayashi Maru scene
- **Date**: 2026-03-16
- **Root cause**: No quality or relevance gate — images were committed without checking resolution, sharpness, or whether the content matched the entry's described scene
- **PR**: fix/cinema-kobayashi-overlays (#197)

## Interactivity Testing

> Every interactive component must have tests covering all exit paths, scroll restoration, and navigation side effects _globs: `**/*.test.tsx`_

# Interactivity Testing — Cover Every Exit Path

Testing interactive components (overlays, modals, onboarding flows, drawers, accordions) for the happy path is not enough. The most dangerous bugs happen on the exit paths that nobody tests.

## The Rule

Every interactive component must be tested for its **complete lifecycle**: mount → all possible interactions → all possible exit paths → cleanup. If a user can reach a state, there must be a test that reaches it and verifies the aftermath.

## Required Test Categories

### 1. Mount state

Verify the component renders correctly and applies any side effects (body scroll lock, focus trap, aria attributes).

### 2. Happy path completion

Test the intended flow end-to-end: user opens overlay → interacts → dismisses via primary CTA → component unmounts cleanly.

### 3. Every exit path

A component can be exited by more than the primary dismiss button. Test all of them:

| Exit path | Example | What to verify |
|---|---|---|
| Primary CTA | "Enter Skills Hub" button | Dismisses, restores state, fires callbacks |
| Close/X button | Top-right X icon | Same as primary CTA |
| Escape key | `keydown` Escape event | Same as primary CTA |
| Skip/shortcut | "Skip intro" link | Same as primary CTA |
| Navigation away | `router.push` from inside the component | Side effects cleaned up before navigation |
| Unmount by parent | Parent conditionally stops rendering the component | Effect cleanups run, no leaked state |
| Browser back/forward | `popstate` event | Component handles or allows gracefully |

### 4. Side effect cleanup

Any side effect applied on mount or during interaction must be verified to be cleaned up on every exit path:

| Side effect | Mount assertion | Cleanup assertion |
|---|---|---|
| `body.style.overflow = "hidden"` | `expect(document.body.style.overflow).toBe("hidden")` | `expect(document.body.style.overflow).toBe("")` |
| Focus trap | `expect(document.activeElement).toBe(firstFocusable)` | Focus returns to trigger element |
| Event listeners | N/A (test via interaction) | No orphaned listeners (test via unmount + interact) |
| Timers | N/A | No pending timers post-unmount |
| `aria-hidden` on siblings | Siblings have `aria-hidden="true"` | `aria-hidden` removed |

### 5. Phase transitions (multi-step flows)

For components with multiple phases/steps (onboarding, wizards, tutorials):

- Test forward progression through every phase
- Test backward navigation if supported
- Test skip/jump if supported
- Test that each phase transition preserves or correctly updates side effects
- Test the boundary between the last interactive phase and cleanup/navigation

### 6. State persistence

If the component writes to `localStorage`, `sessionStorage`, cookies, or URL params:

- Verify writes happen at the correct moment
- Verify reads on re-mount produce the correct state
- Verify clearing storage resets the component

## Unmount Test Template

Every component that applies body-level side effects must include this test pattern:

```tsx
test("cleans up on unmount without user interaction", () => {
  const { unmount } = render(<Component />);
  // Verify side effects are applied
  expect(document.body.style.overflow).toBe("hidden");

  // Simulate abrupt unmount (parent stops rendering, navigation, etc.)
  unmount();

  // Verify all side effects are cleaned up
  expect(document.body.style.overflow).toBe("");
});
```

## When This Applies

- Writing tests for overlays, modals, drawers, sheets, tooltips
- Writing tests for onboarding flows, tutorials, wizards
- Writing tests for any component that uses `document.body.style`, `addEventListener` on `window`/`document`, or `setTimeout`/`setInterval`
- Reviewing test coverage for interactive components

## Relationship to Other Rules

- **`scroll-lock-safety.mdc`** — specifically covers `body.style.overflow` mutations and their required cleanup + tests
- **`responsive-testing.mdc`** — covers viewport-specific testing; interactivity tests should pass on all viewports
- **`bun-testing-best-practices`** skill — covers general test quality principles

## Language Policy

> Enforces Rust + TypeScript as the only two implementation languages. Rust replaces Python for all scripts. _always-applied_

# Language Policy — Rust and TypeScript Only

Every piece of code in this repository must be written in **Rust** or **TypeScript**. No other implementation languages are permitted. Shell scripts (`.sh`) are allowed only as thin wrappers that delegate to a Rust binary or `bun run <script>`.

## Language Selection

| Domain | Language | Why |
|---|---|---|
| Web app (Next.js, React, API routes) | TypeScript | React ecosystem, server components, SSR |
| CLI tools, daemons, performance-critical services | Rust | Memory safety, zero-cost abstractions, single binary deploys |
| Build/automation scripts | Rust (preferred) or TypeScript via `bun run` | Type safety, no runtime deps |
| Database migrations, schema | SQL (not a "language" for this rule) | Direct SQL per `database-direct.mdc` |
| Config files | TOML, JSON, YAML | Standard formats, not executable code |

## Rust Over Python — No Exceptions

When a task could be solved in either Python or Rust, use Rust. This applies to:

- Automation scripts (file processing, data transforms, API calls)
- Background pollers and watchers
- CLI utilities
- Data parsing and validation
- Anything that currently lives in a `.py` file

### Migration Path for Existing Python

Existing Python scripts under `.cursor/skills/` are grandfathered but should be rewritten in Rust when next modified. When touching a Python file:

1. Assess whether the change is trivial (< 30 min to rewrite in Rust)
2. If yes, rewrite the entire script in Rust and delete the `.py` file
3. If no, make the Python change but file a TODO to rewrite

### Why Not Python

- Python requires a runtime and virtual environment on every machine
- No compile-time type safety (mypy is opt-in and incomplete)
- Dependency management fragility (pip, poetry, conda all solve the same problem differently)
- Rust produces a single binary with no runtime deps — simpler to distribute and run

## Script Organization

| Type | Location | Runner |
|---|---|---|
| TypeScript scripts | `scripts/*.ts` | `bun run scripts/<name>.ts` |
| Rust CLI tools | `tools/<name>/` | `cargo build --release` → `tools/<name>/target/release/<name>` |
| Shell wrappers | `scripts/*.sh` | Delegate to Rust binary or `bun run` |

### Rust Script Template

New Rust scripts go in `tools/<name>/`:

```
tools/<name>/
├── Cargo.toml
├── Cargo.lock
└── src/
    └── main.rs
```

Use `clap` (derive API) for argument parsing, `anyhow` for error handling, and `serde` for config/data serialization.

## When to Use Which

| Signal | Use Rust | Use TypeScript |
|---|---|---|
| Needs React/Next.js | | x |
| Runs in the browser | | x |
| API route handler | | x |
| CLI tool or daemon | x | |
| CPU-bound processing | x | |
| Needs single-binary distribution | x | |
| One-off data transform script | x | |
| Interacts heavily with Node ecosystem (npm packages) | | x |

## Forbidden

- Python (`.py`) for new code
- Go, Ruby, Java, C#, or any other language
- Bash scripts longer than 20 lines that aren't wrapping a Rust/TS command
- `npx`/`bunx` to run random CLI tools — prefer a Rust binary or a `bun run` script

## Swift Exception

Swift is permitted exclusively for macOS-native GUI applications (`SkillsHubSetup/`, `apps/l1-triage/`, `DayPlanner/`). These are platform-specific UIs where Swift + SwiftUI is the only reasonable choice. No Swift outside of `.app` bundle projects.

## Macos App Bundle Dmg

> macOS app bundle assembly and DMG installer creation — covers icon inclusion, Finder styling, and quarantine _always-applied_

# macOS App Bundle & DMG Safety — Learned from three failures during DMG pipeline creation

Three failures surfaced during DMG installer implementation: (1) the app icon was missing from the bundle because `make bundle` never copied `.icns` into `Contents/Resources/`, (2) the DMG Finder window closed immediately on open because the AppleScript styling ended with `close`, writing a closed-window state into `.DS_Store`, and (3) `hdiutil create -srcfolder -size` conflicted, producing "no space left" errors.

## The Rules

### 1. App bundles must include every resource referenced by Info.plist

When assembling a `.app` bundle manually (not via Xcode), verify every key in `Info.plist` that references a resource has the corresponding file copied into `Contents/Resources/`:

| Info.plist key | Expected file in Contents/Resources/ |
|---|---|
| `CFBundleIconFile` = `AppIcon` | `AppIcon.icns` |
| `CFBundleIconName` | Matching `.icns` or asset catalog |
| Any custom plist key referencing a filename | That file |

**Checklist after editing `make bundle` or any bundle assembly step:**

1. Read `Info.plist` and list every key that references a resource file
2. For each, verify the Makefile copies it into `$(BUNDLE_DIR)/Contents/Resources/`
3. Run `make bundle && ls -la .build/<App>.app/Contents/Resources/` to confirm

### 2. DMG AppleScript must never end with `close`

The Finder AppleScript that styles the DMG window saves its state into `.DS_Store`. If the script ends with `close`, Finder records "this window should be closed." When a user later opens the DMG, Finder reads the `.DS_Store` and immediately dismisses the window — the user sees a flash and cannot drag the app to Applications.

```applescript
-- WRONG: ends with close — window dismisses on mount
tell disk "MyApp"
    open
    -- ...styling...
    update without registering applications
    delay 2
    close
end tell

-- RIGHT: leave window open — Finder remembers it as open
tell disk "MyApp"
    open
    -- ...styling...
    update without registering applications
    delay 3
end tell
```

The `delay` at the end gives Finder time to write icon positions and background into `.DS_Store` before `hdiutil detach` ejects the volume.

### 3. Never combine `-srcfolder` and `-size` in `hdiutil create`

`hdiutil create -srcfolder` auto-calculates the image size from the source. Adding `-size` overrides that calculation and can produce an image too small for HFS+ overhead, causing "no space left on device."

```bash
# WRONG — -size conflicts with -srcfolder
hdiutil create -srcfolder ./staging -size 23m -format UDRW out.dmg

# RIGHT (auto-sized, read-only) — for one-shot DMGs
hdiutil create -srcfolder ./staging -volname "App" -fs HFS+ -format UDZO out.dmg

# RIGHT (manual size, writable) — for styling before conversion
hdiutil create -volname "App" -fs HFS+ -size 20m -type UDIF -layout NONE rw.dmg
# then mount, copy content in, style, detach, convert to UDZO
```

When you need a writable DMG for Finder styling: create an empty DMG with `-size`, mount it, copy content in, run AppleScript, detach, then `hdiutil convert` to compressed read-only UDZO.

### 4. Strip quarantine after DMG creation

macOS adds `com.apple.quarantine` to files created by tools. This can trigger Gatekeeper warnings when the user opens the DMG. Clear it as the last step:

```bash
xattr -d com.apple.quarantine "$OUTPUT_DMG" 2>/dev/null || true
```

## Examples

### Wrong (caused the failures)

```makefile
# Missing icon — bundle has empty Resources/
bundle: app
	@mkdir -p "$(BUNDLE_DIR)/Contents/Resources"
	@cp .build/debug/CribApp "$(BUNDLE_DIR)/Contents/MacOS/CribApp"
	@cp Resources/Info.plist "$(BUNDLE_DIR)/Contents/Info.plist"
```

### Right (prevents recurrence)

```makefile
# Icon included — matches CFBundleIconFile in Info.plist
bundle: app
	@mkdir -p "$(BUNDLE_DIR)/Contents/Resources"
	@cp .build/debug/CribApp "$(BUNDLE_DIR)/Contents/MacOS/CribApp"
	@cp Resources/Info.plist "$(BUNDLE_DIR)/Contents/Info.plist"
	@cp Resources/AppIcon.icns "$(BUNDLE_DIR)/Contents/Resources/AppIcon.icns"
```

## Origin

- **Failure 1**: Crib.app showed generic icon — `AppIcon.icns` not copied into bundle Resources
- **Failure 2**: DMG Finder window closed immediately — AppleScript `close` wrote closed state to `.DS_Store`
- **Failure 3**: `hdiutil create` failed with "no space left" — `-srcfolder` and `-size` conflict
- **Date**: 2026-03-14
- **Root cause**: Manual app bundle assembly skipped icon; DMG creation AppleScript improperly closed the Finder window; hdiutil flags were incompatible
- **PR**: feat/dmg-installer (crib repo), test/l1-triage-stress (skills-hub)

## Detection Acceleration

- **Level**: Build (Makefile)
  **What was added**: `make bundle` now explicitly copies `AppIcon.icns`. The `test-bundle.sh` integration test validates bundle structure including Resources contents.
  **Diagnosis time before**: App looked wrong in Finder/Dock — no error message, only visual inspection revealed the missing icon
  **Diagnosis time after**: `make test-bundle` fails with a clear message if Resources/ is missing expected files

- **Level**: Build script
  **What was added**: `create-installer-dmg.sh` uses the correct `hdiutil` flag combinations and omits `close` from the AppleScript. The script is reusable across projects.
  **Diagnosis time before**: DMG appeared to work (`hdiutil verify` passed) but the Finder window closed on open — only manual testing revealed it
  **Diagnosis time after**: The script is tested by `make dmg && open .build/<App>.dmg` — if the window stays open, the DMG is correct

## Macos App Releases

> Release framework for macOS apps distributed as DMG installers via GitHub Releases _globs: `apps/*/Makefile, apps/*/project.yml, apps/*/scripts/release.sh, .github/workflows/release-*.yml, .github/workflows/bump-*.yml`_

# macOS App Releases — Version Bumping & DMG Distribution

macOS apps in `apps/` are distributed as DMG installers via GitHub Releases. Each app has its own tag namespace, version sources, and release workflow. This rule captures the framework so new apps follow the same pattern.

## Version Source of Truth

Each app stores its version in two files that must stay in sync:

| File | Field | Purpose |
|---|---|---|
| `project.yml` | `MARKETING_VERSION` | Xcode build setting — user-visible version (semver) |
| `project.yml` | `CURRENT_PROJECT_VERSION` | Xcode build number — monotonically increasing integer |
| `Makefile` | `VERSION` | Used by `make dmg` and `make release` for artifact naming |

The `bump-version.sh` script updates all three atomically. Never edit one without the others.

## Tag Namespace

Each app uses a prefixed tag to avoid collisions with the main Skills Hub releases:

| App | Tag pattern | Example |
|---|---|---|
| L1 Triage | `l1-triage-v*` | `l1-triage-v1.2.0` |
| Skills Hub Setup | `v*` | `v0.1.0` |
| (new app) | `<app-slug>-v*` | `day-planner-v1.0.0` |

The release workflow filters on its app's tag pattern. The bump workflow creates the tag after committing the version update, which triggers the release workflow automatically.

## Workflow Chain

```
bump-<app>.yml (manual dispatch)
  ├── reads current version from project.yml
  ├── computes new version (major/minor/patch)
  ├── updates project.yml + Makefile
  ├── commits: "chore(<app>): bump version to X.Y.Z"
  ├── tags: <app>-vX.Y.Z
  ├── pushes commit + tag
  ├── builds the app (xcodebuild)
  ├── creates DMG (create-installer-dmg.sh)
  └── publishes GitHub Release with DMG attached

release-<app>.yml (tag push)
  └── same build + DMG + release steps (for tag-push triggers)
```

The bump workflow is the primary entry point — it handles the full lifecycle. The release workflow exists as a fallback for manual tagging.

## Adding a New macOS App

When adding a new macOS app to `apps/`:

1. **Create `project.yml`** with `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in the target settings
2. **Create `Makefile`** with `VERSION`, `build`, `dmg`, `release`, and `publish` targets
3. **Create `scripts/bump-version.sh`** — copy from L1 Triage and adjust the sed patterns if the project.yml structure differs
4. **Create `scripts/create-installer-dmg.sh`** or reuse the shared one at `scripts/create-installer-dmg.sh`
5. **Create `.github/workflows/bump-<app>.yml`** — copy from `bump-l1-triage.yml`, update the tag prefix and working directory
6. **Create `.github/workflows/release-<app>.yml`** — copy from `release-l1-triage.yml`, update the tag filter

## Version Bumping Rules

1. **Patch** (`1.0.0` → `1.0.1`): bug fixes, minor UI tweaks, no new features
2. **Minor** (`1.0.0` → `1.1.0`): new features, non-breaking changes
3. **Major** (`1.0.0` → `2.0.0`): breaking changes, major redesigns, config format changes

The build number (`CURRENT_PROJECT_VERSION`) auto-increments based on git commit count — never set it manually.

## Dry Run

Both the bump workflow and the local script support dry runs:

- **CI**: Check the "Dry run" checkbox in the workflow dispatch UI. Shows what would change in the job summary without committing.
- **Local**: Run `bash scripts/bump-version.sh patch` and inspect the output before committing. The script prints the changes but does not `git commit` — you do that manually.

## DMG Creation

Follow the rules in `macos-app-bundle-dmg.mdc`:

- Never combine `-srcfolder` and `-size` in `hdiutil create`
- Never end the AppleScript with `close`
- Strip quarantine after creation
- The shared `create-installer-dmg.sh` handles all of this correctly

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Editing `MARKETING_VERSION` without updating `Makefile` | DMG filename mismatches the app version | Use `bump-version.sh` |
| Manual `git tag` without bumping version files | Tag points to old version in project.yml | Use the bump workflow or script |
| Using the main `v*` tag namespace for app releases | Collides with Skills Hub releases, triggers wrong workflow | Use `<app>-v*` prefix |
| Setting `CURRENT_PROJECT_VERSION` manually | Risks non-monotonic build numbers | Let the script compute from git commit count |
| Running `make release` without checking `gh auth status` | Release creation fails silently | The release script checks auth in preflight |

## Marketing Copy — Audience Positioning

> Positioning guide for any user-facing or marketing copy in Skills Hub _always-applied_

# Marketing Copy — Audience Positioning

Skills Hub serves all PwC professionals, not just engineers. Every piece of user-facing copy must reflect this.

## Rules

1. **Never frame Skills Hub as an engineering tool.** It is an AI skills platform for tax, audit, advisory, consulting, risk, and technology professionals alike.
2. **Don't assume technical literacy.** Avoid jargon like "MCP server," "stdio transport," or "slug" in any copy a user would read. Translate to plain language: "AI-powered tools," "install this skill," "browse the catalog."
3. **Lead with the workflow, not the technology.** Users care about what a skill does for their work — automating document reviews, generating reports, triaging tickets — not how it's implemented.
4. **Use role-diverse examples.** When copy lists use cases or personas, always include at least one non-engineering example (e.g., "an audit manager reviewing workpapers" or "a tax associate generating client memos").
5. **Hero and landing page copy must be domain-neutral.** No hero text should mention "developers," "engineers," or "coding" without equally representing other functions.

## Quick Self-Check

Before shipping any UI text, heading, or description, ask: "Would a senior manager in Advisory understand this and feel like it's for them?" If not, rewrite it.

## MCP Server Pattern

> MCP server patterns — stdio server alongside REST API _globs: `src/mcp/**`_

# MCP Server Pattern

The project runs a standard MCP server in parallel with the Next.js REST API. Both expose the same data through different transports: HTTP for the web UI, stdio for AI agents.

## Architecture

```
┌─────────────┐    stdio     ┌──────────────┐
│ Cursor / AI │◄────────────►│ src/mcp/     │
│   client    │              │ server.ts    │──┐
└─────────────┘              └──────────────┘  │  ┌──────────┐
                                               ├─►│ lib/db   │
┌─────────────┐    HTTP      ┌──────────────┐  │  │ lib/skills│
│  Browser    │◄────────────►│ app/api/     │──┘  └──────────┘
└─────────────┘              └──────────────┘
```

Both sides share `lib/db`, `lib/skills`, and `types/`. No duplication.

## Rules

1. **Use `@modelcontextprotocol/sdk`** — the official MCP SDK with stdio transport. No browser-only solutions (WebMCP, etc.) that couple AI tooling to the web app.

2. **Direct database access** — MCP tools query SQLite directly through `lib/skills.ts`, not via HTTP round-trips to the API. The server runs in the same process as the database.

3. **One tool per operation** — each tool maps to a single user intent: search, get detail, list categories, install, changelog. Keep tools focused.

4. **Return JSON text content** — tool handlers return `{ content: [{ type: "text", text: JSON.stringify(data) }] }`. This is the standard MCP response shape.

5. **Validate inputs with Zod** — the SDK uses Zod schemas for tool input validation. Match the schemas to what the corresponding API routes accept.

6. **Error responses use `isError`** — when a tool can't fulfill a request (e.g., skill not found), return `isError: true` with a human-readable message.

## Running

- Dev: `npm run mcp:dev` (or `npx tsx src/mcp/server.ts`)
- Cursor config: `.cursor/mcp.json` points to the server
- The MCP server and `next dev` run as separate processes — start both during development

## Adding a New Tool

```typescript
server.tool(
  "tool_name",
  "Description of what this tool does and when to use it",
  { param: z.string().describe("What this param is") },
  async ({ param }) => {
    const result = await someQuery(param);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);
```

When adding a new API route, consider whether it should also be an MCP tool. If the data is useful to an AI agent, add both.

## Media Interactivity

> Every media element that looks interactive must BE interactive — no play-button thumbnails that open new tabs. _always-applied; globs: `"src/**/*.tsx", "src/**/*.ts", "e2e/**/*.ts"`_

# Media Interactivity — If It Looks Playable, It Plays Inline

Media elements must match user expectations. A play button means "play here." A thumbnail means "this content lives on this page." If an element has a play affordance (icon, overlay, hover effect suggesting video), it must render an inline player — never navigate to an external page.

## The Rule

Every media element on the site must satisfy one of two conditions:

1. **Interactive inline** — the media plays, expands, or displays within the current page (iframe embed, `<video>`, lightbox, image gallery)
2. **Plainly a link** — styled as a text link with no play affordance, no thumbnail, no hover effects that suggest media playback

There is no third option. A thumbnail with a play button that opens YouTube in a new tab violates both conditions — it looks interactive but isn't.

## Specific Patterns

### YouTube Videos

Always use the `YouTubeEmbed` component (`src/components/YouTubeEmbed.tsx`), never an `<a>` tag to `youtube.com/watch`:

```tsx
// CORRECT — inline embed
<YouTubeEmbed videoId="LJS7Igvk6ZM" title="Description" />

// WRONG — external link with play thumbnail
<a href="https://www.youtube.com/watch?v=LJS7Igvk6ZM" target="_blank">
  <img src="thumbnail.jpg" />
  <PlayIcon />
</a>
```

### HTML5 Video

Use `<video>` with controls or a custom player UI. Never link to a video file with `target="_blank"`.

### Images with Play Overlays

A play icon overlay on an image means one of:
- Clicking reveals an inline `<video>` or iframe player (ProofOfExecution pattern)
- Clicking navigates to a detail page where the video plays inline

It must never mean "open this in a new tab."

### Audio

Same principle — embed an `<audio>` player or use a custom player component. Never link to an audio file externally.

### PDFs and Documents

Render inline with an iframe viewer or embed, or use a clear download link styled as a link (not as a document preview with an "open" affordance).

## Enforcement

Three layers prevent violations:

1. **This rule** — agents and humans follow it during authoring
2. **`e2e/media-audit.spec.ts`** — Playwright test crawls every route and flags:
   - `<a target="_blank">` wrapping images or play icons
   - Play icon elements (lucide `Play`, custom SVG) inside `<a>` tags that navigate away
   - `<img>` tags with YouTube thumbnail URLs not inside an embed component
   - `<iframe>` elements without accessible titles
3. **`tests/dom/media-utils.ts`** — unit test utility `assertNoExternalMediaLinks` for component-level checks

## When You Can't Embed

If licensing, technical constraints, or third-party restrictions prevent inline embedding:

1. Remove all play affordances (no play icon, no thumbnail, no hover effects suggesting playback)
2. Use a plain text link: `<a href="...">Watch on YouTube →</a>`
3. Document the constraint in a code comment

The visual contract is: play buttons play. Links link. Never mix them.

## CSP Requirements

When adding a new media source, update `next.config.ts` CSP:
- `frame-src` for iframe embeds
- `script-src` for player API scripts
- `img-src` for thumbnails
- `media-src` for audio/video if served from external CDN

## Merge Main Before Push

> Merge main into feature branches before pushing to catch drift from refactors, renames, and schema changes. _always-applied_

# Merge Main Before Push

Before pushing a feature branch, always merge `origin/main` into it and verify the build still succeeds. Refactors on main (component reorganizations, import path changes, schema migrations) silently break feature branches that haven't rebased.

## Why This Exists

When main reorganizes components into new folder structures (e.g., `@/components/UsageStats` → `@/components/analytics/UsageStats`), any feature branch still using the old import paths will fail to build in CI. The branch looks fine locally because the developer hasn't pulled main, but CI builds against the merged result and fails.

This pattern also catches:
- Schema changes that require seed updates
- Deleted or renamed exports
- New dependencies added on main that a branch needs
- Merge conflicts that block CI entirely (GitHub skips checks on conflicting PRs)

## Workflow

Before every `git push` on a feature branch:

```bash
git fetch origin main
git merge origin/main --no-edit
# If conflicts arise, resolve them
bun run build   # Verify the merged result compiles
git push
```

If the build fails after merging main, fix the issues before pushing. Common fixes:
- Update import paths to match main's component organization
- Add missing dependencies from main
- Resolve TypeScript errors from renamed types or interfaces

## When Conflicts Arise

If `git merge origin/main` produces conflicts:
1. Resolve each conflict, preferring main's version for infrastructure changes (imports, config, schema) and the branch's version for feature logic
2. Run `bunx biome check --write` on all conflicted files
3. Run `bun run build` to verify
4. Commit the merge resolution

## Exception

Skip this step only when:
- The branch was created from main within the last hour AND no PRs have merged since
- The push is a force-push for an interactive rebase that already incorporated main

## Naming Conventions

> Enforce consistent repo naming conventions _always-applied_

# Naming Conventions

Use these naming conventions for all new files and folders, and prefer aligning renamed paths to these standards when touching existing structure.

- Use lowercase `kebab-case` for folder names and most filenames.
- Avoid spaces, underscores, and mixed casing in paths.
- Keep names short but descriptive; prioritize domain intent over implementation detail.

## Folder Standards

- Place runnable services/apps under `apps/`.
- Place shared libraries under `packages/`.
- Place non-runtime docs under `docs/`.
- Discovery/research folders live under `docs/discovery/` and must end with `-discovery`.

## App Naming

- Prefer `<domain>-<type>` when practical (for example: `orders-api`, `labor-tracker-web`).
- Keep well-known conventional names when clearer (`api`, `web`).
- For sidecars, use `<domain>-sidecar` or `sidecar-<domain>` and stay consistent across the repo.

## Examples

- Good: `docs/discovery/inventory-discovery`
- Good: `apps/orders-api`
- Avoid: `InventoryDiscovery`, `labor_tracking`, `my app`

## Neat Queue

> Background conflict resolution — poll open PRs for merge conflicts and spawn subagents to resolve them _always-applied_

# Neat Queue — Background Conflict Resolution

At the **start of every agent session** that will produce code changes (not read-only Q&A), and again **after every `git push`**, spawn a background subagent to detect and resolve merge conflicts across open PRs.

## Trigger

1. **Session start**: After setting up the worktree and before starting the primary task, launch a `generalPurpose` subagent with the prompt below.
2. **Post-push**: After any `git push` (which may have introduced new conflicts on other branches), launch the same subagent.

The subagent runs in parallel with the primary work — it should not block the main task.

## Subagent Prompt

Launch with `subagent_type: "generalPurpose"` and this prompt (fill in `{owner/repo}`):

```
Read the skill at .cursor/skills/neat-queue/SKILL.md, then:

1. Run: bash .cursor/skills/neat-queue/scripts/detect-conflicts.sh {owner/repo}
2. If no conflicts found, report "No conflicting PRs" and stop.
3. For each conflicting PR (up to 3), follow the full resolution workflow in the skill:
   - Fetch and attempt local merge to surface conflict markers
   - Analyze each hunk using the decision framework (branch wins / base wins / compromise / flag for human)
   - If NEAT_QUEUE_DRY_RUN is true (default), report what you would do without pushing
   - If NEAT_QUEUE_DRY_RUN is false, validate with tests and push the resolution
4. Return a summary: which PRs were checked, which had conflicts, what resolution was chosen per file, and whether anything was flagged for human review.
```

## Cadence

| Event | Action |
|---|---|
| Agent session starts (code-producing) | Spawn subagent once |
| After `git push` | Spawn subagent once |
| Subagent reports conflicts resolved | No re-check needed this session |
| Subagent reports human-review flags | Notify user via `hooks/notify.sh` |

Do not poll in a loop — one check per trigger event is sufficient.

## Opting Out

Set `alwaysApply: false` in this rule's frontmatter to disable background polling. The skill at `.cursor/skills/neat-queue/SKILL.md` remains available for manual invocation.

## Skill Reference

See `.cursor/skills/neat-queue/SKILL.md` for the full conflict detection, analysis, and resolution workflow.

## Notfound Streaming

# notFound() and Streaming — 404 Status Caveat

When any route in the rendering chain has a `loading.tsx` file, Next.js wraps the page in a Suspense boundary and **streams** the response. The HTTP status code (200) is sent with the initial shell *before* the page component runs. If the page later calls `notFound()`, the not-found UI renders correctly but the **HTTP status remains 200**, not 404.

This affects any dynamic route whose parent chain includes a `loading.tsx` — even the root `src/app/loading.tsx` propagates Suspense to all child routes.

## Rules

1. **Test not-found behavior by asserting UI content, not HTTP status.** For page-level routes with streaming, the HTTP status is unreliable. Assert the not-found heading and navigation elements instead:
   ```typescript
   await page.goto("/skills/nonexistent-slug");
   await expect(page.locator("h1")).toContainText("Page not found");
   ```
2. **API routes CAN assert HTTP 404.** API routes don't use Suspense/streaming, so `expect(response.status()).toBe(404)` is correct for `/api/skills/:slug`.
3. **Always call `notFound()` in the page component** even though the HTTP status is 200. The not-found UI still renders correctly for the user.
4. **Do not add `loading.tsx` to `[slug]` directories.** While the parent loading.tsx already causes streaming, a local one adds unnecessary Suspense nesting and a misleading skeleton for routes that should show not-found.

## Affected Routes

| Route | Has notFound()? | Test strategy |
|---|---|---|
| `/skills/[slug]` | Yes | Assert "Page not found" text |
| `/rules/[slug]` | Yes | Assert "Page not found" text |
| `/personas/[id]` | Yes | Assert "Page not found" text |
| `/api/skills/[slug]` | Yes (JSON 404) | Assert HTTP 404 status |
| `/api/rules/[slug]` | Yes (JSON 404) | Assert HTTP 404 status |


## Notifications

> Notification conventions for agent sessions and background pollers _always-applied_

# Notifications

There are two types of notification. Pick the right one based on whether the user needs to do something. Both generate an HTML status report at `~/.cursor/agent-status.html` that opens when the notification is clicked.

## Action Required (sets marker)

Use when you need the user to review, choose, or respond before you can continue.

```
hooks/notify.sh "Specific action — e.g. review PR summary, choose option A or B"
```

With optional context flags:
```
hooks/notify.sh "Review PR summary" --pr "https://github.com/org/repo/pull/42" --action "Approve or request changes"
```

When the user responds, clear the marker:
```
hooks/notify.sh --clear
```

**When to use:**
- When you ask a question and are waiting for an answer
- When you present options and need the user to choose
- When something failed and needs the user's attention
- When work is done but the user must review/approve before next steps (e.g., PR summary ready to submit)

## Done (no marker)

Use when work is finished and the user doesn't need to do anything — just an FYI.

```
hooks/notify.sh --done "Build passed, changes pushed to origin"
```

With optional context flags:
```
hooks/notify.sh --done "All checks passed, pushed to feat/my-branch" --pr "https://github.com/org/repo/pull/42" --action "Merge when ready"
```

**When to use:**
- After completing all tasks in a multi-step request where no review is needed
- After a long-running command finishes with a passing result (build, test suite, deploy)
- After finishing a todo list where the result is unambiguous

## Optional Flags

| Flag | Description | When to pass |
|---|---|---|
| `--pr URL` | PR URL — renders as a clickable button in the report | Always, when a PR exists for the current branch |
| `--action TEXT` | Next-action hint — renders as italic guidance in the report | When the user needs to do something specific |

Always pass `--pr` if a PR exists for the current branch. The report is much more useful with a direct link.

## Notification Message Content

Every notification MUST explain what happened. Never send vague messages.

Good examples:
- `"PR summary saved to clipboard — review and submit at github.com/..."`
- `"3 test failures need your attention — see terminal output"`
- `"All checks passed, pushed to feat/my-branch"`

Bad examples:
- `"Task complete"` — what task? What do I do now?
- `"Waiting for input"` — input on what?
- `"Done"` — done with what?

## Click-to-Open Status Report

Every notification generates an HTML report under `~/.cursor/notifications/` with the git hash and epoch timestamp in the filename:

```
~/.cursor/notifications/agent-status-<hash>-<epoch>.html
```

A symlink at `~/.cursor/agent-status.html` always points to the latest report. When `terminal-notifier` is installed, clicking the notification opens the versioned report directly.

The report includes:
- **Type badge**: Action Required (amber), Done (green), Error (red), Session Ended (blue)
- **Hero message**: The notification text, prominently displayed
- **PR button**: Direct link to the pull request (when `--pr` is passed)
- **Git context**: Branch, worktree path, recent commits, diff stat vs main
- **Footer**: Git short hash and filename for traceability

### Notification History

Previous reports are preserved in `~/.cursor/notifications/`. Each filename encodes the git commit it was generated from, making it easy to correlate notifications with specific commits:

```bash
ls ~/.cursor/notifications/
# agent-status-abc1234-1741500000.html
# agent-status-abc1234-1741500300.html
# agent-status-def5678-1741501200.html
```

To clean up old reports:

```bash
find ~/.cursor/notifications/ -name "agent-status-*.html" -mtime +7 -delete
```

### Prerequisite: terminal-notifier

```bash
brew install terminal-notifier
```

Without `terminal-notifier`, notifications fall back to `osascript` (banner only, no click action). The report is still generated — open `~/.cursor/agent-status.html` manually (symlink to latest).

## How It Works

```
hooks/notify.sh
  ├── hooks/generate-status-report.sh
  │     ├── writes ~/.cursor/notifications/agent-status-<hash>-<epoch>.html
  │     ├── symlinks ~/.cursor/agent-status.html → latest report
  │     └── outputs versioned path to stdout
  └── terminal-notifier -open file://<versioned-report-path>
       (fallback: osascript display notification)
```

The `.cursor/hooks/stop-notify.sh` lifecycle hook uses the same report generator for session-end notifications, auto-detecting PR URLs via `gh pr view`.

## Background Poller Notifications

Long-running background pollers (e.g., `poll_children.py --watch`) send macOS notifications directly via `terminal-notifier` (with `osascript` fallback) and generate their own domain-specific HTML reports:

| Event | Notification |
|----|----|
| New tickets discovered | Immediately — include count and ticket IDs |
| Stale tickets detected (but no new bugs) | Immediately — include count and staleness threshold |
| No new tickets AND no stale tickets | **Once per hour** (heartbeat) — confirm poller is healthy with active ticket count |

Heartbeat cadence: the poller tracks `_last_heartbeat` in memory and only fires when >= 60 minutes have elapsed since the last heartbeat notification. New-ticket and stale-ticket notifications reset the need for a heartbeat (the user already knows the poller is alive).

## When NOT to Notify

- Mid-task between your own tool calls (don't spam)
- When you are about to immediately continue with more work
- For simple single-turn Q&A that doesn't require approval

## Outbound Url Safety

> Prevent SSRF and URL bypass vulnerabilities in outbound HTTP requests and URL hostname checks _always-applied_

# Outbound URL Safety — Learned from CodeQL SSRF and URL substring alerts

12 CodeQL alerts surfaced across 6 files: 4 critical SSRF findings (CWE-918) where `fetch()` URLs were built via template literal interpolation, and 6 high-severity URL substring sanitization findings (CWE-020) where `href.includes("youtube.com")` was used instead of proper hostname parsing. Neither class was exploitable in practice (the SSRF targets were always `api.github.com` with HMAC-verified payloads; the substring checks were test assertions, not security gates), but both represent patterns that become exploitable if copied into less constrained contexts.

## The Rules

### 1. Always use `new URL()` for outbound fetch requests

Never build a fetch URL via template literal interpolation. Use the `URL` constructor with a hardcoded origin as the base.

```typescript
// WRONG — interpolation allows path traversal, hostname injection
const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/check-runs`, opts);

// WRONG — concatenation, same problem
const res = await fetch("https://api.github.com" + path, opts);

// RIGHT — URL constructor validates structure; encodeURIComponent prevents traversal
const url = new URL(
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`,
  "https://api.github.com",
);
const res = await fetch(url.href, opts);
```

### 2. Validate path segments before constructing URLs

When path segments come from external sources (webhook payloads, database rows, user input), validate them before use. GitHub owner/repo names match `[a-zA-Z0-9_.-]+`.

```typescript
const GITHUB_API_SLUG_RE = /^[a-zA-Z0-9_.-]+$/;

function assertGitHubSlug(value: string, label: string): void {
  if (!GITHUB_API_SLUG_RE.test(value)) {
    throw new Error(`Invalid GitHub ${label}: ${value}`);
  }
}
```

For numeric IDs (installation IDs, PR numbers), validate type and range:

```typescript
if (!Number.isInteger(installationId) || installationId <= 0) {
  throw new Error(`Invalid installation ID: ${installationId}`);
}
```

### 3. Pin the origin when accepting a path parameter

When a function accepts a relative path and builds a URL from it, verify the constructed URL's origin matches the expected value:

```typescript
async function githubFetch<T>(path: string, token: string): Promise<T> {
  const url = new URL(path, "https://api.github.com");
  if (url.origin !== "https://api.github.com") {
    throw new Error(`Refusing request to non-GitHub origin: ${url.origin}`);
  }
  return fetch(url.href, { headers: { Authorization: `Bearer ${token}` } });
}
```

### 4. Never use `includes()` for hostname checks

String `.includes()` matches anywhere in the URL — a path segment, query parameter, or fragment can contain the hostname string and bypass the check.

```typescript
// WRONG — "youtube.com" could appear in the path: http://evil.com/youtube.com
if (href.includes("youtube.com")) { ... }

// WRONG — still matches substrings like "evil-youtube.com"
if (href.includes("youtube.com/watch")) { ... }

// RIGHT — parse the URL, check the hostname with exact or suffix match
try {
  const url = new URL(href, "https://placeholder.invalid");
  const host = url.hostname;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) { ... }
} catch { /* malformed URL — reject */ }
```

Use `endsWith()` on the parsed hostname to allow subdomains (`www.youtube.com`) while rejecting lookalikes (`evil-youtube.com`).

### Quick Reference: URL Validation Patterns

| Scenario | Pattern |
|---|---|
| Outbound API call with fixed origin | `new URL(path, "https://api.example.com")` + origin check |
| Path segments from external input | `encodeURIComponent()` + regex validation |
| Numeric IDs in URL paths | `Number.isInteger()` + range check |
| Checking if URL belongs to a platform | `new URL(href).hostname` + exact/suffix match |
| Building query strings | `url.searchParams.set(key, value)` — never interpolate |

## Origin

- **Failure**: CodeQL identified 4 SSRF alerts (critical) and 6 URL substring sanitization alerts (high) across `github-app.ts`, `sync.ts`, webhook route, `media-audit.spec.ts`, and `media-utils.ts`
- **Date**: 2026-03-16
- **Root cause**: URLs built via template literal interpolation instead of `URL` constructor; hostname checks used `includes()` instead of parsed hostname matching
- **PR**: fix/codeql-security-fixes (#213)

## Detection Acceleration

- **Level**: CI (CodeQL)
  **What was added**: CodeQL was already configured in `.github/workflows/codeql.yml`. The rules `js/request-forgery` and `js/incomplete-url-substring-sanitization` detected all 10 instances. No new detection was needed — the gap was in prevention (no Cursor rule existed to guide agents away from these patterns).
  **Diagnosis time before**: CodeQL alerts sat open for days because no rule prevented the patterns from being introduced
  **Diagnosis time after**: This Cursor rule fires at authoring time, preventing the pattern before code is written

- **Level**: Editor (this rule)
  **What was added**: This always-applied rule instructs agents to use `URL` constructor and hostname parsing. Agents will never introduce interpolated fetch URLs or `includes()` hostname checks.
  **Diagnosis time before**: Pattern introduced → pushed → CodeQL runs → alert appears → manual triage
  **Diagnosis time after**: Pattern prevented at authoring time — no alert generated

## Package Manager

> Always use bun as the package manager — never npm, yarn, or pnpm _always-applied_

# Package Manager: bun

Use `bun` for all package management and script execution across every project. Never use `npm`, `yarn`, or `pnpm`.

| Task | Command |
|---|---|
| Install dependencies | `bun install` |
| Add a package | `bun add <package>` |
| Add a dev dependency | `bun add -d <package>` |
| Remove a package | `bun remove <package>` |
| Run a script | `bun run <script>` |
| Execute a binary | `bunx <binary>` (not `npx`) |

The lockfile is `bun.lock` (not `bun.lockb`, not `package-lock.json`).

## Plan Versioning

> All plans must be committed to the plans/ folder and version-controlled with an associated PR _always-applied_

# Plan Versioning — Plans Are Version-Controlled Artifacts

Every plan the agent produces — architecture proposals, migration strategies, implementation roadmaps, spike findings — MUST be committed to the `plans/` folder and associated with a pull request. Plans are not ephemeral chat artifacts; they are versioned documents that can be reviewed, referenced, and diffed.

## Workflow

1. **Write the plan** to `plans/<slug>.md` using kebab-case naming (e.g., `plans/auth-migration.md`, `plans/mcp-server-redesign.md`).
2. **Include YAML frontmatter** with metadata:
   ```yaml
   ---
   title: Short descriptive title
   status: draft | proposed | accepted | superseded
   created: 2026-03-10T14:00:00
   updated: 2026-03-10T14:00:00
   pr: ""
   supersedes: ""
   ---
   ```
3. **Commit the plan** on a branch following the agent-branching rule. Use the `docs/` prefix: `docs/plan-<slug>`.
4. **Push and open a PR** for the plan. Fill in the `pr:` frontmatter field with the PR URL once created.
5. **Return the PR URL** to the user so they can review, comment, and approve.

## Plan Lifecycle

| Status | Meaning |
|---|---|
| `draft` | Work in progress, not yet ready for review |
| `proposed` | PR is open, awaiting review and approval |
| `accepted` | PR merged, plan is the agreed approach |
| `superseded` | A newer plan replaces this one (link via `supersedes:` in the new plan) |

Update the `status` field as the plan moves through its lifecycle. When a plan is superseded, update both the old plan (add a note at the top pointing to the replacement) and the new plan (`supersedes:` field).

## Naming Conventions

- `plans/auth-migration.md` — migration plan
- `plans/mcp-server-redesign.md` — architecture proposal
- `plans/spike-pdf-rendering.md` — spike/research findings
- `plans/rollout-feature-flags.md` — rollout strategy

Keep names short (3-5 words), lowercase, hyphen-separated. Prefix with the plan type when it aids discoverability (`spike-`, `rollout-`, `migration-`).

## What Counts as a Plan

Any document that proposes a future course of action or captures a technical decision:

- Architecture proposals
- Migration strategies
- Implementation roadmaps
- Spike/research findings with recommendations
- Rollout strategies
- Trade-off analyses where a decision needs to be recorded

## What Does NOT Need a Plan

- One-line decisions made in chat ("let's use Zod for validation")
- Bug fix descriptions (those go in PR summaries)
- Changelogs and release notes (those have their own conventions)

## Rules

1. Never leave a plan only in chat or in an agent transcript. If you wrote something that reads like a plan, move it to `plans/`.
2. Every plan file must have the YAML frontmatter with at least `title`, `status`, `created`, and `updated`.
3. Plans follow the same markdown backup rules as other markdown files — back up before overwriting.
4. When implementing a plan, reference it in the implementation PR: "Implements `plans/auth-migration.md`".
5. Do not delete old plans. Superseded plans are historical records. Mark them `superseded` and cross-reference.

## Playwright Project Test Matching

> Playwright testMatch regexes match against filenames, not full paths — use filename-only patterns _globs: `**/playwright.config.{ts,js}`_

# Playwright Project Matching — Learned from "No tests found" debugging

A `testMatch` regex of `/^e2e\/lighthouse-audit/` produced "No tests found" because Playwright resolves `testMatch` against the test file's path relative to `testDir`, not against the full file path or the project root. When `testDir` is unset, it defaults to the config file's directory — so a test at `e2e/lighthouse-audit.spec.ts` is matched as `e2e/lighthouse-audit.spec.ts` relative to the project root, but the `^e2e\/` anchor failed to match consistently across platforms and invocation methods.

## The Rule

Always use **filename-only** patterns in `testMatch` — never prefix with directory paths.

### Correct patterns

```typescript
// Match by filename — works reliably across all invocation methods
{
  name: "lighthouse",
  testMatch: /lighthouse-audit\.spec/,
},
{
  name: "webhint",
  testMatch: /webhint-audit/,
},
{
  name: "unlighthouse",
  testMatch: /unlighthouse-audit/,
},
```

### Wrong patterns

```typescript
// Path-prefixed — fragile, breaks with -g flags and when testDir changes
{
  name: "lighthouse",
  testMatch: /^e2e\/lighthouse-audit/,
},
// Overly broad — matches unrelated files containing the substring
{
  name: "lighthouse",
  testMatch: /lighthouse/,
},
```

### How `testMatch` resolves

1. Playwright discovers test files using `testDir` (defaults to config directory)
2. Each discovered file's path relative to `testDir` is tested against each project's `testMatch`
3. If `testMatch` matches, the file is assigned to that project
4. If no project matches, the file falls through to the default project

The regex is tested against the **relative path string**, which includes directory separators. But the exact format depends on the OS and how Playwright normalizes paths internally. Filename-only patterns avoid this ambiguity entirely.

### Excluding audit tests from the default project

Use `grepInvert` on the default project to prevent audit tests from running in the standard suite:

```typescript
{
  name: "chromium",
  use: { ...devices["Desktop Chrome"] },
  grepInvert: /demo|execution|sso|lighthouse-audit|webhint-audit|unlighthouse-audit/,
},
```

`grepInvert` matches against the **test title** (the string passed to `test()`), not the filename. This is a different matching surface than `testMatch`.

### `testMatch` vs `grepInvert` vs `-g`

| Mechanism | Matches against | Purpose |
|---|---|---|
| `testMatch` | File path (relative to testDir) | Assign files to projects |
| `grepInvert` | Test title string | Exclude tests from a project |
| `-g` CLI flag | Test title string | Run only matching tests |

When combining `testMatch` with `-g`, both must match: the file must match `testMatch` to be included in the project, AND the test title must match `-g` to run.

## Origin

- **Failure**: `bunx playwright test --project=lighthouse -g "homepage"` returned "No tests found" — the `testMatch` regex `/^e2e\/lighthouse-audit/` failed to match the test file
- **Date**: 2026-03-16
- **Root cause**: `testMatch` with a path-prefix anchor didn't match the file's path as Playwright resolved it
- **PR**: feat/quality-audit-tests (#211)

## Post-Merge Lint

> Run lint auto-fix after every merge or pull from main to catch formatting drift introduced by the merge _always-applied_

# Post-Merge Lint — Auto-Fix After Every Merge

After every `git pull`, `git merge`, or GitHub auto-merge that brings in commits from another branch, **immediately run the linter with auto-fix before committing or pushing**.

## Why

Merges combine code from two branches. Even when there are no textual conflicts, the merged result can violate lint rules that neither branch violated independently:

- Import ordering breaks when both branches add imports to the same file
- Formatting drift when one branch reformats while the other adds new code
- Unused imports appear when one branch removes the usage and the other keeps the import

CI runs lint on the merged result. If the merge introduces a lint violation, CI fails — even though neither contributor's code was individually wrong.

## The Rule

After any merge (including `git pull` which is fetch + merge):

```bash
bunx biome check --write .
```

Then inspect the diff. If Biome changed anything, commit the fix separately:

```bash
git add -A
git commit -m "style: auto-fix lint after merge"
```

## When This Applies

| Event | Action |
|---|---|
| `git pull origin main` into a feature branch | Run `biome check --write .` |
| `git merge main` | Run `biome check --write .` |
| GitHub auto-merges main into your PR branch | Pull the merge commit, run `biome check --write .`, push |
| Rebase onto main | Run `biome check --write .` after rebase completes |

## Checklist Before Pushing

1. Pull/merge the latest from the target branch
2. `bunx biome check --write .` — auto-fix formatting and import ordering
3. `bun run lint` — verify zero errors
4. `bun run build` — verify the build still passes
5. Commit any lint fixes as a separate `style:` commit
6. Push

## What NOT to Do

- Do not push immediately after a merge without running lint
- Do not assume "CI will catch it" — the pre-push hook runs lint too, and both will reject the push
- Do not skip the auto-fix step because "I didn't change that file" — the merge changed it

## Pr Scope

> Keep PRs focused on a single problem domain — never conflate unrelated changes in one PR _always-applied_

# PR Scope — One Problem Per PR

Every pull request MUST solve **one problem**. A reviewer should be able to describe the PR's purpose in a single sentence without using "and."

## The Rule

Before creating a branch or starting work, identify the **single concern** the PR will address. If the task spans multiple independent concerns, split it into separate branches and PRs — even if the changes are small.

## What Counts as One Problem

- A bug fix (including its tests and docs)
- A new feature or capability (including its tests and docs)
- A refactor that improves structure without changing behavior
- A dependency upgrade
- A documentation or rule update
- A CI/tooling change

Tests, docs, and changelogs that directly support the primary change belong in the same PR — they're part of solving that one problem.

## What Violates This Rule

- A PR that fixes a bug AND adds an unrelated feature
- A PR that refactors module A AND fixes a bug in module B (unless the refactor is a prerequisite for the fix)
- A PR that updates a Cursor rule AND modifies skill scripts
- A PR that upgrades a dependency AND changes business logic
- Bundling "while I'm here" drive-by fixes with the main change

## How to Handle Discoveries Mid-Work

When you discover an unrelated issue while working on a focused PR:

1. **Note it** — mention it to the user or add a TODO comment
2. **Don't fix it in the current PR** — context-switching within a PR creates review burden
3. **Open a separate branch** for the discovered issue after the current PR is done (or in parallel if independent)

## Self-Check Before Pushing

Before pushing a branch, ask:

1. Can I describe this PR in one sentence without "and"?
2. If I removed any commit, would the remaining commits still form a coherent change?
3. Would a reviewer need context from two unrelated areas to understand this PR?

If the answer to #1 is no, #2 is no, or #3 is yes — split the PR.

## Pragmatic Delivery

> Keep implementation pragmatic, scoped, and outcome-driven _always-applied_

# Pragmatic Delivery

Use these defaults to avoid over-engineering and scope drift.

## Confirm intent before execution

- If verbs are ambiguous (for example: "build", "wire", "finish"), confirm whether the user means compile, implement, or productionize.
- For large requests, lock scope with 1-2 critical questions before editing.

## Prefer smallest viable increment

- Deliver the thinnest change that satisfies the explicit acceptance criteria first.
- Defer optional architecture cleanup unless it unblocks delivery.
- Keep each pass end-to-end: implement, verify, and report concrete outcomes.

## Sequence work by dependency and risk

- Foundations first (shared contracts/config), then dependent features.
- Parallelize only independent domains; serialize integration and final verification.
- If repository state conflicts with assumptions, stop and realign before continuing.

## Report truthfully

- Do not claim "done" from intent alone; only after verification output confirms it.
- Call out residual gaps, constraints, or assumptions explicitly.

## Pre Push Adversarial Review

> Require adversarial-review before any user-requested git push _always-applied_

# Pre-Push Adversarial Review

Before executing any `git push` requested by the user, always run an `adversarial-review` of the pending changes with high rigor.

Required pre-push checklist:
- Run adversarial-review using offense -> defense -> synthesis.
- Use `chaos_mode: high` unless the user explicitly requests a lower level.
- Save the review to `docs/adversarial-review/reviews/<yyyy-mm-dd>-<slug>.md`.
- Add/update top-level summary entry in `docs/adversarial-review/reviews/TLDR.md`.
- Report key findings, decision, unresolved risk, and follow-up action before pushing.

Do not push until the above checklist is complete.

## Promise Resilience — Partial Failure Tolerance

> Use Promise.allSettled for independent parallel async operations to enable graceful degradation _globs: `**/*.ts,**/*.tsx`_

# Promise Resilience — Partial Failure Tolerance

When running independent async operations in parallel, use `Promise.allSettled` so that one failure degrades gracefully instead of crashing everything. Use the `settledValues` utility from `src/lib/settled.ts` for type-safe extraction with automatic error logging.

## Decision Framework

| Use `Promise.allSettled` | Use `Promise.all` |
|---|---|
| Independent data fetches for a page | All-or-nothing preconditions (both IPv4+IPv6 must bind) |
| Best-effort batch processing (validate N skills) | Paired I/O from one source (stdout + stderr of one process) |
| Client-side parallel fetches (session + config) | Atomic transactions where partial completion is invalid |
| Script-level discovery (warm routes, fetch slugs) | Test assertions that intentionally verify all promises succeed |

The test: "If promise #3 fails, can the caller still do something useful with promises #1, #2, #4?" If yes, use `allSettled`.

## Required Pattern

Import `settledValues` from `src/lib/settled.ts` for tuple-style extraction with typed defaults:

```tsx
import { settledValues } from "@/lib/settled";

const [skills, categories] = settledValues(
  await Promise.allSettled([getAllSkills(), getCategories()]),
  [[], []],
  "SkillsPage",
);
```

For batch processing where you need per-item failure details, use `settledPartition`:

```tsx
import { settledPartition } from "@/lib/settled";

const { fulfilled, rejected } = settledPartition(
  await Promise.allSettled(items.map(processItem)),
);
if (rejected.length > 0) {
  console.error(`${rejected.length} items failed:`, rejected);
}
```

## Observability — Never Swallow Failures

Every `Promise.allSettled` call site must ensure rejected results are logged. The `settledValues` utility does this automatically via `console.error` with a caller label. If you use `Promise.allSettled` directly without the utility, you must log rejections yourself.

Silent failures are worse than crashes — they hide bugs. The goal is graceful UX degradation with full server-side visibility.

## Defaults Must Be Safe

The fallback for a rejected promise must produce a valid degraded result:

| Data type | Safe default |
|---|---|
| Array (list of items) | `[]` — downstream `.map()`, `.filter()`, `.length` all work |
| Count / number | `0` |
| Object with required fields | Zero-valued object: `{ total: 0, items: [] }` |
| Nullable | `null` — only if the consumer already handles null |

Never use `undefined` as a default where the consumer expects a real value.

## Server Component Context

Custom `ErrorBoundary` components cannot catch errors from Server Components — only Next.js `error.tsx` files can. This means if `Promise.all` rejects in an async page function, the entire page crashes to the root error page. `Promise.allSettled` with defaults is the only way to achieve section-level degradation without a full Suspense refactor.

## Fault Tolerance Tiers

This rule addresses Tier 1. Higher tiers are documented for future reference:

- **Tier 1 — Fail-soft with defaults (current):** `Promise.allSettled` + typed defaults. Partial failures render empty sections instead of crashing the page.
- **Tier 2 — Suspense bulkheads (future):** Each data section becomes an independent async Server Component in its own `<Suspense>` boundary. Sections load and fail independently with skeleton fallbacks.
- **Tier 3 — Circuit breaker (future, if needed):** For external API dependencies, track failure counts per endpoint and return cached data when tripped.

## React Application Architecture

> React application architecture — file structure, layered separation, module boundaries _globs: `src/**/*.tsx,src/**/*.ts`_

# React Application Architecture

## Layered Separation (Martin Fowler)

React is a view library. Business logic does not belong in components. Separate concerns into layers with strict dependency direction:

```
  components/  →  lib/         →  types/
  (presentation)  (domain+data)   (shared contracts)

  Components import lib.
  Lib never imports components.
  Types are shared by both.
```

- **Presentation** (`components/`, `app/`): Renders UI from props. Handles layout, user interaction, and visual state. No SQL, no business rules.
- **Domain + Data** (`lib/`): Queries, business logic, validation, data transformations. Framework-agnostic — testable without React.
- **Contracts** (`types/`): Shared interfaces that both layers depend on. Changes here ripple intentionally.

## Colocation (Kent Dodds)

Things that change together live together. Don't prematurely abstract into shared folders.

```
src/app/skills/
  page.tsx              ← route entry
  [slug]/
    page.tsx            ← dynamic route
src/components/
  SkillCard.tsx         ← used by multiple routes → shared components/
  SearchBar.tsx
src/lib/
  skills.ts             ← data access for skills domain
  search.ts             ← search logic
```

**When to colocate vs. share:**
- If only one route uses it → colocate next to that route.
- If two+ routes use it → move to `components/` or `lib/`.
- If it's a general utility → move to `lib/`.

## Module Boundaries

Each module (`lib/skills.ts`, `lib/search.ts`) should have a clear public API. Internal helpers stay unexported. Don't reach into another module's internals.

```tsx
// ✅ Clean boundary — consumer doesn't know about SQL
import { getSkillBySlug } from '@/lib/skills';

// ❌ Leaky boundary — consumer depends on db internals
import { db } from '@/lib/db';
db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug);
```

## Error Boundaries

Wrap distinct UI sections in error boundaries so a failure in one section doesn't crash the entire page. Place boundaries at:
- Route layout level (catch page-level crashes)
- Around independent widgets (sidebar, dashboard panels)
- Never at the individual component level (too granular)

Use Next.js `error.tsx` files for route-level error handling. For section-level, use `react-error-boundary` or a custom class component.

## Import Conventions

- Use `@/` path alias for all imports from `src/`.
- Group imports: external packages first, then `@/lib`, then `@/components`, then `@/types`.
- Never use relative imports that climb more than one level (`../../`). Use the alias instead.

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Component files | PascalCase | `SkillCard.tsx` |
| Utility/lib files | camelCase | `skills.ts` |
| Type files | camelCase | `index.ts` in `types/` |
| Route files | Next.js convention | `page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx` |
| Test files | Mirror source name | `SkillCard.test.tsx` |
| Server Actions | `app/actions.ts` or colocated | `actions.ts` |

## React Component Design

> React component design — composition, server/client boundary, naming, props _globs: `**/*.tsx`_

# React Component Design

## Server-First by Default

Components are Server Components unless they need interactivity. Only add `"use client"` when the component uses hooks, browser APIs, or event handlers. When a Server Component needs an interactive child, pass the Server Component as `children` rather than importing it inside the Client Component.

```
┌─ Server Component (default) ──────────────────────┐
│  Data fetching, DB access, async/await             │
│                                                    │
│  ┌─ Client Component ("use client") ─────────┐    │
│  │  useState, onClick, useEffect              │    │
│  │  Receives Server Components via {children} │    │
│  └────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

## Composition Over Configuration

Prefer composable APIs over prop-heavy components. A component with more than 5-7 props is a signal to decompose.

```tsx
// ❌ Prop-heavy — "apropcalypse" (Kent Dodds)
<Card
  title="Deploy"
  subtitle="v2.1"
  icon={<Rocket />}
  showBadge
  badgeColor="green"
  badgeText="New"
  onClickAction={handleDeploy}
/>

// ✅ Composable — structure matches the UI
<Card>
  <Card.Header>
    <Rocket />
    <Card.Title>Deploy</Card.Title>
    <Badge color="green">New</Badge>
  </Card.Header>
  <Card.Action onClick={handleDeploy} />
</Card>
```

## Component Naming and Exports

- One component per file. File name matches the export: `SkillCard.tsx` → `export function SkillCard`.
- Use named exports, not default exports. Named exports are refactor-safe and greppable.
- Name components after what they render, not what data they consume.

## Props

- Define props as an inline type or a colocated `type` (not `interface`) when the shape is component-specific. Use shared types from `@/types` when the shape crosses module boundaries.
- Destructure props in the function signature.
- Use `children: React.ReactNode` for composition. Avoid `React.FC` — it obscures the signature and adds implicit `children`.

```tsx
type SkillCardProps = {
  skill: SkillSummary;
  highlight?: boolean;
};

export function SkillCard({ skill, highlight = false }: SkillCardProps) {
  // ...
}
```

## Keep Components Focused

A component should do one of these, not multiple:
1. **Fetch data** — async Server Component that queries and passes data down
2. **Manage state** — Client Component with hooks, passes values to presentational children
3. **Render UI** — pure function of props, no side effects

When a component does more than one, split it (Fowler's Separated Presentation).

## State Management & Data Flow

> State management, data fetching, and hooks — colocation, server/client data flow _globs: `**/*.tsx,**/*.ts`_

# State Management & Data Flow

## State Colocation (Kent Dodds)

Keep state as close as possible to where it's used. Lifting state "just in case" causes unnecessary re-renders and coupling. Move state down before reaching for context or global stores.

```
Local state (useState)          → single component needs it
Lifted state                    → two siblings need it — lift to parent
Context                         → distant subtree needs it, prop drilling > 2 levels
URL state (searchParams)        → state that should survive refresh/sharing
Server state (DB / async fetch) → server components, not client cache
```

## useState vs useReducer

- **useState** for independent values: a toggle, a single input, a counter.
- **useReducer** when one state update depends on another state value, or when multiple related values change together. All update logic lives in the reducer — no scattered `setState` calls.

## Context Is Not Global State

Context solves prop drilling, not state management. Rules:
- Create **multiple small contexts** scoped to specific concerns, not one global provider.
- Never put frequently-changing values in context unless consumers are memoized — every consumer re-renders on every context change.
- Pair context with `useReducer` for complex shared state (Kent Dodds' recommended pattern).

## Custom Hooks

Extract reusable stateful logic into custom hooks. A custom hook is just a function that calls other hooks — no magic.

```tsx
// ✅ Encapsulates logic, reusable across components
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

Name hooks `use[Thing]`. Never call hooks conditionally.

## Data Fetching

Fetch data on the server whenever possible. Server Components can `await` directly — no useEffect, no loading state, no client-side cache.

```tsx
// ✅ Server Component — direct data access
export default async function SkillsPage() {
  const skills = getAllSkills();
  return <SkillGrid skills={skills} />;
}
```

For parallel independent fetches, use `Promise.allSettled` with `settledValues` to avoid sequential waterfalls while tolerating partial failures. If one fetch fails, the page renders with degraded data instead of crashing entirely. See `promise-resilience.mdc` for the full decision framework.

```tsx
import { settledValues } from "@/lib/settled";

const [skills, categories, metrics] = settledValues(
  await Promise.allSettled([
    getAllSkills(),
    getCategories(),
    getImprovementMetrics(),
  ]),
  [[], [], { totalSkills: 0, totalVersions: 0, totalImprovements: 0, totalCategories: 0, recentActivity: [] }],
  "SkillsPage",
);
```

## URL as State

See the dedicated **url-state.mdc** rule. Any state that changes what the user sees on the page (tabs, filters, search, pagination, sort) belongs in URL query params via `nuqs`, not `useState`.

## Server Actions for Mutations

Use Server Actions (`"use server"`) for form submissions and data mutations. They eliminate API route boilerplate for internal operations, support progressive enhancement, and automatically serialize FormData.

- Keep Server Actions in dedicated files (`app/actions.ts`).
- Validate inputs with Zod on the server side.
- Call `revalidatePath()` after mutations to sync the UI.

## Performance: Don't Memoize Prematurely

React 19's compiler handles most memoization automatically. Do not add `useMemo`, `useCallback`, or `React.memo` unless profiling reveals an actual bottleneck. Write clean code first — optimize with evidence.

## React Testing

> React testing patterns — testing trophy, RTL conventions, what to test _globs: `**/*.test.tsx,**/*.test.ts`_

# React Testing

## The Testing Trophy (Kent Dodds)

Invest testing effort where confidence-per-dollar is highest:

```
        ╱ E2E ╲           ← Few: critical user journeys (Playwright)
       ╱────────╲
      ╱Integration╲       ← Most: components with real children, hooks, context
     ╱──────────────╲
    ╱   Unit tests   ╲    ← Some: pure functions, utilities, reducers
   ╱──────────────────╲
  ╱  Static analysis   ╲  ← Foundation: TypeScript, ESLint
 ╱──────────────────────╲
```

Integration tests give the most confidence. They render a component with its real children and test behavior the way a user experiences it.

## Query Priority (Testing Library)

Use queries in this order — accessible queries first:

1. `getByRole` — matches ARIA roles (`button`, `heading`, `textbox`). Preferred.
2. `getByLabelText` — form fields with associated labels.
3. `getByPlaceholderText` — when no label exists.
4. `getByText` — non-interactive text content.
5. `getByTestId` — last resort, when no semantic query works.

Always use `screen.*` — don't destructure from `render()`.

```tsx
// ❌ Implementation detail — brittle
const { container } = render(<SearchBar />);
const input = container.querySelector('input.search-input');

// ✅ User-centric — resilient to refactors
render(<SearchBar />);
const input = screen.getByRole('textbox', { name: /search/i });
```

## Test Behavior, Not Implementation

Tests should assert what the user sees and can do, never internal state or component internals.

```tsx
// ❌ Tests implementation — breaks on any refactor
expect(component.state.isOpen).toBe(true);

// ✅ Tests behavior — survives refactors
await userEvent.click(screen.getByRole('button', { name: /open/i }));
expect(screen.getByRole('dialog')).toBeVisible();
```

## Arrange-Act-Assert

Every test follows the same rhythm:

```tsx
test('filters skills by category', async () => {
  // Arrange
  render(<SkillsPage skills={mockSkills} />);

  // Act
  await userEvent.click(screen.getByRole('button', { name: /testing/i }));

  // Assert
  expect(screen.getByText('Jest Patterns')).toBeInTheDocument();
  expect(screen.queryByText('Docker Setup')).not.toBeInTheDocument();
});
```

## Async Patterns

Use `findBy*` (which waits) for content that appears after async operations. Use `waitForElementToBeRemoved` for disappearing elements. Never use arbitrary `setTimeout` waits in tests.

## What NOT to Test

- Styling or CSS class names (unless behavior depends on them)
- Third-party library internals
- Implementation details (state shape, hook call counts, private methods)
- Snapshot tests for large component trees — they rot fast and no one reviews the diff

## Reduced Motion Cinema

> Cinema learning experience animations must respect prefers-reduced-motion _globs: `src/app/learn/(cinema)/**/*.{tsx,css}`_

# Reduced Motion — Cinema Animations Must Respect User Preference — Learned from a11y review

CSS animations in the cinema learning experience (continuous spins, pulses, cascading gradients) can trigger vestibular disorders and motion sickness for users who have `prefers-reduced-motion: reduce` enabled. All continuous or decorative animations must be paused or replaced with static alternatives when this preference is active.

## The Rule

Every `@keyframes` animation used in `cinema-theme.css` or cinema components MUST have a corresponding `@media (prefers-reduced-motion: reduce)` block that sets `animation: none` and applies a reasonable static fallback.

### Required pattern

```css
/* Normal animation */
.my-animation {
  animation: my-keyframes 4s linear infinite;
}

/* Reduced motion override */
@media (prefers-reduced-motion: reduce) {
  .my-animation {
    animation: none;
    /* Static fallback — e.g., keep the glow but don't animate it */
  }
}
```

### What to disable

| Animation type | Reduced motion behavior |
|---|---|
| Continuous rotation (flywheel spin) | `animation: none` — show static icon |
| Pulsing glow (constraint pulse) | `animation: none` — keep box-shadow at resting state |
| Gradient flow (cascade line) | `animation: none; background-size: 100% 100%` — show static gradient |
| Text glow oscillation | `animation: none` — keep text-shadow at a fixed level |
| Badge pulse | `animation: none` |

### What to keep

Framer Motion `whileInView` entrance animations (fade-in, slide-up) are one-shot and typically acceptable under reduced motion, but should use `transition: { duration: 0 }` when `useReducedMotion()` returns `true` for the most accessible experience.

## Examples

### Wrong (caused the issue)

```css
.tenet-flywheel-icon {
  animation: tenet-flywheel-spin 12s linear infinite;
}
/* No reduced-motion override — spins forever for all users */
```

### Right (prevents recurrence)

```css
.tenet-flywheel-icon {
  animation: tenet-flywheel-spin 12s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .tenet-flywheel-icon {
    animation: none;
  }
}
```

## Origin

- **Failure**: Cinema page animations (flywheel spin, constraint pulse, cascade flow) ignored `prefers-reduced-motion`, violating WCAG 2.3.3
- **Date**: 2026-03-12
- **Root cause**: New CSS animations added to `cinema-theme.css` without reduced-motion media query overrides
- **PR**: feat/tenet-page

## Detection Acceleration

- **Level**: CI (e2e test)
- **What was added**: `tenet-page.spec.ts` — "animations are disabled when prefers-reduced-motion is set" test uses `page.emulateMedia({ reducedMotion: "reduce" })` and verifies computed `animationName` is `none`.
- **Diagnosis time before**: Manual testing only — user with motion sensitivity would discover the issue
- **Diagnosis time after**: Immediate test failure if reduced-motion override is removed

## Responsive Design Implementation

> Responsive design implementation — content prioritization, breakpoint conventions, progressive hiding, touch targets, and grid adaptation patterns _globs: `**/*.tsx`_

# Responsive Design Implementation

This project uses Tailwind CSS v4 with mobile-first responsive design. Base (unprefixed) styles target the smallest viewport; breakpoint prefixes progressively enhance for larger screens.

## Breakpoint Conventions

| Breakpoint | Width | Layout | Navigation | Columns |
|---|---|---|---|---|
| Base (0-639px) | Mobile | Single column, stacked | Hamburger menu | 1 |
| `sm` (640px+) | Large mobile / small tablet | Two columns where helpful | Hamburger menu | 1-2 |
| `md` (768px+) | Tablet | Desktop nav visible, expanded cards | Desktop nav bar | 2 |
| `lg` (1024px+) | Desktop | Sidebars visible, full detail panels | Desktop nav + sidebar TOC | 2-4 |
| `xl` (1280px+) | Wide desktop | Max-width containers, extra whitespace | Full nav | 3-4 |

## Content Priority Tiers

Every UI element belongs to one of three visibility tiers. When building or modifying a component, classify each element and apply the correct responsive visibility.

### Tier 1 — Always Visible

Shown at all breakpoints. This is the essential content a user needs regardless of device.

- Page title (`h1`)
- Primary content (skill cards, rule cards, main body text)
- Primary action button (CTA, submit, install)
- Navigation trigger (hamburger on mobile, full nav on desktop)
- Search input
- Status badges that affect user decisions (approval status, deprecated warning)

### Tier 2 — Hidden Below `sm` (640px)

Secondary information that adds context but isn't essential for the core task. Use `hidden sm:inline-flex` or `hidden sm:block`.

- Source type badges, scope badges
- Metadata labels (submitted by, category badge in list rows)
- Persona count indicators
- Table of contents secondary items
- Filter count labels (show icon-only below `sm`)

### Tier 3 — Hidden Below `lg` (1024px)

Supplementary UI that enhances desktop but would clutter mobile. Use `hidden lg:block`.

- Sidebar navigation (provide horizontal scroll alternative on mobile)
- Table of contents sidebar (provide sticky horizontal nav on mobile)
- Step connectors and decorative elements
- Expanded stat grids (show 2-col on mobile, full grid on `lg`)
- Detailed description text that duplicates what's in the main content area

### When Desktop-Only Content Needs a Mobile Alternative

If hiding a Tier 3 element removes functionality (not just visual polish), provide a compact alternative:

| Desktop element | Mobile alternative | Pattern |
|---|---|---|
| Sidebar category nav | Horizontal scrollable pill bar | `lg:hidden` on pills, `hidden lg:block` on sidebar |
| Sidebar TOC | Sticky horizontal section nav | `lg:hidden` on bar, `hidden lg:block` on sidebar |
| Multi-column stat grid | 2-column grid | `grid-cols-2 lg:grid-cols-5` |
| Inline metadata row | Stacked card layout | `flex-col sm:flex-row` |

## Touch Target Sizing

Interactive elements on mobile must meet WCAG 2.5.5 minimum target size:

- **Minimum**: 44x44px touch target area (applies to buttons, links, form controls)
- Tailwind helpers: `min-h-[44px] min-w-[44px]` or use `p-3` / `py-2.5 px-4` to achieve sufficient size
- Space between adjacent touch targets: at least 8px (`gap-2`)
- The header hamburger button already uses `h-9 w-9` — acceptable since it has padding around it, but prefer `h-11 w-11` for standalone touch targets

## Grid Adaptation Table

Standard column counts per breakpoint. Use these as defaults; deviate only with a reason.

| Content type | Base | `sm` | `md` | `lg` | `xl` |
|---|---|---|---|---|---|
| Skill/Rule cards | 1 | 2 | 2 | 2-3 | 3 |
| Stat cards | 2 | 3 | 3 | 4-5 | 5 |
| Form fields | 1 | 2 | 2 | 2-3 | 3 |
| Feature cards | 1 | 2 | 2 | 3 | 3-4 |
| Info tips | 1 | 2 | 3 | 3 | 3 |

## Progressive Hiding Patterns

### Pattern 1: Simple hide/show

Use when the element is purely informational and its absence doesn't block any task.

```tsx
<span className="hidden sm:inline-flex">
  <SourceTypeBadge sourceType={skill.sourceType} />
</span>
```

### Pattern 2: CollapsiblePanel

Use when the content is valuable on mobile but shouldn't take vertical space by default. The panel provides user-controlled disclosure.

```tsx
<CollapsiblePanel title="Details" defaultOpen>
  {/* Content */}
</CollapsiblePanel>
```

The `CollapsiblePanel` component already handles responsive behavior: collapsible below `lg`, always-expanded at `lg`.

### Pattern 3: Horizontal scroll alternative

Use when a vertical sidebar nav is hidden on mobile but the user still needs to navigate. Replace with a horizontal scrollable bar.

```tsx
{/* Mobile: horizontal pills */}
<nav className="flex gap-2 overflow-x-auto pb-2 lg:hidden">
  {links.map((link) => (
    <a key={link.id} href={`#${link.id}`}
       className="shrink-0 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium text-muted">
      {link.label}
    </a>
  ))}
</nav>

{/* Desktop: vertical sidebar */}
<aside className="hidden w-48 shrink-0 lg:block">
  <nav className="sticky top-20 space-y-1">
    {links.map((link) => (
      <a key={link.id} href={`#${link.id}`} className="block rounded-lg px-3 py-2 text-sm ...">
        {link.label}
      </a>
    ))}
  </nav>
</aside>
```

### Pattern 4: Layout direction flip

Use when a row of items overflows on mobile. Stack vertically on mobile, go horizontal from `sm` or `md`.

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  {/* Items stack on mobile, row on desktop */}
</div>
```

### Pattern 5: Truncation with overflow protection

Use for text values that could overflow their container on mobile (author names, URLs, long labels).

```tsx
<dd className="ml-auto max-w-[140px] truncate font-medium sm:max-w-none">
  {skill.author}
</dd>
```

## Container Padding

Use consistent responsive padding across all page containers:

```tsx
className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
```

Narrower content areas (`max-w-3xl`, `max-w-4xl`) use the same padding pattern.

## Anti-Patterns

### Horizontal overflow on mobile

Never allow content wider than the viewport. Test every page at 375px width.

- **Wrong**: Fixed-width elements (`w-[600px]`) without a responsive alternative
- **Wrong**: Tables without `overflow-x-auto` wrapper
- **Wrong**: `overflow-hidden` on a container that has scrollable children (clips the scrollbar)
- **Right**: `overflow-x-auto` on code blocks and wide tables
- **Right**: `max-w-full` on images and embedded content

### Hiding without alternatives

Don't hide functional elements on mobile without providing an alternative way to access the same functionality.

- **Wrong**: `hidden lg:block` on the only navigation to page sections
- **Right**: `hidden lg:block` on sidebar + `lg:hidden` on horizontal scroll nav

### Viewport-unit sizing

Avoid `100vw` (includes scrollbar width, causes horizontal overflow). Use `w-full` instead. For height, prefer `min-h-screen` with `dvh` fallback over `100vh`.

### Fixed positioning without scroll handling

Sticky headers and nav bars must account for existing sticky elements. The main header is `top-0 h-14`. Secondary sticky elements should use `top-14` to stack below it.

## Testing Responsive Changes

After any layout, spacing, or typography change:

1. Run `npx playwright test e2e/visual-sweep.spec.ts` to capture screenshots at all three viewports
2. Review screenshots in `screenshots/` for overflow, truncation, and layout issues
3. Verify the hamburger menu opens correctly on mobile
4. Check that all interactive elements have sufficient touch target size (44px+)

## Responsive & Visual Testing

> Require mobile and tablet viewport testing in Playwright e2e tests, with intermittent OCR-based visual bug detection _always-applied_

# Responsive & Visual Testing

Every Playwright e2e test that exercises UI must run against mobile, tablet, and desktop viewports. Intermittently use screenshot + vision analysis to catch design bugs that assertions alone miss.

## Required Viewports

The Playwright config must define three projects beyond any API-only project:

| Name | Width × Height | Device | Use case |
|---|---|---|---|
| `mobile` | 375 × 812 | iPhone 14-class | Touch, stacked layouts, hamburger nav |
| `tablet` | 768 × 1024 | iPad-class | Split layouts, sidebar collapse |
| `desktop` | 1280 × 720 | Laptop | Full layout, multi-column grids |

```typescript
// playwright.config.ts — projects array
import { devices } from "@playwright/test";

projects: [
  {
    name: "mobile",
    use: { ...devices["iPhone 14"] },
  },
  {
    name: "tablet",
    use: { ...devices["iPad (gen 7)"] },
  },
  {
    name: "desktop",
    use: { browserName: "chromium", viewport: { width: 1280, height: 720 } },
  },
]
```

## Writing Viewport-Aware Tests

Tests should pass on all three viewports without modification. If a test needs viewport-specific logic, use `test.info().project.name`:

```typescript
test("navigation is accessible", async ({ page }) => {
  await page.goto("/");
  const project = test.info().project.name;

  if (project === "mobile") {
    await page.getByRole("button", { name: /menu/i }).click();
  }

  await expect(page.getByRole("link", { name: /skills/i })).toBeVisible();
});
```

Avoid skipping viewports. If a feature genuinely doesn't apply at a breakpoint, use `test.skip()` with a reason, not `test.fixme()`.

## OCR Visual Bug Detection

After completing a batch of UI changes, intermittently run a screenshot sweep and analyze with vision to catch bugs that DOM assertions miss: text overflow, overlapping elements, broken alignment, invisible-on-background text, truncated cards, and z-index collisions.

### When to Run

- After any layout, spacing, or typography change
- After adding new components or pages
- Before opening a PR that touches `globals.css`, layout files, or shared components
- At least once per PR that modifies `src/app/**/*.tsx` or `src/components/**/*.tsx`

### How to Run

1. **Capture screenshots** at each viewport for every affected route:

```typescript
// e2e/visual-sweep.spec.ts
import { test } from "@playwright/test";

const routes = [
  "/",
  "/skills",
  "/skills/compare-deep-dives",
  "/rules",
  "/changelog",
  "/feedback",
  "/governance",
  "/personas",
  "/mcp-servers",
];

for (const route of routes) {
  test(`visual sweep ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: `screenshots/${test.info().project.name}${route.replace(/\//g, "-") || "-home"}.png`,
      fullPage: true,
    });
  });
}
```

2. **Analyze with browser MCP vision** — open each screenshot and look for:
   - Text clipped or overflowing its container
   - Elements overlapping that shouldn't be
   - Touch targets smaller than 44×44px on mobile
   - Horizontal scroll on mobile (content wider than viewport)
   - Blank areas where content should be
   - Color contrast failures — verify text/background pairings against the approved table in `color-contrast.mdc`. Semantic colors (`success`, `warning`, `error`, `accent`) used as text must use their `-text` variants.
   - Cards or grid items with inconsistent heights

3. **Use `toHaveScreenshot()` for regression** — once a page looks correct, lock it in:

```typescript
test("home page visual regression", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot({ maxDiffPixelRatio: 0.01 });
});
```

### What to Fix Immediately

- Horizontal overflow on mobile (anything causing a scrollbar)
- Text truncated mid-word without ellipsis
- Overlapping interactive elements (buttons, links)
- Content invisible due to same-color text/background

### What to Log as a Follow-Up

- Minor alignment imperfections (1-2px)
- Suboptimal but functional spacing
- Aesthetic preferences without usability impact

## Rules

1. Never ship a Playwright config with only a desktop project. All three viewports are required.
2. Every new e2e test file must pass on mobile, tablet, and desktop before merging.
3. Run the visual sweep at least once per UI-touching PR. Fix blocking issues; log minor ones.
4. When the browser MCP is available, prefer vision analysis over manual screenshot review.
5. Store screenshots in `screenshots/` (gitignored) — they are ephemeral artifacts, not committed.
6. After fixing any responsive issue, run `npx playwright test e2e/visual-sweep.spec.ts` to regenerate screenshots and verify the fix across all viewports.
7. See `.cursor/rules/responsive-design.mdc` for implementation patterns (content priority tiers, breakpoint conventions, progressive hiding).
8. See `.cursor/rules/color-contrast.mdc` for WCAG AA contrast requirements, approved text/background pairing table, and `-text` token variants for semantic colors.

## Rust Best Practices

> Rust coding standards, optimization, project conventions, and TypeScript interop _globs: `**/*.rs,**/Cargo.toml`_

# Rust Best Practices

## Safety

- `unsafe` code is **forbidden** — enforced via `[lints.rust] unsafe_code = "forbid"` in Cargo.toml.
- Never use `unwrap()` or `expect()` in production code paths. Use `?`, `unwrap_or_default()`, `unwrap_or_else()`, or `if let` / `let...else`.
- Prefer `let...else` over `match` for early returns: `let Ok(x) = fallible() else { return default };`
- Minimize interior mutability. Prefer compile-time borrow checking over `RefCell`. When shared mutable state is needed across threads, use `Mutex<T>` or `RwLock<T>`, never `RefCell`.
- Document invariants that any `unsafe` block (in vendored code) depends on with a `// SAFETY:` comment.

## Error Handling

### Libraries vs Applications

| Context | Crate | Pattern |
|---|---|---|
| Library crates (reusable modules) | `thiserror` | Custom error enums with `#[derive(Error)]`, `#[from]` for conversion |
| Application code (main.rs, CLI) | `anyhow` | `Result<T>` with `.context()` for propagation |

### thiserror for structured errors

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to read config: {0}")]
    Io(#[from] std::io::Error),
    #[error("missing required field: {field}")]
    MissingField { field: String },
    #[error("invalid value for {key}: {value}")]
    InvalidValue { key: String, value: String },
}
```

### anyhow for application code

```rust
use anyhow::{Context, Result};

fn load_config(path: &str) -> Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {path}"))?;
    toml::from_str(&content)
        .context("failed to parse config")
}
```

### When to panic vs return Result

- **Panic**: Programming bugs, violated invariants, `unreachable!()` branches that truly can't happen
- **Result**: Expected failures — I/O, network, parsing, user input
- Use `#[expect(clippy::...)]` over `#[allow(clippy::...)]` for intentional lint overrides — it warns if the suppression becomes unnecessary

## Linting

Every Rust project must configure clippy in `Cargo.toml`:

```toml
[lints.clippy]
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }
unwrap_used = "warn"
expect_used = "warn"

[lints.rust]
unsafe_code = "forbid"
```

Run `cargo clippy --release` before committing. Target **zero warnings**. Use `#[allow(clippy::...)]` on specific items only when the lint is noise for that case.

## Cargo.toml

### Release Profile

All Rust binaries must use this optimized release profile:

```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
panic = "abort"
strip = true
```

### Dependencies

- Minimize dependency count — each crate adds compile time and attack surface.
- Disable default features when you only need a subset: `git2 = { version = "0.20", default-features = false, features = ["vendored-libgit2"] }`.
- Pin to semver-compatible ranges, not exact versions: `clap = "4"` not `clap = "=4.5.60"`.
- Set `rust-version` to the minimum supported version (MSRV).
- Prefer vendored native libs when available: `features = ["vendored-libgit2"]`, `features = ["vendored"]`.
- Run `cargo audit` before pushing to catch known vulnerabilities.

### Workspace vs Single Crate

| Project size | Structure |
|---|---|
| Single binary or tool | Standalone crate in `tools/<name>/` |
| 2+ crates sharing types/logic | Cargo workspace with shared `Cargo.lock` |
| Large service (AgentOS) | Workspace with `core/`, `api/`, `cli/` members |

## Idiomatic Patterns

| Pattern | Do | Don't |
|---|---|---|
| String from `&str` | `str::to_string` or `.into()` | `String::from(s)` when `.into()` is clear |
| Option mapping | `.map(str::to_string)` | `.map(\|s\| s.to_string())` (redundant closure) |
| Fallback | `.unwrap_or_else(\|\| expensive())` | `.unwrap_or(expensive())` (eager evaluation) |
| Map + unwrap | `.map_or_else(fallback, mapper)` | `.map(f).unwrap_or_else(g)` |
| Format strings | `format!("{x}")` | `format!("{}", x)` (uninlined arg) |
| Large literals | `2_654_435_761` | `2654435761` (unreadable) |
| Strip prefix | `s.strip_prefix('"')` | `if s.starts_with('"') { &s[1..] }` |
| Early return | `let Ok(x) = f() else { return };` | `match f() { Ok(x) => x, Err(_) => return }` |
| Conditional ownership | `Cow<'_, str>` | Clone unconditionally |
| Known-size collections | `Vec::with_capacity(n)` | `Vec::new()` followed by n pushes |

## Performance

- Pre-allocate containers when size is known: `String::with_capacity(8192)`, `Vec::with_capacity(n)`.
- Reuse expensive handles (e.g., open `git2::Repository` once, run all operations through it).
- Avoid `.clone()` unless ownership transfer is required — borrow instead.
- Use `const fn` where the compiler allows it (pure computations, no trait calls).
- For CLI binaries, prefer blocking I/O (`ureq`) over async runtimes (`reqwest` + `tokio`) to avoid runtime startup overhead.
- Prefer `&str` over `String` in function parameters that only read text.
- Use `SmallVec` or `ArrayVec` for small, stack-allocated collections when the upper bound is known.
- Prefer iterator chains over manual loops — they compile to identical code with better optimization opportunities.

## CLI Tools (Scripting Replacement)

Rust replaces Python for all scripting tasks. New CLI tools follow this pattern:

```rust
use anyhow::Result;
use clap::Parser;

#[derive(Parser)]
#[command(about = "Tool description")]
struct Cli {
    #[arg(short, long)]
    verbose: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(clap::Subcommand)]
enum Commands {
    Run { path: String },
    Check { #[arg(long)] strict: bool },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Run { path } => run(&path),
        Commands::Check { strict } => check(strict),
    }
}
```

### Standard CLI stack

| Crate | Purpose |
|---|---|
| `clap` (derive API) | Argument parsing, subcommands |
| `anyhow` | Error handling with context |
| `serde` + `toml`/`serde_json` | Config and data serialization |
| `tracing` | Structured logging |
| `ureq` | HTTP (blocking, no async overhead) |

## Testing

- Unit tests go in `#[cfg(test)] mod tests { ... }` inside the source file.
- Integration tests go in `tests/` directory — each file compiles as a separate crate.
- Use `dev-dependencies` for test-only crates.
- Run `cargo test` before committing Rust changes.
- Use `proptest` for property-based testing on serialization round-trips, parsing, and validation:

```rust
#[cfg(test)]
mod tests {
    use proptest::prelude::*;
    proptest! {
        #[test]
        fn roundtrip_encode_decode(input in any::<Vec<u8>>()) {
            let encoded = encode(&input);
            let decoded = decode(&encoded).unwrap();
            assert_eq!(input, decoded);
        }
    }
}
```

- Use `insta` for snapshot tests on complex structured output.

## Project Structure

```
tools/<name>/
├── Cargo.toml
├── Cargo.lock          # Committed — reproducible builds
├── src/
│   ├── main.rs         # CLI entry + orchestration
│   ├── lib.rs          # Core logic (for non-trivial tools — testable, reusable)
│   ├── <module>.rs     # One module per concern
│   └── ...
└── tests/              # Integration tests (if needed)
```

- `Cargo.lock` is always committed for binaries (ensures reproducible builds).
- Keep `main.rs` focused on CLI parsing and dispatch. Business logic goes in modules or `lib.rs`.
- For non-trivial tools, split into `lib.rs` (testable core) + `main.rs` (thin CLI wrapper).
- Use `mod` declarations in `main.rs` or `lib.rs` — flat module structure unless complexity demands nesting.

## TypeScript Interop

### NAPI-RS for native Node addons

When Rust logic needs to be called directly from TypeScript (hot paths, CPU-bound work):

```rust
// Cargo.toml
[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "3", features = ["async"] }
napi-derive = "3"
```

```rust
use napi_derive::napi;

#[napi]
pub fn process_data(input: String) -> napi::Result<String> {
    Ok(transform(&input))
}
```

### When to use interop vs separate processes

| Scenario | Approach |
|---|---|
| CPU-bound function called from API route | NAPI-RS native addon |
| Standalone daemon or tool | Separate Rust binary, communicate via stdout/JSON |
| Browser target | `wasm-pack` to compile to WebAssembly |
| Infrequent calls | `Bun.spawn()` the Rust binary |

### Data exchange

- Use JSON via `serde_json` for process-to-process communication
- Use structured types via NAPI-RS derive macros for in-process calls
- Never use raw FFI — always go through NAPI-RS or WASM bindings

## Build Artifacts

- `target/` directories are gitignored — intermediate build artifacts are never committed.
- The release binary is copied to `tools/<name>/bin/<name>` and committed via Git LFS so all team members get it without compiling Rust.
- After building (`cargo build --release`), copy the binary: `cp target/release/<name> bin/<name>`.
- Add `tools/<name>/target/` to `.gitignore` and `tools/<name>/bin/<name>` to `.gitattributes` with LFS tracking.

## Shell Integration

When a Rust binary replaces shell scripts, the scripts become thin wrappers:

```bash
RUST_BINARY="$REPO_ROOT/tools/<name>/target/release/<name>"
if [ -x "$RUST_BINARY" ]; then
  exec "$RUST_BINARY" <subcommand> "$@"
fi
# ... shell fallback below ...
```

This ensures the fast path is used when compiled, with graceful degradation.

## Build and CI Tooling

Run these before every push:

```bash
cargo fmt -- --check     # Formatting
cargo clippy -- -D warnings  # Lints (warnings = errors)
cargo test               # Unit + integration tests
cargo audit              # Vulnerability scan
```

In CI, run these as separate parallel steps for faster feedback.

## Rust Build Artifact Hygiene

> Prevent Rust build artifact commits and history contamination. _always-applied_

# Rust Build Artifact Hygiene

Never commit Rust build outputs (`target/`, `*.rlib`, `*.rmeta`, `*.pdb`, `*.profraw`, `*.profdata`, `**/*.rs.bk`).

If artifacts are tracked:

1. Remove them from git index and workspace.
2. Fix `.gitignore` immediately.
3. Purge historical blobs with `git filter-repo`.
4. Force-push rewritten refs and coordinate collaborator re-sync.

## Rust Github Ci Quality Gate

> Enforce production-grade Rust CI checks in GitHub Actions. _always-applied_

# Rust GitHub CI Quality Gate

Require a Rust CI workflow on pull requests and pushes:

- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo nextest run --workspace --all-features --profile ci` (or `cargo test`)
- `cargo check --workspace --all-targets --all-features`

Use Cargo caching (`Swatinem/rust-cache@v2` or equivalent) and keep a matrix for OS/toolchain coverage.

Recommended security steps:

- `cargo deny check`
- `cargo audit`

## Scroll Lock Safety

> Prevent scroll lock leaks — every body overflow mutation must have a cleanup _globs: `**/*.tsx`_

# Scroll Lock Safety — Learned from stuck pages

`VideoOnboardingYouTube` set `document.body.style.overflow = "hidden"` in three branches of a `useEffect` but only returned a cleanup function for one of them. When the component navigated away to the cinema experience via `router.push`, it unmounted without restoring overflow. Every subsequent page was unscrollable.

## The Rule

Every `document.body.style.overflow = "hidden"` **must** have a corresponding restore, and the restore must be guaranteed to run — not dependent on the user clicking a specific button.

### Required pattern

```tsx
useEffect(() => {
  document.body.style.overflow = "hidden";
  return () => {
    document.body.style.overflow = "";
  };
}, []);
```

The cleanup function is non-negotiable. If the effect sets overflow to hidden on any code path, **every** code path must end with a `return () => { ... }` that restores it.

### Anti-patterns

| Pattern | Problem |
|---|---|
| Setting overflow in an effect, restoring only in a callback | Unmount without callback = permanent lock |
| Conditional returns from useEffect where some branches skip cleanup | Branches that don't return a cleanup leak the lock |
| Restoring overflow in `router.push` but not in the effect cleanup | Race condition — effect cleanup may run after navigation |
| Multiple effects that each set overflow without coordinating | Last-write-wins; one cleanup may clobber another |

### Navigation as an exit path

When a component sets `overflow: hidden` and then navigates (`router.push`, `router.replace`, `<Link>`), it must restore overflow **before** the navigation call AND in the effect cleanup. The effect cleanup is the safety net; the explicit restore before navigation prevents a visual flicker.

```tsx
useEffect(() => {
  if (phase === "navigate-away") {
    document.body.style.overflow = "";
    router.push("/next-page");
  }
}, [phase, router]);
```

### Test requirements

Every component that sets `document.body.style.overflow` must have tests for:

1. **Scroll locked on mount** — `expect(document.body.style.overflow).toBe("hidden")`
2. **Scroll restored on dismiss/close** — the happy path
3. **Scroll restored on unmount without interaction** — `unmount()` then assert
4. **Scroll restored on every navigation path** — if the component can navigate away, each path gets a test
5. **Scroll restored on skip/escape** — any shortcut that bypasses the normal flow

The test structure:

```tsx
test("scroll restored on unmount even without dismiss", () => {
  const { unmount } = render(<OverlayComponent />);
  expect(document.body.style.overflow).toBe("hidden");
  unmount();
  expect(document.body.style.overflow).toBe("");
});
```

## Components that set body overflow

| Component | File | Scope |
|---|---|---|
| `VideoOnboardingYouTube` | `src/components/shared/VideoOnboardingYouTube.tsx` | Full-screen onboarding overlay |
| `VideoOnboarding` | `src/components/shared/VideoOnboarding.tsx` | Legacy video onboarding |

When adding a new component that locks scroll, add it to this table and write the required tests.

## Origin

- **Failure**: Navigating from onboarding to cinema pages left `body.style.overflow = "hidden"`, making every cinema page unscrollable
- **Date**: 2026-03-12
- **Root cause**: `useEffect` in `VideoOnboardingYouTube` had three code paths that set `overflow: hidden` but only one returned a cleanup function
- **Fix**: Always return a cleanup function from the effect, plus explicitly restore overflow before `router.push`

## Scrollable Keyboard Nav

> Scrollable containers must be keyboard-navigable _globs: `src/**/*.tsx`_

# Scrollable Keyboard Navigation — Learned from keyboard-inaccessible game panels

Multiple scrollable containers across the app (InventoryPanel, LeaderboardPanel, BossEncounter skill/rule lists, FeedbackChatbot messages, ComposerDemo chat, BeforeAfterDemo panels) had `overflow-y-auto` but no `tabIndex`, making them impossible to scroll via keyboard. Screen reader users and keyboard-only users could not access content that overflowed the container.

## The Rule

Every element with `overflow-y-auto`, `overflow-y-scroll`, `overflow-auto`, or `overflow-x-auto` that contains scrollable content **must** have `tabIndex={0}` so keyboard users can focus the container and scroll with arrow keys.

### Required attributes for scrollable containers

```tsx
// CORRECT — keyboard users can focus and scroll
<div
  className="max-h-[80vh] overflow-y-auto"
  tabIndex={0}
  role="region"
  aria-label="Description of scrollable content"
>
  {content}
</div>

// WRONG — not focusable, keyboard users can't scroll
<div className="max-h-[80vh] overflow-y-auto">
  {content}
</div>
```

### When `tabIndex={0}` is NOT needed

- The container's only scrollable children are already focusable (e.g., a list of `<button>` elements where the buttons themselves provide keyboard access to all content)
- The container uses native document scrolling (the page body)
- The container is not visible or is `pointer-events-none`

### Overlay / modal panels

Overlay panels (inventory, leaderboard, boss encounters) should also:

1. Add `role="dialog"` and `aria-label` for screen readers
2. Handle `Escape` key to close the panel
3. Restore focus to the trigger element when closed

```tsx
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [onClose]);
```

### Custom scrollbar styling

For game-themed containers, use the `pixel-scrollable` class (defined in `pixel-theme.css`) which provides thin, styled scrollbars matching the game aesthetic.

For cinema-themed containers, scrollbar styles are applied globally via `[data-cinema]` in `cinema-theme.css`.

## Checklist when creating a scrollable container

1. Does it have `tabIndex={0}`?
2. Does it have `aria-label` describing the content?
3. If it's a modal/overlay, does Escape close it?
4. If it's horizontally scrollable, can arrow keys navigate its content?
5. Does it have appropriate scrollbar styling for its theme?

## Origin

- **Failure**: 12+ scrollable containers across the app were not keyboard-focusable — keyboard users couldn't scroll game inventory, leaderboards, skill selection lists, chat messages, or review panels
- **Date**: 2026-03-14
- **Root cause**: `overflow-y-auto` was applied without `tabIndex={0}`, so the browser never includes the container in the tab order
- **PR**: fix/visual-polish-keyboard-nav

## Security Overview

> Security architecture, validation strategy, and anti-hallucination system _always-applied_

# Security Overview

The Skills Hub serves data to both browsers (HTTP) and AI agents (MCP/stdio). Security threats come from two directions: traditional web attacks against the API, and hallucination risks when AI agents relay data to end users. The system addresses both with layered validation.

## Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| SQL injection | Query params, slugs | Parameterized queries everywhere (better-sqlite3 `?` placeholders) |
| Invalid enum values | Category, domain, status columns | Zod validation at API boundary + CHECK constraints in schema.sql |
| XSS | Rendered skill/rule content | React auto-escapes all interpolated content; no `dangerouslySetInnerHTML` |
| Oversized input | Search queries, feedback text | Zod `.max()` limits + SQL CHECK length constraints |
| AI hallucination | LLM fabricates skills, versions, or properties | Grounding system: content fingerprints, source citations, verification tool |
| Stale data presented as current | AI caches old responses | `retrievedAt` timestamp in grounding metadata; consumers can reject stale data |
| Invalid data in DB | Seed or future write paths | SQL CHECK constraints enforce enum values and length bounds at storage layer |
| Referential integrity violations | Orphaned versions, entries, deps | Foreign keys ON DELETE CASCADE enforced via `PRAGMA foreign_keys = ON` |

## Validation Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Input Validation (src/lib/validation.ts)          │
│  Zod schemas validate all external input at the boundary    │
│  - API routes: search params, slugs, pagination             │
│  - MCP tools: query, category, limit, slug, method          │
│  - Feedback: email, category, title, description            │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Type Safety (src/types/index.ts)                  │
│  TypeScript interfaces mirror DB columns 1:1                │
│  - Compile-time enforcement across all callsites            │
│  - Union types for enums: Category, RuleDomain, etc.        │
│  - Type assertions at DB boundary: `as SkillRow | undefined`│
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Database Constraints (schema.sql)                 │
│  SQL CHECK constraints are the last line of defense         │
│  - Enum CHECK: category IN ('documentation', 'testing', ...)│
│  - Length CHECK: length(name) BETWEEN 1 AND 256             │
│  - Boolean CHECK: isDeprecated IN (0, 1)                    │
│  - NOT NULL, UNIQUE, FOREIGN KEY with ON DELETE CASCADE     │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Grounding System (src/lib/grounding.ts)           │
│  Anti-hallucination for AI consumers                        │
│  - Content fingerprints (HMAC-SHA256) on every MCP response │
│  - Source citations: { table, id, retrievedAt }             │
│  - Verification tool: agents check claims before presenting │
│  - Ground truth index: compact catalog for cross-reference  │
└─────────────────────────────────────────────────────────────┘
```

## Anti-Hallucination System

### Problem

When an AI agent queries the Skills Hub MCP server and relays results to a user, the LLM may:
1. Fabricate a skill that doesn't exist ("the `auto-deploy-k8s` skill handles this")
2. Misattribute properties ("this skill is in the testing category" when it's in devops)
3. Invent version numbers or changelog entries
4. Present stale cached data as current

### Solution: Grounded Responses

Every MCP tool response wraps data in a `GroundedResponse<T>` envelope:

```json
{
  "data": { ... },
  "_grounding": {
    "fingerprint": "a3f8b2c1d4e5f6a7",
    "sources": [
      { "table": "Skill", "id": "clx...", "retrievedAt": "2026-02-22T..." }
    ],
    "retrievedAt": "2026-02-22T10:30:00.000Z",
    "dataHash": "b7c8d9e0f1a2"
  }
}
```

- **fingerprint**: HMAC-SHA256 of canonical JSON (sorted keys) — verifies data was produced by this server, not fabricated. Requires `GROUNDING_HMAC_KEY` env var (min 32 chars).
- **sources**: exact database table and row ID for every piece of data in the response
- **retrievedAt**: when the data was read from the database — consumers can set a staleness window
- **dataHash**: SHA-256 of the response content — detects any modification after retrieval

### HMAC Key Configuration

The HMAC key is loaded from the `GROUNDING_HMAC_KEY` environment variable. It must be at least 32 characters. There is no hardcoded default — the server will fail to start without it.

```bash
# Generate a key:
openssl rand -base64 48
```

Add to `.env`:
```
GROUNDING_HMAC_KEY="your-generated-key-here"
```

### Verification Tools

Three MCP tools exist specifically for hallucination prevention:

**`skills_verify_claim`** — agents call this to verify a specific factual claim before presenting it:
- `skill_exists`: does slug X exist in the database?
- `skill_has_version`: does skill X have version Y?
- `skill_in_category`: is skill X in category Y?
- `rule_exists`: does rule slug X exist?
- `rule_in_domain`: is rule X in domain Y?

Returns `{ verified: true/false, evidence: "..." }` with the actual database value.

**`skills_verify_fingerprint`** — agents call this to verify that a grounded response is authentic and unmodified. Pass the `data` object and `_grounding.fingerprint` / `_grounding.dataHash` from a prior response. Returns `{ fingerprintValid, dataHashValid, authentic }`.

**`skills_ground_truth_index`** — returns a compact list of every skill slug/name/category and every rule slug/title/domain. Agents should fetch this before generating responses that reference specific skills or rules. If a slug isn't in the index, it doesn't exist.

### Usage Pattern for AI Agents

```
1. Agent receives user question about skills
2. Agent calls skills_ground_truth_index to get valid slugs
3. Agent calls skills_search or skills_get_detail
4. Agent calls skills_verify_fingerprint to confirm response authenticity
5. Agent calls skills_verify_claim on any facts it plans to state
6. Agent presents verified information with source citations
```

## Parameterized Queries

All database access uses `better-sqlite3` prepared statements with `?` placeholders. No string concatenation of user input into SQL.

```typescript
// Correct — parameterized
db.prepare("SELECT * FROM Skill WHERE slug = ?").get(slug)

// Correct — dynamic IN clause with placeholder per value
db.prepare(`SELECT * FROM ChangelogEntry WHERE versionId IN (${ids.map(() => "?").join(",")})`).all(...ids)
```

The `?` placeholder pattern is enforced project-wide. The database layer (`src/lib/skills.ts`, `src/lib/rules.ts`, `src/lib/feedback.ts`) contains all SQL — components and API routes never construct queries directly.

## Input Validation (src/lib/validation.ts)

Shared Zod schemas validate inputs at the API boundary. The same enum values used in Zod schemas match the CHECK constraints in `schema.sql` and the TypeScript union types in `src/types/index.ts` — one source of truth across all three layers.

| Schema | Used by | Validates |
|--------|---------|-----------|
| `skillSearchParams` | `GET /api/skills` | `q` (max 256 chars), `category` (enum) |
| `ruleSearchParams` | `GET /api/rules` | `q` (max 256 chars), `domain` (enum) |
| `slugSchema` | Slug route params | Lowercase alphanumeric + hyphens, max 128 |
| `feedbackInput` | Feedback submission | Email, category, title (3-256), description (10-5000) |
| `paginationSchema` | Any paginated endpoint | `limit` (1-100), `offset` (>= 0) |

Invalid input returns `400 Bad Request` with a structured error message.

## Schema Constraints (schema.sql)

Every enum column has a CHECK constraint. Every text column with user-facing content has length bounds. Boolean columns are constrained to `(0, 1)`. These constraints fire even if application validation is bypassed (direct DB access, seed scripts, migrations).

## Authentication

Skills Hub uses Microsoft Entra ID (Azure AD) for SSO via OIDC Authorization Code flow with PKCE.

### Flow

1. `AuthGate` (layout-level) redirects unauthenticated users to `/api/auth/sso/login`
2. Login route generates PKCE `code_verifier`/`code_challenge`, stores verifier + nonce in httpOnly cookies, redirects to Entra ID's `/authorize` endpoint
3. User authenticates with Microsoft, Entra ID redirects to `/api/auth/sso/callback` with an authorization code
4. Callback exchanges code for tokens (with PKCE verifier), validates `id_token` (JWKS + nonce), checks group membership via Microsoft Graph
5. Sets two cookies: `skills_hub_session` (DB-backed session) and `skills_hub_jwt` (signed JWT for governance routes)

### Security Properties

- **PKCE (S256)**: Prevents authorization code interception attacks. Verifier stored in httpOnly cookie, challenge sent to IdP.
- **Nonce validation**: `id_token` nonce checked against cookie-stored nonce to prevent replay attacks.
- **CSRF via cookie binding**: The nonce cookie is httpOnly + same-site, so cross-origin callbacks can't supply it.
- **Group-based access**: Users must be members of the configured Entra security group (`SSO_GROUP_ID`). Admin features require membership in `SSO_ADMIN_GROUP_ID`.

### Dual Cookie System

| Cookie | Mechanism | Used by |
|--------|-----------|---------|
| `skills_hub_session` | DB-backed token, set on SSO callback | Session-based API routes (feedback, personas, subscriptions, secrets) |
| `skills_hub_jwt` | Signed JWT (HS256), set on SSO callback | Middleware, governance routes, impersonation |

Both cookies are set simultaneously on SSO login. Logout clears both.

### Configuration

See `docs/entra-id-setup.md` for the full Azure Portal registration walkthrough. Env vars: `SSO_ENABLED`, `SSO_TENANT_ID`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_AUTHORITY`, `SSO_REDIRECT_URI`, `SSO_GROUP_ID`, `SSO_ADMIN_GROUP_ID`, `SSO_GRAPH_URL`.

For local development, `SSO_ENABLED=false` uses the mock SSO server (`scripts/mock-sso/`) which replicates the full OIDC flow including PKCE validation.

## What We Don't Do (and Why)

| Feature | Status | Rationale |
|---------|--------|-----------|
| Token refresh | Not implemented | Session expiry + re-auth is acceptable for a catalog app; refresh adds complexity without clear UX benefit |
| MSAL library | Not used | Raw OIDC with `jose` is lighter and sufficient; MSAL adds ~200KB for features we don't need |
| Rate limiting | Wired for auth, feedback | `RateLimitEntry` table used for `auth:login` and `feedback:submit` actions |
| CSP headers | Configured in next.config.ts | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` |
| CORS | Default Next.js behavior | Tighten when deploying behind a specific domain |

## Server Client Boundary

# Server/Client Component Boundary

In the Next.js App Router, every `.tsx` file in `src/app/` and `src/components/` is a **server component by default** unless it has `"use client"` at the top. Server components cannot pass functions (event handlers, callbacks) as props — they must be serializable.

## The Rule

**Never add `onClick`, `onChange`, `onSubmit`, `onBlur`, `onFocus`, or any `on*` event handler to a JSX element inside a server component.** If an element needs interactivity, extract it into a dedicated client component.

## How to Fix

When you need interactivity inside a server component, extract the interactive element into its own client component file:

```tsx
// ExternalRepoLink.tsx — Client Component
"use client";

export function ExternalRepoLink({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label={`${name} repository`}
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

// SkillCard.tsx — Server Component (no "use client")
import { ExternalRepoLink } from "./ExternalRepoLink";

export function SkillCard({ skill }: { skill: SkillSummary }) {
  return (
    <Link href={`/skills/${skill.slug}`}>
      {skill.repository && (
        <ExternalRepoLink href={skill.repository} name={skill.name} />
      )}
    </Link>
  );
}
```

## Decision Framework

| Situation | Action |
|---|---|
| Element needs an event handler (`onClick`, `onChange`, etc.) | Extract to a client component |
| Element is purely display (text, images, links without handlers) | Keep in server component |
| A single element in a large component needs interactivity | Extract **just that element** — don't add `"use client"` to the whole file |
| Component already has `"use client"` | Event handlers are fine — it's already a client component |
| You want to pass a Server Action (not a regular function) | Server Actions can be passed as props — they're the exception |

## Lazy-Loading Client Components from a Server Component

`next/dynamic` with `{ ssr: false }` **cannot be called directly in a server component**. Next.js will fail the build with:

```
`ssr: false` is not allowed with `next/dynamic` in Server Components.
Please move it into a Client Component.
```

When you want to lazy-load a client-only widget (e.g., a command palette, chatbot, or keyboard shortcut overlay) from a server-rendered layout, create a thin client wrapper:

```tsx
// DeferredWidgets.tsx — Client Component
"use client";

import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("@/components/shared/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);

export function DeferredWidgets() {
  return <CommandPalette />;
}
```

```tsx
// layout.tsx — Server Component
import { DeferredWidgets } from "@/components/layout/DeferredWidgets";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <DeferredWidgets />
      </body>
    </html>
  );
}
```

This is the correct pattern for performance optimization (removing widgets from the critical bundle). It is **not** a workaround for event handler issues — those should be fixed by extracting the interactive element properly.

## What NOT to Do

- **Don't add `"use client"` to a large component just because one element needs `onClick`.** Extract the interactive part instead. This keeps the server component tree as large as possible, which means less JavaScript sent to the browser.
- **Don't use `dynamic(() => import(...), { ssr: false })` directly in a server component.** It will fail the build. Create a `"use client"` wrapper instead.
- **Don't use `dynamic({ ssr: false })` as a workaround for event handler issues.** Fix the boundary properly by extracting the interactive element.
- **Don't suppress the error.** "Event handlers cannot be passed to Client Component props" is always a real bug.

## Self-Check Before Committing

When editing a server component (any `.tsx` without `"use client"`), search for `on` props:

```
onClick, onChange, onSubmit, onBlur, onFocus, onKeyDown, onKeyUp, onMouseEnter, onMouseLeave
```

If any are present, the component either needs `"use client"` or the interactive element needs to be extracted into a client component.

When using `next/dynamic` with `{ ssr: false }`, verify the calling file has `"use client"` at the top. If it doesn't, the build will fail.

## Origin

- **Failure (event handlers)**: `onClick` passed as prop in server component — runtime error
- **Failure (ssr: false)**: `next/dynamic({ ssr: false })` used in `src/app/layout.tsx` (server component) — build error: "ssr: false is not allowed with next/dynamic in Server Components"
- **Date**: 2026-03-16
- **Root cause**: `next build` rejects `ssr: false` in files without `"use client"`. The fix is a thin client wrapper component that contains the dynamic imports.
- **PR**: test/lighthouse-enforcement (#209)


## Server Component Imports

> Prevent missing imports in Next.js server components that cause runtime ReferenceError _always-applied_

# Server Component Import Safety — Learned from runtime ReferenceError

`next build` uses SWC, not the TypeScript compiler. SWC does not catch undefined identifiers in server components — a `<Breadcrumbs />` tag without an import statement compiles successfully but crashes at runtime with `ReferenceError: Breadcrumbs is not defined`. The error only surfaces when a user visits the page, producing a fallback error boundary ("Failed to load") instead of the actual content.

## The Rule

After adding or modifying any JSX element in a server component (files without `"use client"`), verify every component used in the JSX has a corresponding import at the top of the file. Do not rely on `next build` to catch missing imports — it won't.

### Verification checklist

When editing a server component page (`src/app/**/page.tsx`):

1. For every `<ComponentName` in the JSX, confirm an `import { ComponentName }` or `import ComponentName` exists in the file's import block.
2. If you added a component that exists in the project (e.g., `Breadcrumbs`, `PageContainer`, `CategoryBadge`), add the import from the correct module path.
3. Run `bun run typecheck` (which executes `tsc --noEmit`) on the specific file if in doubt — TypeScript catches `TS2304: Cannot find name` even when SWC doesn't.

### Why `next build` misses this

| Tool | Catches missing imports? | Why |
|---|---|---|
| `tsc --noEmit` | Yes | Full type checking, reports TS2304 |
| `next build` (SWC) | No | SWC transpiles without full type resolution; treats unknown identifiers as runtime values |
| Biome / ESLint | No | Linters check style, not type resolution across modules |
| Runtime execution | Yes (too late) | `ReferenceError` when the component renders |

## Examples

### Wrong (caused the failure)

```tsx
// src/app/rules/[slug]/page.tsx — NO Breadcrumbs import
import { PageContainer } from "@/components/ui/page-container";
import { getRuleBySlug } from "@/lib/rules";

export default async function RuleDetailPage({ params }: Props) {
  const rule = await getRuleBySlug(slug);
  return (
    <PageContainer>
      <Breadcrumbs items={[...]} />
      {/* ^^^ ReferenceError at runtime — Breadcrumbs is not defined */}
    </PageContainer>
  );
}
```

### Right (prevents recurrence)

```tsx
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer } from "@/components/ui/page-container";
import { getRuleBySlug } from "@/lib/rules";

export default async function RuleDetailPage({ params }: Props) {
  const rule = await getRuleBySlug(slug);
  return (
    <PageContainer>
      <Breadcrumbs items={[...]} />
    </PageContainer>
  );
}
```

## Origin

- **Failure**: Every rule detail page (`/rules/[slug]`) showed "Failed to load rule" — `ReferenceError: Breadcrumbs is not defined` at runtime
- **Date**: 2026-03-13
- **Root cause**: `Breadcrumbs` component used in JSX without an import statement; `next build` (SWC) did not catch the missing identifier
- **PR**: fix/rules-detail-breadcrumbs

## Detection Acceleration

Three improvements shift detection leftward:

- **Level**: Build script
  **What was added**: `"typecheck": "tsc --noEmit"` script in `package.json`. Developers can run `bun run typecheck` locally to catch missing imports that `next build` ignores. Full-project enforcement is blocked by 700+ pre-existing type errors; future work should incrementally fix those and add `bun run typecheck` to CI.
  **Diagnosis time before**: Only discovered at runtime when visiting the affected page
  **Diagnosis time after**: `bun run typecheck` catches TS2304 in ~7 seconds

- **Level**: CI (smoke test)
  **What was added**: `scripts/smoke.sh` now dynamically discovers detail page slugs from API responses and visits them. Previously it only checked listing pages (`/skills`, `/rules`), missing detail pages entirely.
  **Diagnosis time before**: Smoke test passed because it never visited `/rules/<slug>`
  **Diagnosis time after**: Smoke test visits at least one detail page per entity type — a ReferenceError returns non-200, failing the check

- **Level**: Editor (this rule)
  **What was added**: This Cursor rule fires on every agent edit, reminding the agent to verify imports match JSX usage in server components.
  **Diagnosis time before**: Agent added `<Breadcrumbs>` without noticing the missing import
  **Diagnosis time after**: Rule triggers before the edit is committed

## Shell Operator Precedence

> Applies when writing or editing shell scripts (.sh files) or inline bash in CI workflows _globs: `**/*.sh`_

# Shell Operator Precedence — Learned from runtime crash

`||` and `&&` in bash have **equal precedence** and **left-to-right associativity**. `A || B && C` parses as `(A || B) && C`, NOT `A || (B && C)`. This is unlike most programming languages where `&&` binds tighter than `||`. A command substitution using `$(cmd1 || cmd2 && cmd3)` will execute `cmd3` even when `cmd1` succeeds, silently appending extra output to the captured variable.

## The Rule

When combining `||` (fallback) and `&&` (chained commands) in the same expression, **always use explicit grouping** with subshells `()` or braces `{}` to make the intended precedence unambiguous.

### Variable assignment with fallback

```bash
# WRONG — pwd runs even when git rev-parse succeeds
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$FALLBACK" && pwd)"

# RIGHT — subshell groups the fallback chain
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$FALLBACK" && pwd))"
```

### Command fallback chains

```bash
# WRONG — cleanup runs after either branch
do_primary || do_fallback && cleanup

# RIGHT — cleanup only runs after fallback
do_primary || (do_fallback && cleanup)

# RIGHT — cleanup runs after whichever succeeds
do_primary || do_fallback
cleanup
```

### Conditional execution

```bash
# WRONG — echo runs even when cmd1 succeeds (if cmd1 exits 0)
cmd1 || cmd2 && echo "done"

# RIGHT — echo only after fallback succeeds
cmd1 || { cmd2 && echo "done"; }

# RIGHT — echo after either path succeeds
{ cmd1 || cmd2; } && echo "done"
```

## The Precedence Table

| Expression | Bash parses as | Common misreading |
|---|---|---|
| `A \|\| B && C` | `(A \|\| B) && C` | `A \|\| (B && C)` |
| `A && B \|\| C` | `(A && B) \|\| C` | (usually correct intent) |
| `A \|\| B && C \|\| D` | `((A \|\| B) && C) \|\| D` | Unpredictable |

**Rule of thumb:** If your expression has both `||` and `&&`, add explicit grouping. The two seconds it takes to add parentheses saves hours of debugging silent data corruption.

## Especially Dangerous: Command Substitutions

Inside `$(...)`, extra commands silently append their stdout to the captured value. This produces variables with embedded newlines or concatenated paths — failures that are invisible until the variable is used.

```bash
# This captures TWO lines: git output + pwd output
VAR="$(git rev-parse --show-toplevel || cd /fallback && pwd)"
# VAR now contains "/repo\n/repo" — cd "$VAR" fails with "No such file or directory"
```

The error message gives no hint about the doubled value. The failure appears in `cd`, not in the assignment where the bug actually lives.

## Examples

### Wrong (caused the failure)

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$(dirname "$0")/../../../.." && pwd)"
```

When `git rev-parse` succeeds, bash still runs `pwd` (because `(A || B) && C` — C runs when the overall left side is truthy). `PROJECT_ROOT` gets the git output plus a second line from `pwd`, creating a path with an embedded newline.

### Right (prevents recurrence)

```bash
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/../../../.." && pwd))"
```

The subshell `(cd ... && pwd)` groups the fallback — `pwd` only runs if `cd` succeeds inside the fallback branch.

## Origin

- **Failure**: `start-hub.sh` (formerly `fresh-aos.sh`) crashed on line 11 — `cd "$PROJECT_ROOT"` failed with "No such file or directory" because `PROJECT_ROOT` contained a doubled path separated by a newline
- **Date**: 2026-03-13
- **Root cause**: Bash `||`/`&&` equal precedence caused `pwd` to execute unconditionally in a command substitution, appending a second line to the captured variable
- **PR**: fix/shell-operator-precedence

## Detection Acceleration

- **Level**: Pre-commit (shellcheck)
  **What was added**: `shellcheck` scan in `.husky/pre-commit` for all staged `.sh` files. ShellCheck SC2015 warns about `A && B || C` patterns; while it doesn't catch the exact `A || B && C` variant directly, it flags the broader class. The custom `scripts/lint-shell-precedence.sh` grep catches the specific `|| ... && ...` pattern inside `$(...)` command substitutions.
  **Diagnosis time before**: Runtime crash with misleading "No such file or directory" error — required tracing back through variable assignment to discover the doubled value
  **Diagnosis time after**: Pre-commit hook flags the pattern before it's ever committed

- **Level**: Runtime (self-validation)
  **What was added**: `start-hub.sh` now validates that `PROJECT_ROOT` is a real directory immediately after assignment, with an explicit error message naming the variable and its value
  **Diagnosis time before**: Generic "No such file or directory" from `cd` with no indication the path was malformed
  **Diagnosis time after**: Immediate error: "PROJECT_ROOT is not a valid directory: <value>"

## Skill Creation Worktree

> Enforce worktree-per-skill when creating new Cursor skills _always-applied_

# Skill Creation — Always Use a Dedicated Worktree

When the user asks to create a new skill (project or personal), **set up a dedicated worktree before writing any files**. Each skill gets its own branch, its own worktree, and its own PR.

## Workflow

1. **Create the worktree** using the `feat/` prefix and the skill name:
   ```bash
   bash scripts/setup-worktree.sh feat/<skill-name>-skill <short-name>
   cd /Users/jdetlefs001/one/skills-hub-wt/<short-name>
   ```

2. **Create the skill** in the worktree — `SKILL.md`, scripts, `CHANGELOG.md`, and any supporting files.

3. **Commit, push, and open a PR** from the worktree following the standard branching workflow.

## Why

- Skills often touch multiple files (SKILL.md, scripts, rules, seed data, changelogs). A dedicated branch keeps the diff reviewable.
- Multiple skills can be developed in parallel without branch switching.
- The user can review each skill as an isolated PR before merging to main.

## What This Means in Practice

- `create a skill` = create a worktree first, then build the skill inside it
- `update a skill` that already has an open PR = `cd` into its existing worktree
- `update a skill` on main = create a new worktree (e.g., `fix/<skill-name>-update`)
- Never create or modify skill files in the primary worktree

## Skill & Rule Lineage

> Broad-narrow inheritance model for skills and rules _always-applied_

# Skill & Rule Lineage — Broad/Narrow Inheritance

Skills and rules follow a two-tier classification: **broad** (foundational, reusable) and **narrow** (specialized for a specific business outcome). The relationship is many-to-many — a narrow item can extend multiple broad items, and a broad item can have multiple narrow specializations.

## When to Classify

| Type | Use when | Examples |
|------|----------|----------|
| **Broad** | The capability is general-purpose and reusable across domains | `compare-word-docs` (any .docx comparison), `react-component-patterns` |
| **Narrow** | The capability solves a specific business workflow | `compare-deep-dives` (Deep Dive documents), `react-hooks-discipline` |

Default is `narrow`. Only classify as `broad` when the skill/rule explicitly serves as scaffolding that other items build upon.

## Relationship Types

| Relationship | Meaning |
|---|---|
| `extends` | The narrow item builds directly on the broad item's core capability |
| `augments` | The narrow item uses the broad item as a supporting building block, not its primary lineage |

## Declaring Lineage in SKILL.md

Narrow skills declare their parents in frontmatter:

```yaml
---
name: compare-deep-dives
skillType: narrow
extends: [compare-word-docs]
---
```

Broad skills list their specializations (informational — source of truth is `extends` on the narrow side):

```yaml
---
name: compare-word-docs
skillType: broad
narrowSpecializations: [compare-deep-dives]
---
```

## Naming Conventions

- Broad skills use general verbs describing the capability: `compare-word-docs`, `generate-mermaid`
- Narrow skills add the business context: `compare-deep-dives`, `generate-arch-diagrams`

## Database Representation

Lineage is stored in junction tables:

- `SkillLineage(broadSkillId, narrowSkillId, relationship)`
- `RuleLineage(broadRuleId, narrowRuleId, relationship)`

Both use ON DELETE CASCADE. The `Skill.skillType` and `Rule.ruleType` columns store the tier classification.

## Rules

1. Every narrow skill/rule that extends a broad parent must declare it in both the SKILL.md frontmatter (`extends:`) and the seed data (`SkillLineage`/`RuleLineage` rows).
2. A broad skill should be usable on its own — it is not just an abstract base. Users should be able to invoke it directly for general-purpose work.
3. Do not create circular lineage. Broad items never extend narrow items.
4. When adding a new narrow skill, check if an existing broad skill covers the foundational capability. If so, extend it rather than duplicating.
5. The UI shows lineage on detail pages: "Extends" for parents, "Specializations" for children. Both link to the related item.

## Sticky Zindex Hierarchy

> z-index layering for sticky/fixed positioned elements _always-applied_

# Sticky Z-Index Hierarchy — Learned from header hidden behind page content

The site header (`<header>` in `Header.tsx`) used `z-50`, the same z-index as game overlays and other page elements. When page content created stacking contexts (via `transform`, `will-change`, `position: relative` with z-index, or `backdrop-filter`), the header was painted behind them on scroll. Users could not reach the navigation.

## The Rule

All sticky and fixed positioned elements must follow this z-index hierarchy. Never assign a z-index to a new sticky/fixed element without consulting this table.

### Z-Index Ladder

| z-index | Layer | Elements | Notes |
|---|---|---|---|
| none | Page content | Cards, sections, grids | No z-index needed |
| `z-10`–`z-20` | In-page accents | Decorative overlays, floating labels | Keep low |
| `z-30` | Filter bars | `sticky top-14` filter toolbars on `/skills`, `/rules` | Below sub-navs |
| `z-40` | Sub-navigation | `sticky top-14` section tabs on `/about`, `/mcp-servers`, `/learn/*` | Below header |
| `z-50` | Page overlays | Game panels (Intern Quest), tooltips, popovers | Temporary, dismissible |
| `z-[59]` | Reading progress | `fixed top-14` progress bar | Just below header |
| `z-[60]` | **Site header** | `sticky top-0` main navigation | Always above page content |
| `z-[100]` | Modal overlays | Command palette, keyboard shortcuts, skip-to-content | Above everything except onboarding |
| `z-[9999]` | Fullscreen takeover | Onboarding/welcome overlay | Nuclear option — only one element |

### When adding a new positioned element

1. Determine whether the element is **page content** (no z-index), **page-level sticky** (z-30–z-50), **site-level chrome** (z-[60]), or **overlay** (z-[100]+).
2. Pick the z-index from the table above. Do not invent a new tier.
3. If the element must appear above the header, it must be a modal/overlay with `fixed` positioning and `z-[100]` or higher.
4. Never give page content (cards, sections, hero elements) a z-index >= 50. If a card needs to overlap its siblings, use `z-10` or `z-20`.

### What creates stacking contexts (and breaks sticky elements)

These CSS properties create a new stacking context, which can cause elements inside to paint above sticky elements even without an explicit z-index:

- `transform` (including `translate`, `scale`, `rotate`)
- `will-change: transform` or `will-change: opacity`
- `filter` / `backdrop-filter`
- `opacity` less than 1
- `isolation: isolate`
- `contain: paint` or `contain: layout`
- `position: fixed` or `position: sticky` (always creates a stacking context)

When using any of these on page content, verify that the element doesn't visually overlap the header by scrolling past it.

## Examples

### Wrong (caused the failure)

```tsx
// Header at z-50 — same level as game overlays and other page elements
<header className="sticky top-0 z-50 ...">

// Game overlay also at z-50 — competes with header
<div className="fixed bottom-20 z-50 ...">

// Card with transform creates stacking context, can paint above z-50 header
<div className="relative transition-transform hover:scale-105">
```

### Right (prevents recurrence)

```tsx
// Header at z-[60] — dedicated tier, above all page content
<header className="sticky top-0 z-[60] ...">

// Game overlay at z-50 — below header, above filter bars
<div className="fixed bottom-20 z-50 ...">

// Cards stay in page-content tier (no z-index or low z-index)
<div className="relative transition-transform hover:scale-105">
```

## Origin

- **Failure**: Site header was hidden behind page content when scrolling — navigation was unreachable
- **Date**: 2026-03-14
- **Root cause**: Header used `z-50`, the same tier as game overlays and tooltips. Page content with `transform` or `position: relative` created stacking contexts that painted above the header.
- **PR**: fix/sticky-zindex-visibility

## Detection Acceleration

- **Level**: E2E test (CI)
  **What was added**: `e2e/sticky-visibility.spec.ts` — scrolls every major route and verifies the header remains visible and clickable above all page content. Also checks that all sticky sub-navs and filter bars remain visible.
  **Diagnosis time before**: Only discoverable through manual testing during a demo
  **Diagnosis time after**: Test failure with clear message: "Header is not visible after scrolling on /skills"

## Subprocess Limit

> Cap subprocess spawning to prevent fork bombs and runaway parallelism _always-applied_

# Subprocess Limit — Max 49 Concurrent Processes

Never spawn more than **49 subprocesses** from a single script, hook, or agent operation. This prevents fork bombs, file-descriptor exhaustion, and macOS process-table pressure that cause hangs and system instability.

## The Rule

Any code path that spawns child processes — `Bun.spawn()`, `child_process.exec()`, shell backgrounding (`&`), `xargs -P`, GNU `parallel`, or batch loops — must enforce a concurrency cap of **49**.

### Shell scripts

```bash
MAX_PROCS=49

# WRONG — unbounded parallelism
for branch in $BRANCHES; do
  process_branch "$branch" &
done
wait

# RIGHT — capped parallelism
RUNNING=0
for branch in $BRANCHES; do
  process_branch "$branch" &
  RUNNING=$((RUNNING + 1))
  if [ "$RUNNING" -ge "$MAX_PROCS" ]; then
    wait -n 2>/dev/null || wait
    RUNNING=$((RUNNING - 1))
  fi
done
wait
```

### xargs / parallel

```bash
# WRONG — default parallelism (unlimited or CPU-count)
echo "$FILES" | xargs -P0 -I{} process {}

# RIGHT — explicit cap
echo "$FILES" | xargs -P49 -I{} process {}
```

### TypeScript / Bun

```typescript
const MAX_CONCURRENT = 49;

async function processInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
) {
  for (let i = 0; i < items.length; i += MAX_CONCURRENT) {
    const batch = items.slice(i, i + MAX_CONCURRENT);
    await Promise.all(batch.map(fn));
  }
}
```

### Agent subagents

The Task tool already caps at 4 concurrent subagents. This rule applies to processes spawned *within* those subagents or by scripts they invoke.

## Why 49

- macOS defaults to 266 max processes per user (`sysctl kern.maxprocperuid`). A single script spawning 100+ children consumes nearly half the budget, starving the IDE, dev server, and other tools.
- File descriptor limits (`ulimit -n`, typically 256–10240) are shared across all children. Each subprocess inherits open FDs; unbounded spawning can hit the ceiling and cause `EMFILE` errors.
- 49 leaves headroom for the parent process, the shell, the IDE, dev servers, database connections, and other background work.

## When This Applies

| Context | Limit |
|---|---|
| Shell scripts (hooks, CI, dev tools) | 49 |
| TypeScript/Bun batch operations | 49 |
| `xargs -P` / GNU `parallel` | 49 |
| Makefile parallel jobs (`make -j`) | 49 |
| Agent subagents (Task tool) | 4 (enforced by tool) |

## Exceptions

- Single-process pipelines (e.g., `cmd1 | cmd2 | cmd3`) don't count — these are sequential with buffering.
- `Promise.all` over async I/O (HTTP requests, DB queries) is fine up to ~100 concurrent *connections* since these don't spawn OS processes. Use a semaphore if the target service has its own concurrency limits.

## Origin

- **Observation**: Mass merge of 161 branches via shell loop risked spawning unbounded parallel processes
- **Date**: 2026-03-14
- **Principle**: Defense in depth — even if the OS can handle more, capping at 49 prevents cascading failures when multiple scripts run simultaneously

## Tailwind CSS Class Management

> Tailwind CSS class management — cn() composition, class length limits, design token usage, and anti-patterns _globs: `**/*.tsx,**/*.css`_

# Tailwind CSS Class Management

This project uses Tailwind CSS v4 with CSS-first configuration (`@theme inline` in `globals.css`). All class composition goes through the `cn()` helper.

## Always Use `cn()` for Conditional Classes

Never use template literal ternaries for className composition. The `cn()` helper from `@/lib/cn` combines `clsx` (conditional logic) with `tailwind-merge` (conflict resolution).

```tsx
// Wrong — template literal
className={`px-4 py-2 ${isActive ? "bg-primary text-white" : "bg-secondary text-muted"}`}

// Wrong — string concatenation
className={"px-4 py-2 " + (isActive ? "bg-primary" : "bg-secondary")}

// Correct — cn()
className={cn("px-4 py-2", isActive ? "bg-primary text-white" : "bg-secondary text-muted")}

// Correct — boolean shorthand for single class
className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
```

`cn()` also resolves conflicts: `cn("px-2", "px-4")` returns `"px-4"`, not both. This matters when consumers override classes on shared components.

## Composing External Classes

When a component accepts a `className` prop, merge it last so consumer overrides win:

```tsx
function MyComponent({ className, ...props }: { className?: string }) {
  return <div className={cn("base-classes", className)} {...props} />;
}
```

## Class Length Limit

If a `className` exceeds ~80 characters, the element needs refactoring:

| Signal | Action |
|---|---|
| Long class string on a `<button>` | Use `<Button variant="..." size="...">` from `ui/button` |
| Long class string on an `<input>` or `<textarea>` | Use `<Input>` / `<Textarea>` from `ui/input` |
| Long class string with conditional logic | Extract to `cn()` with named parts or a CVA variant |
| Same class pattern in 3+ places | Extract to a shared component in `src/components/ui/` |

## Use Design Tokens, Not Arbitrary Values

Prefer theme-defined colors and spacing over Tailwind arbitrary values. If an arbitrary value appears 3+ times, add it to the `@theme` block in `globals.css`.

```tsx
// Wrong — hardcoded color
className="bg-[#D04A02]"

// Correct — uses theme token
className="bg-primary"

// Acceptable — truly one-off value
className="max-w-[140px]"
```

The design tokens are defined as CSS custom properties in `:root` and mapped to Tailwind via `@theme inline`. All semantic colors (`primary`, `secondary`, `accent`, `muted`, `border`, `card`, `success`, `warning`, `error`) are available as Tailwind utilities.

### Color Contrast — Text-Safe Variants

Semantic colors like `success`, `warning`, `error`, and `accent` are too bright to use as text colors on light backgrounds. Each has a contrast-safe `-text` variant for use in text contexts:

| Background use | Text use |
|---|---|
| `bg-primary` | `text-primary-text` (not `text-primary` for body text) |
| `bg-success` | `text-success-text` (not `text-success`) |
| `bg-warning` | `text-warning-text` (not `text-warning`) |
| `bg-accent` | `text-accent-text` (not `text-accent`) |
| `bg-error` | `text-error-text` (not `text-error`) |

These `-text` tokens auto-switch between darker (light mode) and lighter (dark mode) shades via CSS custom properties. See `color-contrast.mdc` for the full approved pairing table with computed contrast ratios.

## No `@apply` for Component Styles

`@apply` copies utility classes into a CSS rule — it looks like abstraction but breaks component colocation and makes overrides harder.

```css
/* Wrong — @apply in globals.css */
.btn-primary {
  @apply rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white;
}
```

Instead, extract a React component with CVA variants. The component encapsulates both structure and styling, and consumers override via `className` + `cn()`.

## Class Ordering Convention

Follow the logical order that Tailwind's Prettier plugin enforces:

1. **Layout** — `flex`, `grid`, `block`, `inline-flex`, `absolute`, `relative`
2. **Sizing** — `w-full`, `h-10`, `min-w-0`, `max-w-md`
3. **Spacing** — `p-4`, `px-3`, `m-2`, `gap-2`
4. **Typography** — `text-sm`, `font-medium`, `truncate`, `leading-relaxed`
5. **Colors** — `bg-card`, `text-foreground`, `border-border`
6. **Borders & shadows** — `rounded-lg`, `border`, `shadow-sm`
7. **Transitions** — `transition-all`, `duration-300`
8. **States** — `hover:`, `focus:`, `disabled:`, `group-hover:`

## Inline Styles

Only use `style={{}}` for values that are truly dynamic at runtime (computed from JavaScript, not from a fixed set of options):

```tsx
// Acceptable — width comes from data
style={{ width: `${percentage}%` }}

// Acceptable — staggered animation delay
style={{ transitionDelay: `${index * 100}ms` }}

// Wrong — should be a Tailwind class
style={{ padding: "16px" }}  // Use p-4
style={{ color: "#D04A02" }} // Use text-primary
```

## Dark Mode

This project uses CSS variable theming with `data-theme` attribute and `prefers-color-scheme` media query. Dark mode overrides are defined in `globals.css` by reassigning CSS custom properties.

For component-level dark overrides, use Tailwind's `dark:` modifier:

```tsx
className="bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
```

When the same light/dark pair appears in 3+ places, consider adding it as a semantic token in the `@theme` block.

## Anti-Patterns

- **Template literal classNames** — always use `cn()` instead
- **Duplicate long class strings** — extract to a shared UI component
- **`@apply` for reusable styles** — use React component extraction
- **Arbitrary values for theme colors** — add to `@theme` instead
- **`!important` overrides** — fix specificity with proper `cn()` ordering instead
- **Conditional classes without `cn()`** — even `clsx` alone doesn't resolve Tailwind conflicts; always use `cn()` which wraps `tailwind-merge`

## Tailwind Component Primitives

> Tailwind component primitives — CVA variants, shared UI components, composition patterns _globs: `src/components/ui/*.tsx,src/components/*.tsx`_

# Tailwind Component Primitives

Shared UI primitives live in `src/components/ui/`. They use `class-variance-authority` (CVA) for typed variant maps and `cn()` for class composition.

## Available Primitives

| Component | Path | Variants |
|---|---|---|
| `Badge` | `ui/badge` | `size`: sm, md |
| `Button` | `ui/button` | `variant`: primary, secondary, ghost, danger, success, warning, inverse; `size`: sm, md, lg, xl |
| `Input` | `ui/input` | `variant`: default, ghost, error; `inputSize`: sm, md, lg |
| `Textarea` | `ui/input` | Same as Input |
| `Select` | `ui/input` | Same as Input |
| `Card` | `ui/card` | `variant`: default, interactive, accent, success; `padding`: none, sm, md |

## When to Use Primitives vs Inline Classes

| Situation | Use |
|---|---|
| Any `<button>` with visual styling | `<Button variant="..." size="...">` |
| Any `<input>`, `<textarea>`, `<select>` in a form | `<Input>`, `<Textarea>`, `<Select>` from `ui/input` |
| Any status/category/domain badge | Existing domain badge wrappers (e.g., `CategoryBadge`) or `<Badge>` directly |
| A container with border + bg + shadow | `<Card>` or card classes via `cardVariants()` |
| A Link styled as a button | `<Link className={cn(buttonVariants({ variant, size }), "extra-classes")}>` |

Never hand-write `rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white` on a raw `<button>` — use the `Button` component.

## CVA Structure

Every primitive follows this pattern:

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const thingVariants = cva(
  "base-classes-shared-by-all-variants",
  {
    variants: {
      variant: {
        default: "variant-specific-classes",
        alternate: "other-classes",
      },
      size: {
        sm: "small-size-classes",
        md: "medium-size-classes",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);
```

### Rules for CVA Definitions

1. **Base classes** contain everything shared across all variants — layout, typography, transitions, focus styles.
2. **Variant classes** contain only what differs — colors, sizes, padding.
3. **`defaultVariants`** is required — consumers should get a sensible default without specifying every variant.
4. **Export the variants function** alongside the component — consumers may need it for Links or polymorphic elements.

## Every Primitive Accepts `className`

The `className` prop is merged last via `cn()` so consumers can override any default:

```tsx
export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
```

This means `<Button variant="primary" className="w-full">` works — `w-full` is added without conflicting with the variant's padding.

## Use `forwardRef` for Interactive Elements

Inputs, buttons, textareas, and selects need ref forwarding for form libraries and focus management:

```tsx
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ variant, inputSize, className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(inputVariants({ variant, inputSize }), className)}
      {...props}
    />
  )
);
Input.displayName = "Input";
```

## Domain Badge Pattern

Domain-specific badges (CategoryBadge, DomainBadge, SeniorityBadge, etc.) are thin wrappers over the generic `Badge` primitive. They:

1. Look up metadata from a `*_META` record in `@/types`
2. Resolve the icon via `resolveIcon()` from `@/lib/icons`
3. Pass everything to `<Badge icon={...} label={...} colorClasses={...} />`

When creating a new badge type:

```tsx
import { resolveIcon } from "@/lib/icons";
import { SOME_META, type SomeType } from "@/types";
import { Badge } from "./ui/badge";

export function SomeBadge({ value, className }: { value: SomeType; className?: string }) {
  const meta = SOME_META[value];
  if (!meta) return null;

  return (
    <Badge
      icon={resolveIcon(meta.icon)}
      label={meta.label}
      colorClasses={meta.color}
      className={className}
    />
  );
}
```

Add the icon to `ICON_REGISTRY` in `src/lib/icons.ts` if it's not already there.

## Adding New Variants

When an existing primitive needs a new variant:

1. Add the variant value to the CVA `variants` object
2. Add corresponding TypeScript type (automatic via `VariantProps`)
3. Update this rule's "Available Primitives" table

When a component needs styling that doesn't fit any existing primitive, create a new one in `src/components/ui/` following the CVA pattern. Don't add one-off styling to an existing primitive's base classes.

## Directory Convention

```
src/components/
├── ui/                  # Shared primitives (Badge, Button, Input, Card)
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   └── input.tsx
├── CategoryBadge.tsx    # Domain wrapper over Badge
├── SkillCard.tsx        # Domain component using primitives
└── ...
```

- `ui/` contains generic, domain-agnostic primitives
- Domain components in `src/components/` consume `ui/` primitives and add business logic
- Page components in `src/app/` consume domain components

## Test Content Indirection

> Tests must not hardcode content directory paths — use the content API or a shared resolver _always-applied_

# Test Content Indirection — Learned from CI breakage after directory restructuring

Three test files hardcoded filesystem paths like `join(process.cwd(), "content", "posts", SLUG, "versions", "ai.html")` to read post content directly. When the directory structure was reorganized (`content/posts/` → `posts/YYYY-qN/`), the content API (`getPost`, `getAllPosts`) was updated but every test that bypassed the API and constructed its own path broke with `ENOENT`. Additionally, six CSS assertion tests checked for class definitions that were never added to `blog.css` — they were aspirational assertions that shipped broken and stayed broken on `main` for days without anyone noticing because the test step failure was treated as "known flaky."

## The Rules

### 1. Never hardcode content directory structure in tests

Tests that need to read raw file content (HTML, JSON, CSS) must resolve the path through a shared helper or the content API — never by manually constructing a path with knowledge of the directory layout.

```typescript
// WRONG — hardcodes directory structure, breaks on reorganization
const AI_FILE = join(process.cwd(), "content", "posts", SLUG, "versions", "ai.html");
const body = readFileSync(AI_FILE, "utf-8");

// WRONG — still hardcodes, just a different structure
const AI_FILE = join(process.cwd(), "posts", "2026-q1", SLUG, "versions", "ai.html");

// RIGHT — use the content API, which knows the current structure
import { getPost } from "@/lib/posts";
const post = getPost(SLUG);
const body = post?.kind === "multi"
  ? post.versions.find(v => v.key === "ai")?.bodyHtml ?? ""
  : "";

// RIGHT (when you genuinely need the raw file) — use a resolver
import { resolvePostPath } from "@/lib/posts";
const aiPath = resolvePostPath(SLUG, "versions/ai.html");
const body = readFileSync(aiPath, "utf-8");
```

When a test genuinely needs raw file access (e.g., checking HTML structure, not just content), the content module should export a path resolver that encapsulates the directory structure. The test calls the resolver; only the resolver knows where files live.

### 2. Never ship tests that assert things that don't exist yet

Every test assertion must verify **existing behavior**, not **intended future behavior**. If CSS classes haven't been written yet, the test should not exist yet. Tests are verification, not specification.

```typescript
// WRONG — asserts CSS that was never written; ships broken, stays broken
test("defines accountability-table styling", () => {
  expect(css).toContain(".accountability-table {");
});

// RIGHT — only add this test after the CSS exists and is verified working
// Or, if writing test-first: the test must be in the same commit/PR as the implementation
```

If you genuinely want test-driven development (write test first, then implement), both the test and the implementation must land in the same PR. A test that ships without its implementation is a broken test, not TDD.

### 3. CI failures on main must be fixed immediately

A failing CI on `main` is not "known flaky" — it's a broken build. When CI fails on `main`:

1. Stop all feature work
2. Fix the failure on `main` directly (or revert the breaking commit)
3. Only resume feature work after `main` is green

Letting `main` stay red normalizes failure. Every subsequent PR's CI failure becomes ambiguous: "is this my fault or the pre-existing thing?" This ambiguity is exactly how the CSS test failures survived for days.

### 4. One content structure, one source of truth

The directory structure for content must be defined in exactly one place — the content module (`lib/posts.ts`). Everything else (tests, scripts, CI, smoke tests) must go through that module or its exports. If three files independently construct `content/posts/...` paths, that's three places that break when the structure changes instead of one.

| Accessor | Allowed? | Why |
|---|---|---|
| `getPost(slug)` | Yes | API returns parsed content |
| `getAllPosts()` / `getAllQuarters()` | Yes | API returns all content |
| `resolvePostPath(slug, subpath)` | Yes (if exported) | Centralizes path knowledge |
| `join(process.cwd(), "posts", quarter, slug, ...)` | No | Duplicates structural knowledge |
| `readFileSync("content/posts/...")` | No | Hardcodes a structure that may change |

## Quick Test: Is My Test Fragile?

Before writing a test that reads from the filesystem, ask:

1. Does this test construct a path using more than one directory segment beyond `process.cwd()`? → Use the content API instead
2. If the content directory were renamed tomorrow, would this test break? → It's fragile; use a resolver
3. Does this test assert something that doesn't exist in the codebase yet? → Ship the implementation first

## Origin

- **Failure 1**: Three test files (`mental-health-voice.test.ts`, `mental-health-content.test.ts`, `posts-mental-health.test.ts`) hardcoded `content/posts/` paths that broke when content moved to `posts/YYYY-qN/`
- **Failure 2**: Six CSS tests in `mental-health-content.test.ts` asserted class definitions (`.accountability-table`, `.video-embed`, `.timeline-marker`, `.authorship-badge`, `details`, `::-webkit-details-marker`) that were never added to `blog.css` — tests were aspirational and shipped broken
- **Date**: 2026-03-21
- **Root cause**: Tests duplicated knowledge of the content directory structure instead of using the content API; CSS tests asserted intended-but-unimplemented styles
- **PR**: feat/quarter-timeline-posts (#37)

## Detection Acceleration

- **Level**: CI
  **What was added**: The CSS and path fixes landed in PR #37. Once merged, `main` CI will be green for the first time since `5a49610`.
  **Diagnosis time before**: 6 CSS tests failed silently on `main` for days; path failures appeared only after restructuring
  **Diagnosis time after**: This rule prevents both patterns at authoring time

- **Level**: Editor (this rule)
  **What was added**: Always-applied Cursor rule that instructs agents to use the content API for test file access and never ship assertions without implementations.
  **Diagnosis time before**: Agent writes `join(process.cwd(), "content", "posts", ...)` and the failure appears only after the next directory change
  **Diagnosis time after**: Agent sees this rule and uses `getPost()` or a resolver instead

## Testing

> Testing style - DRY, concise, consolidated _always-applied_

# Testing

## DRY & Conciseness

- Extract shared setup into helper functions or fixtures — never duplicate document/object construction across tests.
- When multiple tests differ only by input/output, use `@pytest.mark.parametrize` instead of copy-pasting the test body.
- When several checks iterate the same collection (type, length, non-empty), do them in one loop inside one test — don't write a separate test per property.
- Prefer object equality (`assert actual == expected`) over many individual field asserts.
- Be concise but not clever — straightforward loops and parametrize are good; deeply nested comprehensions or metaprogramming in tests are not.

## Consolidation (always apply after writing initial tests)

After writing the first draft of tests, always perform a consolidation pass before considering the work done:

1. **Merge subset tests** — if test A checks a strict subset of what test B checks, delete A.
2. **Parametrize related cases** — when multiple tests call the same function with different inputs and just check the output, combine them into a single `@pytest.mark.parametrize` test.
3. **Fold edge cases into parent tests** — empty input, `None`, missing file, and similar edge cases should be extra assertions inside the main test for that function, not standalone tests.
4. **Combine IO round-trips** — load-from-nonexistent + save + load-back can be a single test; don't split load, save, and round-trip into three.
5. **Combine iteration-based structural checks** — if several tests each iterate the same collection checking a different property (type, length, non-empty), merge them into one loop.
6. **Target roughly 50 % of the naive count** — the initial draft will typically have 2x more tests than needed; the consolidated suite should be around half.

## Local Test Speed — pytest-testmon

- **Always use `--testmon` locally** to run only tests affected by your changes: `poetry run pytest --testmon`
- A pre-commit hook runs `pytest --testmon` automatically on every commit — only affected tests execute.
- The `.testmondata` file is the dependency database. It's gitignored and rebuilt per machine. If tests behave strangely, delete it to force a full rebuild: `rm .testmondata && poetry run pytest --testmon`
- **CI always runs the full suite** (`pytest --cov`) without testmon — testmon is a local-speed optimization only.

## Coverage Gate — Pre-push Hook

- A **pre-push hook** runs `pytest --cov --cov-fail-under=75` before every `git push`. This catches coverage regressions locally before they fail in CI.
- The hook is installed automatically by `make setup` (which runs `pre-commit install --hook-type pre-push`).
- When adding new script modules, either write tests or add the module to `[tool.coverage.run].omit` in `pyproject.toml` (with a comment explaining why, e.g., Playwright-only code with no unit-testable logic).
- To bypass the hook in an emergency: `git push --no-verify` — but CI will still enforce the threshold.

## Transition Property Specificity

> Use specific CSS transition properties instead of transition-all to avoid layout thrashing _always-applied; globs: `src/**/*.tsx`_

# Transition Property Specificity — Learned from widespread transition-all overuse

50+ components use Tailwind's `transition-all`, which transitions every CSS property on the element — including layout-triggering properties like `width`, `height`, `margin`, and `padding`. When hover or state changes modify these properties alongside visual ones (color, shadow), the browser runs layout recalculation on every animation frame even though only the visual properties needed transitioning.

## The Rule

Never use `transition-all` in new code. Always specify the exact properties being transitioned.

### Replacement table

| If you are transitioning... | Use instead of `transition-all` |
|---|---|
| Colors (text, background, border) | `transition-colors` |
| Opacity | `transition-opacity` |
| Transform (scale, translate, rotate) | `transition-transform` |
| Box shadow | `transition-shadow` |
| Colors + shadow | `transition-[color,background-color,border-color,box-shadow]` |
| Colors + transform | `transition-[color,background-color,border-color,transform]` |
| Opacity + transform | `transition-[opacity,transform]` |
| Multiple specific properties | `transition-[prop1,prop2,prop3]` (Tailwind arbitrary value) |

### Why `transition-all` is harmful

1. **Layout thrashing** — if `width`, `height`, `padding`, or `margin` change during a transition, the browser recalculates layout every frame. `transition-all` animates these even when they aren't the intended target.
2. **Paint invalidation** — properties like `box-shadow` and `background-color` trigger paint. Transitioning them alongside layout properties compounds the cost.
3. **Unintended animations** — when new CSS properties are added to an element later, `transition-all` silently transitions them. This creates unexpected animations and makes debugging harder.
4. **Compositor bypass** — only `opacity` and `transform` can be fully handled by the GPU compositor. `transition-all` prevents the browser from optimizing to compositor-only rendering.

### When `transition-all` might seem necessary

If an element transitions 4+ properties on hover, you likely need to simplify the hover effect. Most hover effects should change at most 2-3 properties. If you genuinely need many property transitions, list them explicitly:

```tsx
// Instead of transition-all, list what you need
className="transition-[color,background-color,border-color,box-shadow,transform] duration-300"
```

### Duration conventions

| Context | Duration |
|---|---|
| Button/link hover (colors only) | `duration-150` (150ms) |
| Card hover (shadow + border) | `duration-200` (200ms) |
| Panel expand/collapse | `duration-300` (300ms) |
| Page transition, large reveal | `duration-500` (500ms) |

## Examples

### Wrong (causes layout thrashing)

```tsx
<Link className="transition-all duration-300 hover:shadow-lg hover:border-primary/40">
```

This transitions shadow and border-color, but `transition-all` also animates any padding, margin, or width changes on the element.

### Right (only transitions what's needed)

```tsx
<Link className="transition-[box-shadow,border-color] duration-300 hover:shadow-lg hover:border-primary/40">
```

### Common patterns

```tsx
// Button — color + background change on hover
<button className="transition-colors duration-150 hover:bg-primary hover:text-white">

// Card — shadow + border on hover
<div className="transition-[box-shadow,border-color] duration-200 hover:shadow-md hover:border-primary/30">

// Icon — scale on hover
<div className="transition-transform duration-200 group-hover:scale-110">

// Tooltip — fade in/out
<div className="transition-opacity duration-200 opacity-0 group-hover:opacity-100">

// Dropdown menu — fade + slide
<div className="transition-[opacity,transform] duration-200">
```

## Origin

- **Failure**: 50+ components used `transition-all`, causing unnecessary layout recalculation during hover effects that only needed color/shadow/opacity transitions
- **Date**: 2026-03-16
- **Root cause**: `transition-all` was the default choice when adding any CSS transition, rather than specifying the exact properties being animated
- **PR**: fix/hover-animation-jank

## Turbopack Bun Externals

> Use createRequire for native Node packages in Next.js server code when running under bun --bun with Turbopack _globs: `src/lib/db*.ts`_

# Turbopack + Bun External Modules — Learned from runtime crash

Turbopack content-hashes external package names (e.g., `pg` becomes `pg-587764f78a6c7a9c`) when generating server-side module references. Node.js resolves these hashed names correctly, but Bun's `require()` cannot. Since this project runs `bun --bun next dev`, every `import { Pool } from "pg"` in server code fails at runtime with `Cannot find package 'pg-587764f78a6c7a9c'`.

`serverExternalPackages: ["pg"]` in `next.config.ts` does NOT fix this — it controls bundling, not the hash-based naming that Turbopack applies to external references.

## The Rule

In any server-side module processed by Next.js (files under `src/` imported by pages, layouts, API routes, or server actions), **never use a static `import` for `pg` or other native Node.js packages**. Use `createRequire` from `node:module` instead.

### Pattern

```typescript
import { createRequire } from "node:module";
import type { Pool as PoolType } from "pg"; // type-only import is safe (erased at compile time)

const req = createRequire(`${process.cwd()}/`);
const pg = req("pg") as typeof import("pg");
const { Pool, types } = pg;
```

### What's safe without the workaround

- **Type-only imports** (`import type { PoolClient } from "pg"`) — erased at compile time, never reach runtime.
- **Standalone scripts** that run outside Next.js (`scripts/`, `seed.ts`, MCP server) — Turbopack never processes them. Regular `import { Pool } from "pg"` is fine.
- **Test files** (`src/__tests__/`) — run by Bun's test runner, not Turbopack.

### What requires the workaround

Any `.ts` file under `src/` that:
1. Has a runtime (non-type) import of `pg`, AND
2. Is imported (directly or transitively) by a Next.js page, layout, API route, or server action

Currently this is only `src/lib/db.ts`. If you add another server module that imports `pg` at runtime, apply the same `createRequire` pattern.

### Keep `serverExternalPackages` too

Even though it doesn't fix the Bun issue, `serverExternalPackages: ["pg"]` in `next.config.ts` is correct defense-in-depth — it prevents Turbopack from attempting to bundle `pg` (which has native bindings). Keep it.

## Affected packages

This bug affects any package that Turbopack marks as external. Known affected packages beyond `pg`:

- `sharp`
- `pino` / `thread-stream`
- `@aws-sdk/*`
- `@tensorflow/tfjs-node`

If any of these are added to the project as server-side runtime dependencies, apply the same `createRequire` workaround.

## Upstream tracking

- Next.js issue: https://github.com/vercel/next.js/issues/86866
- Bun issue: https://github.com/oven-sh/bun/issues/25370
- Status: Open as of March 2026, no permanent fix

When either issue is resolved, the `createRequire` workaround can be reverted to a normal `import`.

## Examples

### Wrong (causes runtime crash under bun --bun)

```typescript
import { Pool, types } from "pg";

types.setTypeParser(1114, (str) => str);
```

### Right (works under bun --bun + Turbopack)

```typescript
import { createRequire } from "node:module";
import type { Pool as PoolType } from "pg";

const req = createRequire(`${process.cwd()}/`);
const pg = req("pg") as typeof import("pg");
const { Pool, types } = pg;

types.setTypeParser(1114, (str: string) => str);
```

## Origin

- **Failure**: Dev server returned 500 on every route — `Failed to load external module pg-587764f78a6c7a9c: Cannot find package`
- **Date**: 2026-03-11
- **Root cause**: Turbopack appends a content hash to external package names; Bun's module resolver cannot find the hashed package name at runtime
- **PR**: fix/learn-pg-failures

## TypeScript Style

> TypeScript style — strict types, modern patterns, Result types, exhaustive checks, iteration over reduce _globs: `**/*.{ts,tsx}`_

# TypeScript Style

## Strict Compiler Options

Every `tsconfig.json` must enable strict mode and additional safety flags:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

| Flag | What it catches |
|---|---|
| `noUncheckedIndexedAccess` | `arr[i]` returns `T \| undefined` — forces bounds checking |
| `exactOptionalPropertyTypes` | Distinguishes "absent" from "explicitly `undefined`" |
| `noPropertyAccessFromIndexSignature` | Forces `obj["key"]` over `obj.key` for index signatures |

## Type Patterns

### Discriminated unions for state

Model states that are mutually exclusive as discriminated unions, not boolean flags:

```typescript
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };
```

### Branded types for domain boundaries

Prevent mixing structurally identical but semantically different values:

```typescript
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

type UserId = Brand<string, "UserId">;
type SkillSlug = Brand<string, "SkillSlug">;

function getUser(id: UserId): User { ... }
getUser("raw-string" as UserId);
```

### Template literal types for string patterns

```typescript
type EventName = `on${Capitalize<string>}`;
type ApiRoute = `/api/${string}`;
type CSSUnit = `${number}${"px" | "rem" | "em" | "%"}`;
```

### `satisfies` for validation without widening

```typescript
const CONFIG = {
  port: 3000,
  host: "localhost",
} satisfies Record<string, string | number>;
// CONFIG.port is `number`, not `string | number`
```

### `as const satisfies` for immutable validated data

```typescript
const CATEGORIES = ["documentation", "testing", "devops"] as const satisfies readonly string[];
type Category = (typeof CATEGORIES)[number];
```

## Exhaustive Checks

Every `switch` on a union type must handle all cases. Use a `never` assertion for the default:

```typescript
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}

function handleState(state: AsyncState<Data>) {
  switch (state.status) {
    case "idle": return renderIdle();
    case "loading": return renderSpinner();
    case "success": return renderData(state.data);
    case "error": return renderError(state.error);
    default: return assertNever(state);
  }
}
```

Alternative: `default: return state satisfies never;` (compile-time only, no runtime check).

## Error Handling — Result Types

For functions that can fail in expected ways, prefer Result types over thrown exceptions:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

Use this for:
- Database queries that might not find a row
- Validation functions
- Parsing functions
- API calls where the caller needs to handle both paths

Use `try/catch` for:
- Unexpected infrastructure failures (network down, disk full)
- Top-level API route handlers (catch-all with 500 response)

## Iteration Over Reduce

Prefer `for...of`, `.map()`, `.filter()`, `.flatMap()`, and `Object.groupBy()` over `.reduce()`. Reduce obscures intent — a loop with a named accumulator is easier to read, debug, and review.

```typescript
// Avoid reduce to group
const grouped = Object.groupBy(items, item => item.type);

// Avoid reduce to sum
let total = 0;
for (const item of items) total += item.count;
```

Exception: simple one-liner sums or string joins where reduce is genuinely the clearest expression.

## No IIFEs

Extract logic into named functions or use block scoping. IIFEs add nesting and ceremony for no benefit.

```typescript
function resolveConfig(env: string) {
  if (env === "prod") return prodConfig;
  return devConfig;
}
const config = resolveConfig(env);
```

## Modern ECMAScript Features

Use the newest stable features. Prefer modern idioms over legacy patterns.

| Prefer | Over |
|---|---|
| `satisfies` for literal preservation | bare `as` casts |
| `using` / `Symbol.dispose` | manual try/finally cleanup |
| `Object.groupBy()` / `Map.groupBy()` | manual Map construction loops |
| `Object.fromEntries()` | manual object building loops |
| `Array.prototype.at(-1)` | `arr[arr.length - 1]` |
| `structuredClone()` | `JSON.parse(JSON.stringify())` |
| `??` and `??=` | `\|\|` for defaults |
| `import type` / `type` keyword in imports | bare imports for type-only use |
| Template literal types | string enums when pattern enforcement matters |
| Const type parameters (`<const T>`) | manual `as const` on call sites |
| `NoInfer<T>` | workarounds to prevent unwanted inference |

## Types: Inheritance and Extension

Build type hierarchies that mirror domain structure. Base types capture shared shape; extensions add specificity. Never duplicate fields across sibling types.

```typescript
interface SkillSummary {
  id: string;
  slug: string;
  name: string;
  category: Category;
}

interface SkillDetail extends SkillSummary {
  versions: Version[];
  dependencies: Dependency[];
}
```

- Use `interface extends` for data shapes with clear is-a relationships
- Use intersection (`&`) for ad-hoc composition or mixing in metadata
- Use `Pick`, `Omit`, `Partial`, `Required` to derive variants — don't redefine subsets by hand
- Use `satisfies` to validate object literals against a type while preserving narrow inference
- Row types (DB boundary) and public types (API/component boundary) are separate — map explicitly

## Import Organization

- Use `import type` for type-only imports — zero runtime cost, clearer intent
- Path aliases (`@/*`) over relative paths beyond one directory up
- Direct imports over barrel re-exports: `from "@/components/ui/Button"` not `from "@/components/ui"`
- Let Biome enforce import ordering — don't manually sort

## Runtime Validation

Use Zod at the boundary (API routes, env vars, external data), not deep inside business logic:

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().startsWith("postgresql://"),
  PORT: z.coerce.number().int().min(1).max(65535),
});

const env = envSchema.parse(process.env);
```

## Correct First, Optimize Later

Write the obvious, working version. Profile before optimizing. Never prematurely optimize at the cost of clarity.

1. Make it work — straightforward, readable, correct
2. Make it right — clean types, clear names, minimal abstraction
3. Make it fast — only with evidence (profiler, benchmarks, measured bottleneck)

## Self-Documenting Code

Code should read clearly without narration. Comments explain *why*, never *what*.

- Name variables and functions so the code reads as prose
- Extract complex conditions into well-named boolean variables or predicate functions
- Consolidate related log data into a single structured call
- Prefer `const` declarations and immutable patterns — mutability is the exception

## UI Verification Required

> Enforces UI verification after every major frontend change. Requires running the app, checking pages visually, and ensuring Playwright tests pass before considering work complete. _globs: `src/app/**/*.tsx, src/components/**/*.tsx, src/app/globals.css`_

# UI Verification Required

Every major UI change must be verified before it is considered complete. Do not move on until verification passes.

## Definition of "Major UI Change"

Any change that affects what users see: new pages, layout modifications, component additions/removals, style changes, data display changes, or route changes.

## Verification Steps

After making UI changes, execute these steps in order:

### 1. Dev Server Running

Ensure the dev server is running (`bun run dev`). If it's not, start it and wait for the "Ready" message. The dev server uses `https://skills-hub.local:<port>` when TLS certs are present, or `http://localhost:<port>` otherwise.

### 2. Route Smoke Check

Verify every affected route returns HTTP 200. Use the URL shown in the dev server banner (the `-k` flag tolerates self-signed certs):

```bash
curl -sk -o /dev/null -w "%{http_code}" https://skills-hub.local:3000
curl -sk -o /dev/null -w "%{http_code}" https://skills-hub.local:3000/skills
curl -sk -o /dev/null -w "%{http_code}" https://skills-hub.local:3000/changelog
```

Any non-200 response is a blocker. Fix before proceeding.

### 3. Visual Verification

Use the browser MCP tools to navigate to each affected page and take a snapshot. Confirm:
- Page renders without blank screens or error messages
- Layout is intact (header, footer, content areas present)
- Data displays correctly (skill cards, changelogs, detail pages)
- No console errors visible

### 4. Playwright Tests

Run the Playwright test suite:

```bash
bunx playwright test
```

All tests must pass. If any fail, fix the issue and re-run.

## Rules

- **Never skip verification** — even for "small" CSS changes.
- **Fix regressions immediately** — do not accumulate broken UI states.
- **If the browser MCP is unavailable**, use `curl` to verify HTML content includes expected headings and data.
- **After database changes**, re-seed (`bun run db:seed`) and re-verify.

## URL State Management

> URL query params as source of truth for user-visible state changes _always-applied_

# URL State Management

If a user interaction (button, tab, filter, sort, pagination) changes what is displayed on the page, represent that state in URL query params — not `useState`. URL state is shareable, bookmarkable, survives refresh, and enables server-side rendering of the correct view.

## Use nuqs

This project uses [nuqs](https://nuqs.dev) for type-safe URL state. The `NuqsAdapter` is already mounted in the root layout.

### Single param

```tsx
import { useQueryState, parseAsStringLiteral } from "nuqs";

const tabs = ["all", "skills", "rules", "site"] as const;

const [tab, setTab] = useQueryState(
  "tab",
  parseAsStringLiteral(tabs).withDefault("all").withOptions({ history: "replace" }),
);
```

### Multiple params (batched)

```tsx
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";

const [filters, setFilters] = useQueryStates(
  {
    q: parseAsString.withDefault(""),
    category: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(1),
  },
  { history: "replace" },
);
```

### Server components

Read `searchParams` directly — no hooks needed:

```tsx
export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q, category } = await searchParams;
  const skills = getSkills({ q, category });
  return <SkillGrid skills={skills} />;
}
```

## History Mode

| Change type | Mode | Why |
|---|---|---|
| Tabs, filters, sort | `history: "replace"` | Avoids polluting back-button history |
| Pagination, detail navigation | `history: "push"` | User expects back to return to previous page |

## What Goes in the URL vs Local State

| URL query params | Local `useState` |
|---|---|
| Active tab | Hover / focus state |
| Search query | Form input mid-keystroke (debounce, then sync to URL) |
| Filter selections | Animation / transition state |
| Sort column and direction | Copy-to-clipboard feedback |
| Pagination (page, offset) | Mobile menu open/close |
| Selected item (slug, id) | Dropdown open/close |
| Expanded panel (if it changes the "view") | Tooltip visibility |

The test: "If the user shares this URL, should the recipient see the same view?" If yes, it belongs in the URL.

## Parsers

Use the strongest parser available:

| Data | Parser |
|---|---|
| Free text (search) | `parseAsString` |
| Known string set (tabs, categories) | `parseAsStringLiteral([...] as const)` |
| Numbers (page, limit) | `parseAsInteger` |
| Booleans (toggles) | `parseAsBoolean` |
| Dates | `parseAsIsoDate` |
| Complex objects | `parseAsJson` with a Zod schema |

Always call `.withDefault()` so the hook returns `T` instead of `T | null`.

## Validation

Invalid or unknown param values must fall back to the default — never crash. nuqs parsers handle this automatically: if the URL contains `?tab=bogus` and the parser is `parseAsStringLiteral(["all","skills"])`, the value resolves to the default. For server-side validation, continue using Zod schemas in `parseSearchParams()`.

## Anti-Patterns

- `useState` for a tab that changes page content — use `useQueryState`
- `router.push` with manually constructed `URLSearchParams` — use nuqs setters
- Reading `useSearchParams()` just to pass to `router.push` — nuqs handles the round-trip
- Storing filter state in React context or a global store — URL is the global store

## User Media Url Validation

> Validate user-provided URLs before rendering as src/href attributes in JSX _always-applied_

# User Media URL Validation — Learned from CodeQL DOM XSS alerts

CodeQL flagged `<video src={proofVideoUrl}>` and `<img src={proofGifUrl}>` in `ReviewActionPanel.tsx` as DOM XSS (CWE-079). The values came from user-controlled `<input>` fields and were rendered directly as `src` attributes without protocol validation. While modern browsers block `javascript:` URIs in `<img>`/`<video>` `src`, the pattern is dangerous if copied to `<a href>`, `<iframe src>`, `<source src>`, or any element where protocol-level attacks work.

## The Rule

Every `src` or `href` attribute in JSX that renders a user-provided, database-sourced, or externally-fetched URL must be sanitized to allow only safe protocols (`http:`, `https:`).

### Sanitizer function

```typescript
function sanitizeMediaUrl(raw: string): string {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {}
  return "";
}
```

### When to sanitize

| Attribute | Source of value | Sanitize? |
|---|---|---|
| `<img src={url}>` | User input, DB column, API response | Yes |
| `<video src={url}>` | User input, DB column, API response | Yes |
| `<iframe src={url}>` | User input, DB column, API response | Yes |
| `<a href={url}>` | User input, DB column, API response | Yes |
| `<img src="/static/logo.png">` | Hardcoded string literal | No |
| `<Link href="/skills">` | Hardcoded internal route | No |
| `<img src={importedAsset}>` | Webpack/Vite import | No |

### When NOT to sanitize

- Static string literals (`"/images/logo.png"`, `"https://cdn.example.com/img.jpg"`)
- Imported assets (`import logo from "@/public/logo.svg"`)
- Next.js `<Image>` component with `src` from a configured domain in `next.config.ts`
- URLs constructed entirely from server-controlled values with no user input in the chain

### Dangerous protocols to block

The sanitizer must reject everything except `http:` and `https:`. Notable attack protocols:

| Protocol | Risk |
|---|---|
| `javascript:` | Code execution (works on `<a href>`, blocked on `<img>/<video> src` in modern browsers) |
| `data:` | Inline content rendering, can embed HTML/SVG with scripts |
| `blob:` | References to in-memory objects, can be crafted maliciously |
| `file:` | Local file access attempts |
| `vbscript:` | Legacy IE code execution |

### Rendering pattern

```tsx
// WRONG — user input rendered directly as src
<video src={proofVideoUrl} controls />
<img src={proofGifUrl} alt="Preview" />

// RIGHT — sanitized before rendering
<video src={sanitizeMediaUrl(proofVideoUrl)} controls />
<img src={sanitizeMediaUrl(proofGifUrl)} alt="Preview" />
```

### Where to put the sanitizer

Place `sanitizeMediaUrl` in the component file if used once, or in `src/lib/url.ts` if shared across components. Do not inline the validation logic — always call a named function so the security boundary is visible and auditable.

## Origin

- **Failure**: CodeQL flagged `<video src={proofVideoUrl}>` and `<img src={proofGifUrl}>` as DOM XSS (CWE-079, CWE-116) — user-controlled input rendered as media src without protocol validation
- **Date**: 2026-03-16
- **Root cause**: Input field values from `useState` rendered directly as `src` attributes without any URL sanitization
- **PR**: fix/codeql-security-fixes (#213)

## Detection Acceleration

- **Level**: CI (CodeQL)
  **What was added**: CodeQL `js/xss-through-dom` rule already detects this pattern. The gap was in prevention — no rule told agents to sanitize user-provided URLs.
  **Diagnosis time before**: CodeQL alerts sat open; pattern was introduced without awareness of the risk
  **Diagnosis time after**: This rule prevents the pattern at authoring time

- **Level**: Editor (this rule)
  **What was added**: Always-applied Cursor rule that instructs agents to sanitize any user-provided URL before rendering it as a `src` or `href` attribute. The rule provides a ready-to-use sanitizer function.
  **Diagnosis time before**: Agent writes `<img src={userInput}>` without thinking about protocol injection
  **Diagnosis time after**: Agent sees this rule and adds `sanitizeMediaUrl()` wrapper automatically

## Vendoring Policy

> Prefer vendored/inlined code over external packages to reduce supply chain risk and improve build reproducibility _always-applied_

# Vendoring Policy — Own Your Dependencies

Prefer writing or vendoring code over adding a new package. Every external dependency is a trust decision, a supply chain risk, and a build-time cost. The bar for adding a package should be high.

## Decision Framework

Before adding a dependency, answer these questions in order:

### 1. Can you write it in < 100 lines?

If the functionality is straightforward (string manipulation, data transformation, simple algorithms, file I/O helpers), write it yourself. Put utility code in:

- **TypeScript**: `src/lib/<module>.ts`
- **Rust**: A new module in the existing crate, or `src/lib.rs` helpers

### 2. Can you vendor just the code you need?

If the dependency is large but you only need a small part, extract the relevant code:

- Copy the specific functions/modules you need into `src/vendor/<package>/`
- Include the original license file
- Add a comment at the top citing the source and version: `// Vendored from <package>@<version> — <license>`
- Pin to the exact version you extracted from, so you can audit diffs on upgrade

### 3. Is this a foundational framework?

Some dependencies are load-bearing frameworks that would be unreasonable to rewrite:

| Allowed package categories | Examples |
|---|---|
| Web framework | Next.js, React, React DOM |
| Language runtime/toolchain | TypeScript, Bun |
| Database driver | `pg` |
| Crypto / auth (audited libs) | `jose`, `jsonwebtoken` |
| Testing framework | Playwright, Testing Library |
| Linter / formatter | Biome |
| Rust async runtime | `tokio` |
| Rust web framework | `axum` |
| Rust serialization | `serde` |

These pass the bar. Most other packages don't.

### 4. Does the package justify its weight?

If you still want to add a package after steps 1-3, it must clear this checklist:

- [ ] Actively maintained (commit in last 6 months)
- [ ] No known vulnerabilities (`cargo audit` / `bun audit`)
- [ ] License is compatible (MIT, Apache-2.0, BSD — no GPL in app code)
- [ ] Minimal transitive dependencies (check `bun why <pkg>` or `cargo tree -p <pkg>`)
- [ ] You can articulate what it does that you can't reasonably build

## Rust Vendoring

### Cargo vendor

For offline/reproducible builds, use `cargo vendor`:

```bash
cargo vendor
```

Configure `.cargo/config.toml`:

```toml
[source.crates-io]
replace-with = "vendored-sources"

[source.vendored-sources]
directory = "vendor"
```

### Feature-gated vendoring

Prefer vendored builds for native dependencies to avoid system library requirements:

```toml
# Cargo.toml
[dependencies]
git2 = { version = "0.20", default-features = false, features = ["vendored-libgit2"] }
openssl = { version = "0.10", features = ["vendored"] }
```

### Minimize crate count

Each crate adds compile time. Disable default features and enable only what you need:

```toml
# WRONG — pulls in every default feature
reqwest = "0.12"

# RIGHT — only what we use
reqwest = { version = "0.12", default-features = false, features = ["rustls-tls", "json"] }
```

## TypeScript Vendoring

### Single-function packages

Never add a package for something that's one function. Classic offenders:

| Package | Instead, write |
|---|---|
| `is-odd`, `is-even` | `n % 2 !== 0` |
| `left-pad` | `str.padStart(len, char)` |
| `is-number` | `typeof x === 'number' && !Number.isNaN(x)` |
| `path-exists` | `fs.existsSync(path)` or `Bun.file(path).exists()` |
| `deep-clone` | `structuredClone(obj)` |
| `uuid` | `crypto.randomUUID()` |
| `lodash.get` | Optional chaining `obj?.a?.b?.c` |
| `lodash.debounce` | 10-line debounce function |

### Vendoring approach

When you need substantial third-party code but want to avoid the dependency:

1. Create `src/vendor/<package-name>/` directory
2. Copy the source files you need
3. Add `LICENSE` from the original package
4. Add a `README.md` noting the source version and any modifications
5. Import from `@/vendor/<package-name>` instead of the package name

## Auditing Existing Dependencies

Periodically run:

```bash
# TypeScript
bun pm ls --all | wc -l    # total package count — lower is better

# Rust
cargo tree | wc -l          # total crate count
cargo audit                 # vulnerability scan
```

When a dependency is found to be unnecessary (functionality available natively or easily inlined), remove it and replace with vendored or hand-written code.

## Anti-Patterns

| Pattern | Problem | Fix |
|---|---|---|
| Adding a package for one function | Supply chain risk for trivial code | Write the function |
| `import _ from "lodash"` | Pulls entire 500KB library | Write the 3 functions you need |
| Default features enabled | Pulls transitive deps you don't use | `default-features = false` |
| Unpinned versions | Non-reproducible builds | Use lockfiles (`bun.lock`, `Cargo.lock`) |
| Packages without maintenance | Abandoned code in your supply chain | Vendor and own it, or find alternative |

## Vercel Node Version

> Vercel: use Bun runtime with pinned version; Node 16 is discontinued _always-applied_

# Vercel Runtime — Learned from production build failure

This project uses **Bun** as the runtime on Vercel, with an exact version pin. Previously, Node.js 16.x caused failures because it's discontinued. Projects still configured for `nodeVersion: "16.x"` fail with:

```
Error: Node.js Version "16.x" is discontinued and must be upgraded.
Please set Node.js Version to 24.x in your Project Settings to use Node.js 24.
```

## The Rule (Bun)

Use Bun as the runtime. Pin the exact version in three places:

1. **vercel.json**: `bunVersion: "1.x"` (runtime) and `installCommand: "bunx bun@1.3.10 install"` (exact install version)
2. **package.json**: `"packageManager": "bun@1.3.10"`
3. **.bun-version**: `1.3.10` (for bvm, mise, etc.)

Bun uses a global install cache at `~/.bun/install/cache` by default. Vercel caches build artifacts between deployments.

## Supported Versions (as of 2025)

| Version | Status |
|---------|--------|
| 16.x | **Discontinued** — builds fail |
| 20.x | Supported (LTS) |
| 22.x | Supported |
| 24.x | Default for new projects |

## Checklist for Vercel-Deployed Projects

1. **package.json** must have `engines.node` set to `20.x`, `22.x`, or `24.x` (or a semver range that resolves to one of these).
2. **Never** set `engines.node` to `16.x` or omit it if the project was created when 16 was default.
3. **Optional**: Add `.nvmrc` with `20` for local dev consistency.

## Origin

- **Failure**: `vercel build` failed with "Node.js Version 16.x is discontinued"
- **Date**: 2026-03-17
- **Root cause**: Project linked to Vercel when Node 16 was default; `.vercel/project.json` retained `nodeVersion: "16.x"`
- **Fix**: Add `engines: { "node": "20.x" }` to package.json — Vercel uses this over Project Settings

## Detection Acceleration

- **Level**: Local
 **What to add**: Run `vercel build` locally before pushing. It will fail immediately if Node version is unsupported.
- **Level**: CI
 **What to add**: If CI runs `vercel build` or `next build`, ensure the CI image uses Node 20+.
- **Level**: Editor (this rule)
 **What was added**: This Cursor rule reminds agents to add/verify `engines.node` when touching Vercel-deployed projects.

## Verification And Tooling Reality

> Enforce realistic verification and tool-aware quality gates _always-applied_

# Verification and Tooling Reality

Align quality gates with what tools can actually measure.

## Verify with the same mechanism that enforces

- Use the real gate command before completion (for example: `scripts/enforce/*`).
- Validate every touched package with its package-local workflow before repo-level runs.
- Treat hanging commands as failures: stop, diagnose, and rerun with bounded steps.

## Do not infer unsupported metrics

- Only report metrics a tool emits directly.
- If a requested metric is not natively available (for example branch coverage in Bun output), state that explicitly and propose a concrete alternative.
- Do not re-label one metric as another.

## Keep lint/format signal clean

- Remove generated artifacts (for example `dist/`) before lint/format checks unless intentionally included.
- Run package-required hygiene steps before finalizing.
- Resolve diagnostics in changed files; do not hide them.

## Parse outputs defensively

- Gate scripts must fail on parse errors, missing sections, or partial output.
- Prefer simple, portable shell constructs in enforcement scripts.

<!-- END migrated from Cursor rules -->
