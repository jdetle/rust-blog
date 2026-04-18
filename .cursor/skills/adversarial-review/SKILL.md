---
name: adversarial-review
description: Run a multi-persona adversarial review for product or engineering changes using offense-defense-synthesis phases. Use when the user asks to debate a feature, red-team a proposal, or pressure-test design tradeoffs.
---

# Adversarial Review

## Mode Decision Gate

**Choose the mode before doing anything else.**

| Signal | Mode |
|---|---|
| "Should we do X?" / contested architecture / new system / product tradeoff | **Design-debate** |
| "Does this diff look right?" / pre-push audit / reviewing a branch / post-rebase check | **Diff-audit** |

When in doubt, prefer diff-audit. Design-debate is expensive; only use it when there is genuine disagreement to surface.

---

## Diff-Audit Mode

For pre-push and post-rebase checks. No personas, no transcript. One agent examining the diff through five lenses.

### Proportionality

| Change size | Review depth | Output |
|---|---|---|
| Trivial (1-2 files, copy/style/rename only) | Quick scan — confirm each file is in scope | One line in `TLDR.md`, no separate file |
| Small (3-10 files, single feature) | Check all five lenses | Offense / Defense / Synthesis trio, saved as review file |
| Multi-file refactor or rebase | Full file-by-file comparison against `origin/main`; verify no accidental reversions | Full review file with diff stat quoted |
| Architecture / new system | Full review + risks, tradeoffs, rollback plan | Full review file; escalate to Design-debate if contested |

**Skip criteria for trivial changes:** single-file copy change, comment-only edit, mechanical rename, version bump with no logic change. Emit one line in `TLDR.md` directly — no separate review file required.

### Five Lenses

Run every diff through:

1. **Accidental reversions** — Did conflict resolution, rebase, or cherry-pick silently drop upstream changes? Compare each modified file against `origin/main`.
2. **Scope creep** — Does the diff contain changes unrelated to the stated goal? Every hunk should trace back to the task.
3. **Semantic correctness** — Do the changes actually achieve what was asked? (e.g. updating a URL means the old URL no longer appears, not just that a new one was added.)
4. **Edge cases** — What happens when the happy path doesn't hold? (missing certs, missing DNS, missing env vars, empty inputs)
5. **Test coverage** — If behavior changed, are tests updated? If tests were changed, do they still assert meaningful things?

### Evidence requirement

Every offense bullet must cite **one of**: a specific file path + line range in the diff, a named metric or PostHog event, a runbook link, or a concrete repro sequence. Vague claims ("could be slow", "might break") are not valid — state the specific artefact or drop the claim.

For Small and above: quote `git diff origin/main...HEAD --stat` in the Scope block.

### Output

```markdown
# Adversarial review — <change-name>

**Date:** <yyyy-mm-dd>
**Branch:** `<branch>`
**Scope:** <diff stat or explicit file list>

## Offense
- <concrete claim with evidence>

## Defense
- <mitigation or counter-evidence>

## Synthesis

**Decision:** Proceed / Block / Defer

**Unresolved risk:** <one line, or "none">

**Follow-up:** <owner — trigger, or "none">
```

Save to `docs/adversarial-review/reviews/<yyyy-mm-dd>-<slug>.md`. Prepend one entry to `TLDR.md` using the standard format (see Review Recording section below).

### Output — Trivial skip

Prepend a single line to `TLDR.md`:

```
- [<yyyy-mm-dd> <slug>] trivial — <one-line description> — no separate review
```

---

## Design-Debate Mode

For contested proposals, new systems, ambiguous product calls, architecture decisions. Full persona debate.

### Required inputs

- Change summary or proposal
- Constraints (timeline, reliability, compliance, UX, staffing)
- Optional: stakeholders, known concerns

If key data is missing, state assumptions explicitly before the debate starts.

### Workflow checklist

```markdown
Design-Debate Progress
- [ ] Build context pack
- [ ] Load persona files and cite versions in transcript header
- [ ] Set debate config
- [ ] Run Phase 1: Offense — each persona states veto condition + evidence
- [ ] Run Phase 2: Defense — steelman-opposite before rebuttal
- [ ] Run Phase 3: Synthesis — named dissent, named residual-risk owner, kill criterion
- [ ] Check quality gate
- [ ] Save review file + prepend TLDR.md
```

### 1) Build Context Pack

Include:
- Problem statement and desired outcome
- Current architecture and constraints
- Known risks and unknowns
- Release and rollback expectations

### 2) Load Personas

**The canonical roster is fixed.** Do not substitute personas by domain — the roster is the anti-convergence mechanism. Load each persona file and cite its version in the transcript header.

Persona files live at `docs/adversarial-review/personas/`. Read `README.md` for the full roster and coverage check.

**Cite in transcript header:**

```
Personas: maren-shipper@v1, iris-auditor@v1, kai-explorer@v1, rafe-steward@v1, juno-mediator@v1
```

Re-read each persona's **Style manual** at the start of each phase to counter caricature drift.

**Default synthesis responsibilities:**
- **Iris** is the veto carrier. If no veto fires, state "no veto" explicitly.
- **Kai** is the minority-dissent carrier. If synthesis is unanimous, state "no dissent" explicitly.
- **Juno** is the synthesis author. She must name (a) the claim from offense that most reshaped her proposal and (b) the residual risk she is personally accepting. If she cannot do both, the run is flagged as low-signal.

### 3) Debate Configuration

```
max_turns_per_persona_per_phase: 2
max_claims_per_turn: 3
evidence_required: true
```

Evidence rule — every offense claim must include at least one of:
- Specific file path + line range in the diff
- Named metric or PostHog event
- Operational risk with a named artefact
- Concrete repro sequence

Vague claims ("could be slow", "might break") are not valid.

### 4) Phase 1: Offensive Posture

Required per persona:
1. **One concrete veto condition** — a specific observable that would make them block. ("I will veto if X is not documented before merge.")
2. **One claim they expect others to agree with** and **one claim they expect others to reject** — surfaces genuine disagreement.
3. Evidence for every major claim (file path, metric, repro, or operational risk).

Required tactics:
- Challenge hidden assumptions
- Identify second-order effects
- Raise one concrete worst-case scenario

### 5) Phase 2: Defensive Posture

Required per persona:
1. **Steelman-opposite first** — restate the strongest opposing claim in its strongest form before rebutting it. ("The strongest version of Iris's concern is: [X]. Here's why I think the mitigation handles it / doesn't handle it.")
2. Answer at least one direct challenge from another persona.
3. State the residual risk they are accepting and name themselves as the accepting party.

### 6) Phase 3: Synthesis

Required outputs:
- Merged proposal options (1-2)
- Tradeoff table
- **Named veto status:** "Iris vetoed on [condition] — resolved by [mitigation] / still outstanding."
- **Named dissent:** which persona holds a minority position and what it is. If unanimous, state "no dissent."
- **Kill criterion** (required for multi-file+ changes): a pre-declared metric or behavior that triggers rollback if observed post-ship. E.g. "`/health` non-200 for 3 consecutive minutes → `az containerapp revision copy` to prior tag."
- **Residual risk accepted by:** name the persona or author.
- Final vote with count.

**Block conditions — synthesis must block if any of:**
- A persona veto is still outstanding (unresolved by mitigation)
- Evidence gate failed (a major claim has no supporting artefact)
- A rollout gate is promised but not defined for a multi-file change
- The decision boundary has not been explicitly stated (Juno's veto condition)

### 7) Quality Gate

Before finalizing:

- [ ] Every offense claim has an artefact (file/metric/repro/risk).
- [ ] Every persona stated a veto condition.
- [ ] Synthesis names the claim that most reshaped the proposal.
- [ ] Kill criterion is defined (multi-file+ only).
- [ ] Residual risk has a named owner.
- [ ] Juno named the residual risk she is personally accepting.
- [ ] If all five personas voted the same way — flag "unanimous, low-signal risk" and verify at least one claim was materially reshaped.

---

## Review Recording

### Review file

Save to: `docs/adversarial-review/reviews/<yyyy-mm-dd>-<slug>.md`

Include YAML frontmatter:

```yaml
---
date: <yyyy-mm-dd>
slug: <slug>
mode: diff-audit | design-debate
status: proceed | block | defer
scope: <comma-separated file list or tier name>
diff_base: origin/main
veto_fired: true | false
follow_up_open: true | false
caught_real_issue: pending | yes | no
---
```

`caught_real_issue` is set to `pending` at review time and updated to `yes` or `no` after the change ships and the outcome is known.

### TLDR.md

Prepend one entry at the top of `docs/adversarial-review/reviews/TLDR.md`:

```markdown
- [<yyyy-mm-dd> <slug>](./<file>.md)
  - decision: <proceed|block|defer>; <one-line summary>
  - risk: <one-line unresolved risk, or "none">
  - followup: [ ] <owner> — <trigger>, or "none"
```

Follow-ups use the checkbox format so they can be marked done inline:

```markdown
  - followup: [x] author — completed 2026-04-20
```

When TLDR.md exceeds 40 entries for a calendar quarter, split into `TLDR-<YYYY>-Q<N>.md` and start a fresh `TLDR.md`.

### If file writing is unavailable

Emit full markdown with exact target paths so it can be saved as-is.

---

## Output Template (Design-Debate)

```markdown
# Adversarial Review: <change-name>

---
date: <yyyy-mm-dd>
slug: <slug>
mode: design-debate
status: <proceed|block|defer>
scope: <summary>
diff_base: origin/main
veto_fired: <true|false>
follow_up_open: <true|false>
caught_real_issue: pending
---

## TL;DR
- decision:
- key reason:
- top unresolved risk:
- immediate next step:

## Debate Config
- evidence_rule: at least one of file/metric/repro/operational-risk per major claim

## Persona Roster
Personas: maren-shipper@v1, iris-auditor@v1, kai-explorer@v1, rafe-steward@v1, juno-mediator@v1

## Phase 1 - Offense
<per-persona: veto condition, agree/disagree claims, evidence>

## Phase 2 - Defense
<per-persona: steelman-opposite, rebuttal, residual risk accepted by [name]>

## Phase 3 - Synthesis
<merged options, tradeoff table, veto status, dissent, kill criterion, residual-risk owner, vote>

## Core Takeaways
- <claim that most reshaped the proposal>
- <operational takeaway>
- <product takeaway>

## Decision Memo
- recommended option:
- unresolved risks:
- kill criterion:
- rollout gates:
- rollback trigger:
- residual risk accepted by:
```

---

## Guardrails

- Keep conflict technical and product-focused, never personal.
- Do not fabricate organizational politics or personal attributes.
- Do not invent evidence; mark assumptions explicitly with "(assumption)".
- Preserve traceability from each decision to supporting claims.
- Role colouring is flexible; OCEAN vector is not. A persona can have domain-appropriate concerns but must argue in the style dictated by their trait vector.
