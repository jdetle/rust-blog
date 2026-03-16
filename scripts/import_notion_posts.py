#!/usr/bin/env python3
import html
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Optional


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "posts"
ENV_FILE = ROOT / ".env"
NOTION_VERSION = "2022-06-28"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def api_request(url: str, token: str, method: str = "GET", payload: Optional[dict] = None) -> dict:
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Notion-Version", NOTION_VERSION)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Notion API error {err.code} for {url}: {body}") from err


def query_database(database_id: str, token: str) -> list[dict]:
    results: list[dict] = []
    cursor = None
    while True:
        payload = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        data = api_request(
            f"https://api.notion.com/v1/databases/{database_id}/query",
            token=token,
            method="POST",
            payload=payload,
        )
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return results


def fetch_block_children(block_id: str, token: str) -> list[dict]:
    results: list[dict] = []
    cursor = None
    while True:
        url = f"https://api.notion.com/v1/blocks/{block_id}/children?page_size=100"
        if cursor:
            url += f"&start_cursor={cursor}"
        data = api_request(url, token=token)
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return results


def rich_text_to_html(rich_text: list[dict]) -> str:
    parts: list[str] = []
    for chunk in rich_text:
        text = html.escape(chunk.get("plain_text", ""))
        href = chunk.get("href")
        ann = chunk.get("annotations", {})
        if ann.get("code"):
            text = f"<code>{text}</code>"
        if ann.get("bold"):
            text = f"<strong>{text}</strong>"
        if ann.get("italic"):
            text = f"<em>{text}</em>"
        if ann.get("strikethrough"):
            text = f"<s>{text}</s>"
        if href:
            text = f'<a href="{html.escape(href)}">{text}</a>'
        parts.append(text)
    return "".join(parts).strip()


def render_blocks(blocks: list[dict], token: str) -> str:
    out: list[str] = []
    list_mode = None

    def close_list() -> None:
        nonlocal list_mode
        if list_mode == "ul":
            out.append("</ul>")
        elif list_mode == "ol":
            out.append("</ol>")
        list_mode = None

    for block in blocks:
        block_type = block.get("type")
        if not block_type:
            continue
        payload = block.get(block_type, {})
        text_html = rich_text_to_html(payload.get("rich_text", []))
        has_children = block.get("has_children", False)

        if block_type == "paragraph":
            close_list()
            if text_html:
                out.append(f"<p>{text_html}</p>")
        elif block_type == "heading_1":
            close_list()
            out.append(f"<h1>{text_html or 'Untitled'}</h1>")
        elif block_type == "heading_2":
            close_list()
            out.append(f"<h2>{text_html or ''}</h2>")
        elif block_type == "heading_3":
            close_list()
            out.append(f"<h3>{text_html or ''}</h3>")
        elif block_type == "quote":
            close_list()
            out.append(f"<blockquote><p>{text_html}</p></blockquote>")
        elif block_type == "divider":
            close_list()
            out.append("<hr>")
        elif block_type == "bulleted_list_item":
            if list_mode != "ul":
                close_list()
                out.append("<ul>")
                list_mode = "ul"
            item_html = text_html
            if has_children:
                nested = render_blocks(fetch_block_children(block["id"], token), token)
                item_html += nested
            out.append(f"<li>{item_html}</li>")
        elif block_type == "numbered_list_item":
            if list_mode != "ol":
                close_list()
                out.append("<ol>")
                list_mode = "ol"
            item_html = text_html
            if has_children:
                nested = render_blocks(fetch_block_children(block["id"], token), token)
                item_html += nested
            out.append(f"<li>{item_html}</li>")
        elif block_type == "code":
            close_list()
            language = html.escape(payload.get("language", "text"))
            out.append(f'<pre><code class="language-{language}">{text_html}</code></pre>')
        else:
            close_list()
            if text_html:
                out.append(f"<p>{text_html}</p>")

    close_list()
    return "\n            ".join(out)


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return cleaned or "notion-post"


def has_meaningful_content(content_html: str) -> bool:
    # Strip tags, collapse whitespace, and verify something readable remains.
    text_only = re.sub(r"<[^>]+>", " ", content_html)
    text_only = re.sub(r"\s+", " ", text_only).strip()
    return bool(text_only)


def get_title(page: dict) -> str:
    props = page.get("properties", {})
    for prop in props.values():
        if prop.get("type") == "title":
            title = "".join(piece.get("plain_text", "") for piece in prop.get("title", []))
            return title.strip() or "Untitled"
    return "Untitled"


def page_date(page: dict) -> str:
    iso = page.get("last_edited_time") or page.get("created_time")
    if not iso:
        return "Unknown date"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%B %d, %Y")
    except ValueError:
        return iso


def generate_post_html(title: str, byline_date: str, content_html: str) -> str:
    safe_title = html.escape(title)
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{safe_title}</title>
    <link rel="stylesheet" href="/posts/blog.css">
</head>
<body>
<main class="site-shell">
    <div class="frame article">
        <header class="list-header">
            <p class="eyebrow">Journal</p>
            <h1 class="page-title">{safe_title}</h1>
            <p class="byline">By John Detlefs · {html.escape(byline_date)}</p>
        </header>

        <article class="article-content">
            {content_html or "<p>This post is currently empty in Notion.</p>"}
        </article>

        <nav class="nav-row">
            <a href="/posts">All posts</a>
            <a href="/">Home</a>
        </nav>
    </div>
</main>
</body>
</html>
"""


def generate_index_html(entries: list[dict]) -> str:
    li = []
    for entry in entries:
        li.append(
            f"""            <li>
                <a href="/posts/{html.escape(entry['slug'])}">
                    <span class="post-title">{html.escape(entry['title'])}</span>
                    <span class="post-kicker">{html.escape(entry['date'])}</span>
                </a>
            </li>"""
        )
    list_html = "\n".join(li)
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Journal - Posts</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/posts/blog.css">
</head>
<body>
<main class="site-shell">
    <div class="frame article">
        <header class="list-header">
            <p class="eyebrow">Archive</p>
            <h1 class="page-title">Notes and essays</h1>
            <p class="subhead">Imported from Notion with a wabi-sabi editorial presentation.</p>
        </header>

        <ul class="post-list">
{list_html}
        </ul>

        <nav class="nav-row">
            <a href="/">Back home</a>
        </nav>
    </div>
</main>
</body>
</html>
"""


def main() -> None:
    load_env_file(ENV_FILE)
    token = os.environ.get("NOTION_INTEGRATION_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        raise SystemExit("Missing NOTION_INTEGRATION_TOKEN or NOTION_DATABASE_ID in .env")

    pages = query_database(database_id, token)
    pages.sort(key=lambda p: p.get("last_edited_time", ""), reverse=True)

    seen: dict[str, int] = {}
    index_entries: list[dict] = []
    POSTS_DIR.mkdir(parents=True, exist_ok=True)

    for page in pages:
        title = get_title(page)
        base_slug = slugify(title)
        seen[base_slug] = seen.get(base_slug, 0) + 1
        slug = base_slug if seen[base_slug] == 1 else f"{base_slug}-{seen[base_slug]}"
        date = page_date(page)
        blocks = fetch_block_children(page["id"], token)
        content_html = render_blocks(blocks, token)
        if not has_meaningful_content(content_html):
            continue
        post_html = generate_post_html(title, date, content_html)
        (POSTS_DIR / f"{slug}.html").write_text(post_html, encoding="utf-8")
        index_entries.append({"slug": slug, "title": title, "date": date})

    (POSTS_DIR / "index.html").write_text(generate_index_html(index_entries), encoding="utf-8")
    print(f"Imported {len(index_entries)} posts from Notion.")


if __name__ == "__main__":
    main()
