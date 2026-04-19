---
name: generate-slop
description: Generate an AI-written first draft of a blog post from a single prompt. The output is intentionally labeled "AI Slop" to contrast with the human-revised version. Use when beginning the blog pipeline or when the user asks to generate an AI draft.
skillType: narrow
extends: [blog-pipeline]
---

# Generate Slop

Produce an AI-written blog post draft from a topic prompt. The irony is baked in: the skill tries its best to write well, but the output is labeled "AI Slop" because the point is showing the gap between AI-generated and human-revised writing.

## Workflow

1. **Collect the prompt.** The user provides a topic, thesis, or rough direction. If they only give a title, ask for 1-2 sentences of context about what angle they want to take.

2. **Generate the draft.** Write a complete blog post body as HTML (just the content that goes inside `<article class="article-content">`). No `<html>`, `<head>`, `<body>`, or wrapper elements.

3. **Write to file.** Save the output to `content/posts/<slug>/slop.html`.

4. **Create manifest.json** if it doesn't exist:
   ```json
   {
     "title": "<Post Title>",
     "author": "John Detlefs",
     "date": "<Month DD, YYYY>",
     "prompt": "<the user's original prompt verbatim>",
     "defaultVersion": "original",
     "versions": ["slop", "original", "grug", "product", "business", "engineering"]
   }
   ```

## System Prompt for Generation

When generating the draft, use this framing:

> You are writing a blog post for a personal engineering blog. The audience is software engineers and technical leaders. Write in a clear, professional voice. Structure the post with an introduction, 3-5 body sections, and a conclusion. Use `<p>`, `<h2>`, `<h3>`, `<blockquote>`, `<code>`, and `<pre>` tags as appropriate. Output raw HTML — no markdown.
>
> The topic is: {user's prompt}
>
> Target length: 600-1200 words.

Do NOT reference the `blog-voice.mdc` rule when generating slop. The whole point is that the AI draft sounds like AI — polished, generic, and missing the author's personality. The contrast with the human revision is the feature.

## Output Format

The file must contain only HTML body content. No doctype, no wrapping elements. Example:

```html
<h2>Section Title</h2>
<p>Paragraph text...</p>
<p>More text...</p>
```

## What Makes Good Slop

Paradoxically, the AI draft should be competent but soulless. Hallmarks of AI slop to lean into:
- Smooth, even paragraph lengths
- Perfect transitions between every section
- Abstract claims without personal anecdotes
- Hedging language ("it's worth noting", "to be fair")
- A tidy conclusion that wraps everything up with a bow
- No strong opinions — everything is presented as balanced trade-offs

These are the exact patterns the human revision will strip out, and the contrast is what makes the multi-version system interesting.
