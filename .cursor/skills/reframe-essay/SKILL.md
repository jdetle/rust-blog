---
name: reframe-essay
description: Reframe a blog essay into four audience-specific versions — Grug (layman), Product, Business, and Engineering — each with a distinct voice and perspective. Use after the original essay is finalized.
skillType: narrow
extends: [blog-pipeline]
---

# Reframe Essay

Take the finalized original essay and produce four complete reframings, each targeting a different audience with a distinct voice. Every reframing must preserve the core argument and conclusions of the original — only the framing, vocabulary, and emphasis change.

## Workflow

1. **Read the original.** Load `content/posts/<slug>/original.html`.

2. **Identify the core argument.** Before reframing, extract:
   - The central thesis (1 sentence)
   - The key supporting points (2-4 bullets)
   - The conclusion or call to action

3. **Generate four versions.** For each audience, write a complete article body HTML file. Each version should be a standalone essay that makes sense without reading the others.

4. **Add annotation anchors.** In each version, wrap 2-4 passages in `<span data-note="N">` tags where the author will likely want to add commentary. Choose passages where the AI reframing diverges most from the original's intent or oversimplifies.

5. **Write output files:**
   - `content/posts/<slug>/grug.html`
   - `content/posts/<slug>/product.html`
   - `content/posts/<slug>/business.html`
   - `content/posts/<slug>/engineering.html`

## Voice Definitions

### Grug (Layman)

Inspired by [grugbrain.dev](https://grugbrain.dev/). The voice of a veteran developer who's smart but speaks simply.

**Characteristics:**
- Third person: "grug think...", "grug learn..."
- Short, punchy sentences mixed with occasional run-ons
- Refers to complex things with simple metaphors (clubs, dinosaurs, shiney rocks, caves)
- Suspicious of complexity, big brains, and abstractions
- Self-deprecating humor: "grug not so smart but program many long year"
- Direct, unhedged opinions
- References to "complexity demon spirit" as the universal enemy
- Occasional asides about controlling passions and not reaching for the club

**Example:**
> grug work many company over long program life. every company, grug see same thing: many repo everywhere. grug ask why? nobody know.

**Do NOT:**
- Make grug stupid — grug is wise through experience
- Overdo the caveman speak to the point of illegibility
- Lose the original argument in the voice gimmick

### Product

The perspective of a senior product manager. Frames everything through the lens of user value, team velocity, and measurable outcomes.

**Characteristics:**
- Structured, clear prose — not corporate jargon soup
- Frames technical decisions as user experience decisions
- References metrics: cycle time, deployment frequency, developer experience scores
- Uses PM vocabulary naturally: roadmap implications, adoption friction, feedback loops
- Empathetic to user pain but grounded in trade-offs
- Asks "what does this mean for the user?" about every technical point

**Example:**
> When we talk about repository strategy, we're really talking about developer experience and delivery velocity. The repo structure determines how fast your teams can ship.

**Do NOT:**
- Drown in OKR-speak and stakeholder alignment theater
- Lose the technical substance — PMs who understand the tech are the good ones
- Be wishy-washy — the original has opinions, the PM version should too

### Business

The perspective of a VP or C-level executive. Frames everything through ROI, risk, competitive advantage, and resource allocation.

**Characteristics:**
- Concise, authoritative prose
- Leads with the business impact, follows with the technical rationale
- Quantifies where possible: cost of duplication, time-to-patch exposure windows
- References organizational dynamics: team autonomy vs. operational efficiency
- Mentions competitive positioning: "organizations that solve X ship faster"
- Decision-oriented: ends with a clear recommendation

**Example:**
> Repository fragmentation represents a compounding operational cost that most engineering organizations underestimate.

**Do NOT:**
- Use empty business buzzwords ("synergy", "leverage", "holistic")
- Lose the technical argument entirely — execs who make good decisions understand the underlying mechanics
- Be patronizing or oversimplified

### Engineering

Deep technical perspective. Frames everything through architecture, systems design, and implementation trade-offs.

**Characteristics:**
- Technical depth: mentions specific tools, protocols, algorithms
- References computer science concepts where relevant (Conway's Law, DAGs, build graphs)
- Includes code snippets or config examples when they clarify the point
- Discusses trade-offs honestly — every architectural choice has a cost
- Uses precise language: "superlinear" instead of "gets worse fast"
- Cites concrete examples from the ecosystem (Turborepo, Nx, Bazel, CODEOWNERS)

**Example:**
> The polyrepo-vs-monorepo debate usually gets framed as a tooling question, but it's fundamentally an organizational coupling problem. Conway's Law predicts that your system architecture will mirror your communication structure.

**Do NOT:**
- Show off obscure knowledge for its own sake
- Assume the reader has context on every tool mentioned — brief explanations are fine
- Lose the original's opinion in a sea of technical analysis

## Output Format

Each file contains only HTML body content. Use `<p>`, `<h2>`, `<h3>`, `<blockquote>`, `<code>`, `<pre>`, and `<span data-note="N">` tags. No doctype, no wrapping elements.

Annotation anchors (`<span data-note="N">`) should wrap meaningful phrases (5-20 words) that the author would want to comment on. Number them sequentially starting from 1 within each version.

## Quality Check

Before writing each version, verify:
- [ ] The core thesis is preserved
- [ ] The conclusion matches the original's direction
- [ ] The voice is consistently in-character throughout
- [ ] 2-4 `data-note` annotations are placed at divergence points
- [ ] The HTML is valid and contains no wrapper elements
