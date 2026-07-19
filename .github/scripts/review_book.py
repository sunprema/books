#!/usr/bin/env python3
"""LLM review of changed BookBank pages, via GitHub Models.

Reads a list of changed HTML files (one per line) on stdin, reviews each
against the book's manifest context, and writes a single markdown report
(for a sticky PR comment) to the path given by --out.

Advisory by design: any per-page API failure is reported inside the comment,
and the script always exits 0 — the reviewer must never block a book PR.

Auth: GITHUB_TOKEN env var (in Actions, the workflow's `models: read`
permission is what grants it inference access — no separate secret).
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ENDPOINT = "https://models.github.ai/inference/chat/completions"
MARKER = "<!-- bookbank-llm-review -->"
MAX_PAGES = 10           # rate-limit courtesy: review at most this many pages
MAX_PAGE_CHARS = 20_000  # keep well under low-tier per-request token caps

SYSTEM_PROMPT = """You are the BookBank reviewer — a careful technical editor \
reviewing one page of a generated HTML book before it is published to a public \
library. You are advisory: a human merges the PR; your job is to surface what \
they should look at.

You are given PLAIN TEXT extracted from the page's HTML — tags, links, images, \
navigation, and all styling have been stripped, and table cells are joined \
with " | ". Do NOT comment on visual formatting, layout, styling, navigation \
links, or anything that could be an artifact of that extraction. Judge only \
the words and the code.

Review the page text for, in priority order:
1. Factual red flags — claims, numbers, API/syntax details that look wrong or \
outdated. Flag anything you'd want verified against a primary source.
2. Code snippets — do they look syntactically valid and idiomatic for the \
stated language/version?
3. Text integrity — mojibake or encoding artifacts (e.g. â€™, Ã©), truncated \
sentences, duplicated paragraphs, leftover placeholder text.
4. Voice — does the prose match the stated narrator persona? Note drift briefly.
5. Clarity — anything genuinely confusing for the stated audience.

Rules: be specific (quote the offending phrase, briefly). Report every real \
finding, including ones you are uncertain about — mark those "(unverified)". \
Do NOT pad: if the page is fine, say so in one line. No praise, no restating \
the content. Maximum ~8 bullets.

End with exactly one line in this form:
VERDICT: OK
or
VERDICT: NEEDS ATTENTION — <five-word reason>"""


class TextExtractor(HTMLParser):
    """Strip a BookBank page to readable text (drop script/style/svg/nav).

    Block boundaries become newlines and table cells become ` | ` so the
    extracted text doesn't mash adjacent cells/headings into fake typos.
    """

    SKIP = {"script", "style", "svg", "head", "nav", "header"}  # header = topbar chrome
    BLOCK = {"p", "div", "section", "article", "li", "tr", "figcaption",
             "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "figure"}
    CELL = {"td", "th"}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip_depth += 1
        elif not self.skip_depth and tag == "br":
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip_depth:
            self.skip_depth -= 1
        elif not self.skip_depth:
            if tag in self.BLOCK:
                self.parts.append("\n")
            elif tag in self.CELL:
                self.parts.append(" | ")

    def handle_data(self, data):
        if not self.skip_depth:
            self.parts.append(data)

    def text(self):
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(self.parts))).strip()


def page_text(path: Path) -> str:
    ex = TextExtractor()
    ex.feed(path.read_text(encoding="utf-8", errors="replace"))
    return ex.text()[:MAX_PAGE_CHARS]


def book_context(page: Path) -> str:
    """Find the book.json above this page and summarize the request fields."""
    for parent in page.parents:
        manifest = parent / "book.json"
        if manifest.exists():
            try:
                b = json.loads(manifest.read_text())
            except json.JSONDecodeError:
                return ""
            return (
                f'Book: "{b.get("title", "?")}" — topic: {b.get("topic", "?")}. '
                f'Narrator persona id: {b.get("persona") or "default clear technical author"}. '
                f'Summary: {b.get("summary", "")}'
            )
    return ""


def call_model(model: str, token: str, system: str, user: str) -> str:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": 900,
    }).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2026-03-10",
        },
    )
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read())
            return data["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 1:
                wait = int(e.headers.get("Retry-After", "30"))
                time.sleep(min(wait, 120))
                continue
            raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.environ.get("REVIEW_MODEL", "openai/gpt-4.1-mini"))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        sys.exit("GITHUB_TOKEN not set")

    files = [Path(l.strip()) for l in sys.stdin if l.strip()]
    pages = [f for f in files if f.suffix == ".html" and f.exists()]
    skipped = pages[MAX_PAGES:]
    pages = pages[:MAX_PAGES]

    sections, attention = [], 0
    for page in pages:
        ctx = book_context(page)
        text = page_text(page)
        if len(text) < 200:
            continue  # cover shells / near-empty pages aren't worth a request
        try:
            review = call_model(
                args.model, token, SYSTEM_PROMPT,
                f"{ctx}\n\nPage file: {page}\n\nPage text:\n\"\"\"\n{text}\n\"\"\"",
            )
        except Exception as e:  # advisory: report the failure, keep going
            review = f"_Review failed for this page: {e}_\n\nVERDICT: OK"
        if "NEEDS ATTENTION" in review:
            attention += 1
        sections.append(f"<details>\n<summary><b>{page}</b> — "
                        f"{'⚠️ needs attention' if 'NEEDS ATTENTION' in review else '✅ ok'}"
                        f"</summary>\n\n{review}\n</details>")
        time.sleep(3)  # stay friendly to per-minute limits

    header = (
        f"{MARKER}\n## 🤖 BookBank reviewer\n\n"
        f"Model: `{args.model}` (GitHub Models) · {len(sections)} page(s) reviewed"
        + (f" · {len(skipped)} skipped (page cap {MAX_PAGES})" if skipped else "")
        + f"\n\n**{'⚠️ ' + str(attention) + ' page(s) flagged' if attention else '✅ No pages flagged'}** "
        "— advisory only; a human merges this PR.\n"
    )
    Path(args.out).write_text(header + "\n" + "\n".join(sections) + "\n")
    print(f"wrote {args.out}: {len(sections)} reviews, {attention} flagged")


if __name__ == "__main__":
    main()
