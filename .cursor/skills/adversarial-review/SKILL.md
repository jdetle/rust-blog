---
name: adversarial-review
description: Run a multi-persona adversarial review for product or engineering changes using offense-defense-synthesis phases. Use when the user asks to debate a feature, red-team a proposal, or pressure-test design tradeoffs.
---

# Adversarial Review

## Quick Start

Use this skill when the user wants realistic internal debate over a product or engineering change.

Required inputs:
- Change summary
- Constraints (timeline, reliability, compliance, UX, staffing)
- Optional stakeholders or known concerns

Default participants:
- 5 personas chosen for meaningful tension across product, engineering, operations, and security viewpoints

## Workflow

Copy this checklist and track progress:

```markdown
Adversarial Review Progress
- [ ] Build context pack from request
- [ ] Select 3-5 personas and state why each is included
- [ ] Set debate config (round caps, evidence rule, chaos_mode)
- [ ] Run phase 1: offense
- [ ] Run phase 2: defense
- [ ] Run phase 3: synthesis
- [ ] Score with evaluation rubric
- [ ] Produce final memo with decision and dissent
```

### 1) Build Context Pack

Include:
- Problem statement and desired outcome
- Current architecture and constraints
- Known risks and unknowns
- Release and rollback expectations

If key data is missing, state assumptions before debate starts.

### 2) Select Personas

Pick roles that create meaningful tension. Preferred default set unless scope suggests otherwise:
- Backend Engineer
- Product Manager
- SRE or Platform Engineer
- Security Engineer
- Frontend Engineer

When persona files exist in the repository, load and cite their version in the transcript header.

### 3) Debate Configuration

Defaults:
- `max_turns_per_persona_per_phase: 2`
- `max_claims_per_turn: 3`
- `evidence_required_for_major_claims: true`
- `chaos_mode: off`
- `random_seed: provided-by-user-or-generated`

Evidence rule for major claims (must include at least one):
- Metric
- User impact
- Operational risk
- Code or architecture evidence

### 4) Phase 1: Offensive Posture

Every persona begins by attacking assumptions and identifying failure modes.

Required tactics:
- Challenge hidden assumptions
- Identify second-order effects
- Raise one concrete worst-case scenario

Output per persona:
- Top objections
- Evidence
- What would make them less opposed

### 5) Phase 2: Defensive Posture

Each persona defends its proposed approach against the strongest objections.

Required tactics:
- Answer at least one direct challenge from another persona
- Provide mitigation strategy and fallback plan
- Define rollout gate and stop condition

Output per persona:
- Defended proposal
- Mitigation plan
- Residual risk accepted

### 6) Phase 3: Synthesis

Shift from argument to integration.

Required outputs:
- Merged proposal options (1-2)
- Tradeoff table
- Core takeaways (technical, product, operational)
- Final vote with dissent notes

## Chaos Controller

Use chaos only when the user requests it or asks for stronger stress testing.

`chaos_mode` levels:
- `off`: deterministic personas, no perturbation
- `low`: one small perturbation between phases
- `medium`: up to two perturbations, optional reasoning-style switch once
- `high`: up to three perturbations, optional reasoning-style switch per phase

Perturbable fields (temporary):
- Urgency weighting
- Confidence level
- Agreeableness offset (+/- 10)
- Risk sensitivity (+/- 10)

Non-perturbable fields:
- Role scope
- Non-negotiables
- Core ethics and safety constraints

Always log:
- `random_seed`
- Perturbation events
- Reasoning style changes

Stop chaos escalation when coherence degrades.

## Review Recording

Persist each completed run to:
- `docs/adversarial-review/reviews/<yyyy-mm-dd>-<slug>.md`

Maintain a top-level digest at:
- `docs/adversarial-review/reviews/TLDR.md`

For each saved run, add one entry at the top of `TLDR.md`:
- Review file link
- One-line decision
- One-line key unresolved risk
- One-line follow-up action

If file writing is unavailable, still emit full markdown and exact target paths so it can be saved as-is.

## Output Template

Use this structure:

```markdown
# Adversarial Review: <change-name>

## TL;DR
- decision:
- key reason:
- top unresolved risk:
- immediate next step:

## Debate Config
- chaos_mode:
- random_seed:
- evidence_rule:

## Persona Roster
- Persona: <name> (vX.Y if available)
  - role:
  - risk_posture:

## Phase 1 - Offense
<turn-by-turn transcript>

## Phase 2 - Defense
<turn-by-turn transcript>

## Phase 3 - Synthesis
<merged options, vote, dissent>

## Chaos Log
- event_1:
- event_2:

## Core Takeaways
- takeaway_1
- takeaway_2

## Decision Memo
- recommended option:
- unresolved risks:
- experiments:
- rollout gates:
- rollback trigger:
```

## Guardrails

- Keep conflict technical and product-focused, never personal.
- Do not fabricate organizational politics or personal attributes.
- Do not invent evidence; mark assumptions explicitly.
- Preserve traceability from each decision to supporting claims.

## Quality Gate

Before finalizing output:
- Score debate with an explicit 1-5 rubric for rigor, diversity of argument, and stability under chaos.
- If stability-under-chaos is below 3/5, rerun with lower chaos or narrower perturbation bounds.
- If argument diversity is low, replace one persona with a stronger opposing risk posture and rerun synthesis.
