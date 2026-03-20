---
name: blog-pipeline
description: Orchestrate the full multi-version blog post pipeline — from AI slop generation through human revision, reframing, and annotation. Use when the user wants to create a new multi-version blog post or run the end-to-end pipeline on an existing essay.
skillType: broad
narrowSpecializations: [generate-slop, provide-criticism, reframe-essay, leave-notes]
---

# Blog Pipeline

End-to-end orchestrator for creating multi-version blog posts. Each post ships with six versions: AI Slop, Original (human-written), and four audience reframings (Grug, Product, Business, Engineering) with the author's footnoted commentary.

## Quick Start

```
User: "Create a new multi-version post about [topic]"
Agent: Reads this skill, then executes the pipeline below.
```

## Pipeline

### Phase 1: Generate AI Slop

Read and follow `.cursor/skills/generate-slop/SKILL.md`.

- Input: the user's topic/prompt
- Output: `content/posts/<slug>/slop.html`
- Also create `content/posts/<slug>/manifest.json` with the post metadata

### Phase 2: Human Revision (pause)

Tell the user the slop is ready for revision. The user will edit the content and create `content/posts/<slug>/original.html`. Wait for them to confirm they're done.

If the user provides their revision inline (pasted text or edits to the slop), write it to `original.html` for them.

### Phase 3: Provide Criticism

Read and follow `.cursor/skills/provide-criticism/SKILL.md`.

- Input: `content/posts/<slug>/original.html`
- Output: a structured list of suggestions
- Present suggestions to the user. Apply accepted changes to `original.html`.

### Phase 4: Reframe Essay

Read and follow `.cursor/skills/reframe-essay/SKILL.md`.

- Input: the final `content/posts/<slug>/original.html`
- Output: `grug.html`, `product.html`, `business.html`, `engineering.html`

### Phase 5: Leave Notes (pause)

Read and follow `.cursor/skills/leave-notes/SKILL.md`.

- Present each reframed version to the user
- Collect their commentary on passages
- Output: annotated version HTML files with `<span data-note="N">` markers + `notes.json`

### Phase 6: Finalize

1. Verify `manifest.json` lists all versions: `["slop", "original", "grug", "product", "business", "engineering"]`
2. Verify `notes.json` exists (even if empty: `{}`)
3. Run `bun run build` to verify the post renders
4. Commit with: `feat: add multi-version post <slug>`

## Directory Structure

```
content/posts/<slug>/
  manifest.json
  slop.html
  original.html
  grug.html
  product.html
  business.html
  engineering.html
  notes.json
```

## Slug Convention

Derive the slug from the post title: lowercase, hyphen-separated, no special characters. Max 60 characters. Examples:
- "Monorepos Were a Mistake" → `monorepos-were-a-mistake`
- "Why I Stopped Using ORMs" → `why-i-stopped-using-orms`

## When to Skip Phases

- If the user already has a written essay and just wants reframings, skip Phase 1 (slop) and Phase 2 (revision). Write their essay to `original.html` and start from Phase 3.
- If the user doesn't want criticism, skip Phase 3.
- If the user wants to add notes later, create an empty `notes.json` (`{}`) and skip Phase 5.
