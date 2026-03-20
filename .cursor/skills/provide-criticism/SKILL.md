---
name: provide-criticism
description: Review a human-written essay for coherence, flow, and readability without altering the author's voice or tone. Use after the user has revised the AI slop into their original essay.
skillType: narrow
extends: [blog-pipeline]
---

# Provide Criticism

Review the human-written original essay and suggest improvements for coherence and readability. The goal is to make the essay clearer, not to rewrite it. The author's voice, opinions, and rough edges are features, not bugs.

## Workflow

1. **Read the original.** Load `content/posts/<slug>/original.html`.

2. **Analyze paragraph by paragraph.** For each paragraph, check:
   - Does it follow logically from the previous one?
   - Are there unclear pronoun references or ambiguous subjects?
   - Are there sentences that could be split for readability?
   - Is there missing context that a reader outside the author's head would need?
   - Are there grammar or spelling issues?

3. **Produce a structured suggestion list.** Format:
   ```
   Paragraph 1: [no issues]
   Paragraph 2: "letting organizational proclivities get in the way" — "proclivities" is doing a lot of work here. Consider whether "tendencies" or "habits" says the same thing more directly.
   Paragraph 3: The jump from "siloed repositories" to "management as a buffer" is abrupt. A transitional sentence connecting code duplication to the human cost would help.
   ```

4. **Present to the user.** Show each suggestion. The user accepts, rejects, or modifies.

5. **Apply accepted changes.** Update `original.html` with the accepted edits.

## What to Flag

- Unclear antecedents ("this pattern" — which pattern?)
- Sentences over 40 words that could be split
- Jargon without context (terms a non-specialist reader would trip on)
- Paragraphs that try to make two separate points
- Missing transitions between sections
- Typos, grammar errors, subject-verb disagreement
- Repeated words or phrases within the same paragraph

## What NOT to Flag

- Casual tone, contractions, colloquialisms — these are the author's voice
- Strong opinions, blunt statements — the author is direct on purpose
- Imperfect paragraph lengths or uneven section sizes — wabi-sabi is intentional
- Parenthetical asides and sentence fragments — stylistic choice
- Profanity or irreverence — part of the voice (see `blog-voice.mdc`)

## Tone of Suggestions

Write suggestions as a thoughtful colleague, not a schoolteacher. Example:

Good: "The transition from code duplication to management overhead is a big leap — a connecting sentence would help the reader follow."

Bad: "This paragraph lacks a proper topic sentence and fails to establish a clear relationship with the preceding argument."

## Output

A numbered list of suggestions, one per issue found. Include the relevant passage snippet and the suggested change. If no issues are found for a paragraph, skip it — don't pad with "this paragraph is great!" filler.
