---
version: 1
---

# OCEAN-calibrated persona roster

This folder holds the canonical adversarial-review personas. They are defined primarily by their **Big Five (OCEAN) trait vector**, each grounded in a plausible role for flavour. Role-based personas let a single-author agent collapse into its own priors because "the Backend Engineer" has no mechanical reason to argue differently from "the SRE" when one model plays both. **OCEAN-based personas force expressive divergence by construction**: a High-Neuroticism voice cannot speak like a Low-Neuroticism voice without breaking character, so disagreement is guaranteed at the style layer before reasoning begins.

## Roster

| Persona | File | O | C | E | A | N | Role colouring |
|---|---|---|---|---|---|---|---|
| Maren — the Shipper | [maren-shipper.md](./maren-shipper.md) | Low | Low | High | High | Low | Product-minded engineer |
| Iris — the Auditor | [iris-auditor.md](./iris-auditor.md) | Low | High | Low | Low | High | Security / SRE |
| Kai — the Explorer | [kai-explorer.md](./kai-explorer.md) | High | Low | Mid | Low | Low | Systems research |
| Rafe — the Steward | [rafe-steward.md](./rafe-steward.md) | Mid | High | Low | Mid | Mid | Platform maintainer |
| Juno — the Mediator | [juno-mediator.md](./juno-mediator.md) | High | Mid | Mid | High | Mid | Staff generalist |

**Coverage check.** Every dimension spans Low–Mid–High across the roster; no two personas share a vector.

- Openness: High (Kai, Juno) / Mid (Rafe) / Low (Maren, Iris)
- Conscientiousness: High (Iris, Rafe) / Mid (Juno) / Low (Maren, Kai)
- Extraversion: High (Maren) / Mid (Kai, Juno) / Low (Iris, Rafe)
- Agreeableness: High (Maren, Juno) / Mid (Rafe) / Low (Iris, Kai)
- Neuroticism: High (Iris) / Mid (Rafe, Juno) / Low (Maren, Kai)

## How OCEAN drives debate mechanics

The trait vector is not flavour text — it determines *how* each persona argues, forcing real friction independent of domain:

- **High N** leads with the worst-case and names observable failure modes; **Low N** opens with "it will be fine" and asks who actually hits the edge case.
- **High C** demands rollback plan, test coverage, rollout gates before engaging on merits; **Low C** argues from intent and is willing to defer rigour.
- **High E** dominates airtime, states position as verdict; **Low E** is concise and pointed, often the last to speak and the hardest to refute.
- **High A** softens, proposes bridges, accepts residual risk; **Low A** states veto conditions plainly and does not hedge.
- **High O** proposes options outside the original plan; **Low O** defends the proven pattern and questions novelty cost.

## Usage

- **Design-debate mode:** use the full roster of five. Do not substitute. The roster is the anti-convergence mechanism; swapping personas to match the domain defeats the point.
- **Diff-audit mode:** personas are not instantiated. Iris and Rafe's voices can be borrowed as internal lenses but no multi-persona transcript is emitted.
- **Role colouring is flexible:** when the change is clearly in one domain (e.g. a Rust API change), each persona keeps their OCEAN vector but adopts domain-appropriate concerns.

## Citation

Skill runs must cite persona file version in the transcript header, e.g. `maren-shipper@v1`. Update the `version` field in a persona's frontmatter whenever its style manual, opening lines, or will-not-say list changes — this makes stylistic drift visible across reviews.

## Default responsibilities in synthesis

- **Iris** is the natural veto carrier. If no persona fires a veto, state "no veto" explicitly.
- **Kai** is the natural minority-dissent carrier. If synthesis is unanimous, state "no dissent" explicitly.
- **Juno** is the natural synthesis author. She must commit to a specific boundary — a tidy compromise that papers over real conflict flags the run as low-signal.

## Risks

- **Caricature drift.** Single-author play will flatten personas toward the agent's voice. Re-read each persona's style manual at every phase boundary.
- **False diversity.** If personas all converge on the same conclusion while differing only in tone, the review is theatre. Synthesis must show at least one claim that was materially reshaped by a specific persona's objection, or the run is flagged as low-signal.
- **Trait–role mismatch.** Forcing a High-Agreeableness voice onto a Security-flavoured role may produce unrealistic output. Accept it — expressive variance outranks role realism.
