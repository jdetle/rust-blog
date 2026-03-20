---
name: leave-notes
description: Guide the author through reviewing AI reframings and adding personal footnotes explaining where the AI missed the mark. Use after reframe-essay has produced the four audience versions.
skillType: narrow
extends: [blog-pipeline]
---

# Leave Notes

Walk the author through each AI-reframed version of their essay and collect their personal commentary on passages where the AI got it wrong, oversimplified, or missed important nuance. The notes are the most human part of the multi-version system — they're the author arguing with the AI's interpretation of their own ideas.

## Workflow

### Step 1: Inventory Annotations

Read all four reframed versions (`grug.html`, `product.html`, `business.html`, `engineering.html`) and list every `<span data-note="N">` passage. Present them to the user grouped by version:

```
── Grug ──
1. "reach for club but stay calm"
2. "problem not really about where code live"
3. "manager hear 'mono' and run away"

── Product ──
1. "developer experience and delivery velocity"
2. "repository fragmentation creates invisible friction"
3. "Reframing it as 'multi-package repository' better communicates"

... etc
```

### Step 2: Collect Notes

For each annotated passage, ask the user: "Any beef with this?" They can:

- **Write a note** — their commentary on why the AI's framing is off, incomplete, or accidentally correct
- **Skip** — no comment on this passage (it won't appear in the footnotes)
- **Rewrite the passage** — if the AI got it so wrong that the text itself needs changing, update the HTML and optionally still leave a note
- **Add a new annotation** — if the user spots something the AI missed, wrap it in a new `<span data-note="N">` and add the note

### Step 3: Build notes.json

Compile all notes into `content/posts/<slug>/notes.json`:

```json
{
  "grug": [
    { "id": 1, "note": "The author's commentary on this passage..." }
  ],
  "product": [
    { "id": 1, "note": "..." }
  ],
  "business": [],
  "engineering": [
    { "id": 1, "note": "..." },
    { "id": 2, "note": "..." }
  ]
}
```

Only include versions that have at least one note. Omit versions where the user skipped every passage.

### Step 4: Verify Annotation Integrity

After writing `notes.json`, verify that every `data-note` ID in the HTML files has a corresponding entry in `notes.json`, and vice versa. Remove orphaned annotations (HTML spans with no matching note) and orphaned notes (entries with no matching HTML span).

## Efficiency Tips

- Process one version at a time, presenting all its annotations as a batch
- If the user says "skip" or "no notes" for an entire version, move on immediately
- If the user provides all notes upfront (e.g., in a single message), parse them out and apply without the back-and-forth
- The user can always add more notes later by re-running this skill

## What Makes a Good Note

Good notes are the author's authentic voice pushing back on the AI's interpretation. They should feel like marginalia — the kind of thing you'd scribble in a book you're reading.

**Good notes:**
- "This completely misses the point about Conway's Law"
- "No PM I've worked with would frame adoption cost this way"
- "OK this one is genuinely true. Branding matters more than technical merit in enterprise decisions."
- "The grug voice is fun but I never actually feel violent about this stuff."

**Bad notes (avoid coaching the user toward these):**
- "This is an interesting perspective" — too diplomatic, says nothing
- "The AI has correctly identified the key trade-off" — nobody wants to read agreement
- "This paragraph could be improved by..." — this isn't an editing pass, it's a reaction

## Visual Rendering

Notes appear as Tufte-style sidenotes on desktop (in the right margin alongside the annotated passage) and as expandable inline footnotes on mobile. The author doesn't need to worry about formatting — the rendering system handles it. They just need to write the text of the note.

## Output

- Updated `grug.html`, `product.html`, `business.html`, `engineering.html` with any new or modified `<span data-note="N">` annotations
- `notes.json` with the collected commentary
