#!/usr/bin/env python3
"""
open_image_requests.py — open one GitHub `image-request` issue per unfilled
image slot in a published book, so a human can generate the art from the
prompt and drop it back in. This is the OUTBOUND half of BookBank's
image pipeline (the inbound half is the `place-image` workflow).

Run this AFTER a book is merged and live, for a book whose `images[]` slots
still have no file on disk (the normal state of a freshly generated book —
dangling slots are a validate warning, not an error).

Agentless: plain Python + the `gh` CLI. No AI. Idempotent — a slot that
already has a placed file, or already has an OPEN image-request issue, is
skipped, so it's safe to re-run.

Each issue carries a machine-readable marker the `place-image` workflow
parses. It names the book PR BRANCH so placement commits the art onto the
still-unmerged book PR (the book is never live with prompt placeholders — it
goes to Pages complete, only when that PR merges):

    <!-- bookbank-img: book=<book-id> slot=<slot-id> branch=<pr-branch> -->

Usage:
  open_image_requests.py <book-id> --branch <pr-branch> [--repo owner/name] [--dry-run]

  <book-id>     directory name under books/ (has book.json)
  --branch      the open book PR's head branch (e.g. claude/book-26-svelte);
                placement commits art here. Auto-detected from the open PR
                touching books/<book-id>/ if omitted.
  --repo        target repo (default: $BOOKBANK_BOOKS_REPO or sunprema/books)
  --dry-run     print what would be opened; create nothing

Requires: `gh` authenticated with repo write (issues:write).
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

IMAGE_REQUEST_LABEL = "image-request"
APPROVE_LABEL = "art-approved"


def gh(*args, check=True, capture=True):
    return subprocess.run(
        ["gh", *args],
        check=check,
        text=True,
        capture_output=capture,
    )


def ensure_label(repo, name, color, desc):
    """Create the label if missing (idempotent — ignores 'already exists')."""
    r = gh("label", "create", name, "--repo", repo,
           "--color", color, "--description", desc,
           check=False)
    if r.returncode != 0 and "already exists" not in (r.stderr or ""):
        print(f"  ! could not ensure label {name!r}: {r.stderr.strip()}", file=sys.stderr)


def open_issue_markers(repo):
    """Set of 'book/slot' pairs that already have an OPEN image-request issue."""
    r = gh("issue", "list", "--repo", repo,
           "--label", IMAGE_REQUEST_LABEL, "--state", "open",
           "--limit", "500", "--json", "body", check=False)
    if r.returncode != 0:
        return set()
    seen = set()
    for issue in json.loads(r.stdout or "[]"):
        body = issue.get("body") or ""
        # parse: <!-- bookbank-img: book=X slot=Y -->
        for line in body.splitlines():
            if "bookbank-img:" not in line:
                continue
            book = slot = None
            for tok in line.split():
                if tok.startswith("book="):
                    book = tok[len("book="):]
                elif tok.startswith("slot="):
                    slot = tok[len("slot="):].rstrip("->").strip()
            if book and slot:
                seen.add(f"{book}/{slot}")
    return seen


def issue_body(book_id, slot, branch):
    sid = slot["id"]
    prompt = slot.get("prompt", "").strip() or "(no prompt recorded — see the book page)"
    aspect = slot.get("aspect", "")
    alt = slot.get("alt", "")
    caption = slot.get("caption", "")
    lines = [
        f"<!-- bookbank-img: book={book_id} slot={sid} branch={branch} -->",
        "",
        f"An image is needed for the **`{book_id}`** book, slot **`{sid}`**"
        + (f" ({aspect})." if aspect else "."),
        "",
        "### Prompt — generate an image from this",
        "",
        "> " + prompt.replace("\n", "\n> "),
        "",
    ]
    if alt:
        lines += [f"**Alt text:** {alt}", ""]
    if caption:
        lines += [f"**Caption:** {caption}", ""]
    lines += [
        "### How to fulfil this",
        "",
        "1. Generate the image with your image agent using the prompt above.",
        "2. **Drag the file into a comment on this issue** (or into the issue body).",
        f"3. A maintainer adds the **`{APPROVE_LABEL}`** label. That triggers the "
        "`place-image` workflow, which commits the file into the slot **on the book's "
        "PR branch**. Once every slot is filled, merging the book PR publishes it live "
        "for the first time — already complete, so readers never see a prompt.",
        "",
        "_Do not edit the marker comment at the top — the automation needs it._",
    ]
    return "\n".join(lines)


def detect_pr_branch(repo, book_id):
    """Head branch of the open PR that touches books/<book_id>/, or None."""
    r = gh("pr", "list", "--repo", repo, "--state", "open", "--limit", "100",
           "--json", "headRefName,files", check=False)
    if r.returncode != 0:
        return None
    prefix = f"books/{book_id}/"
    for pr in json.loads(r.stdout or "[]"):
        if any((f.get("path") or "").startswith(prefix) for f in pr.get("files", [])):
            return pr.get("headRefName")
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("book_id")
    ap.add_argument("--branch", default=None,
                    help="book PR head branch (auto-detected if omitted)")
    ap.add_argument("--repo",
                    default=os.environ.get("BOOKBANK_BOOKS_REPO", "sunprema/books"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    book_dir = Path("books") / args.book_id
    bj = book_dir / "book.json"
    if not bj.is_file():
        sys.exit(f"error: no book.json at {bj} (run from the repo root)")

    branch = args.branch or detect_pr_branch(args.repo, args.book_id)
    if not branch:
        sys.exit(f"error: no --branch given and no open PR touches "
                 f"books/{args.book_id}/ — placement needs a book PR branch "
                 f"to commit art onto. Open the book PR first.")
    print(f"{args.book_id}: art will be placed onto branch '{branch}'")

    data = json.loads(bj.read_text())
    images = data.get("images", [])
    if not images:
        print(f"{args.book_id}: no image slots declared — nothing to request.")
        return

    if not args.dry_run:
        ensure_label(args.repo, IMAGE_REQUEST_LABEL, "5319e7",
                     "An image slot awaiting generated art")
        ensure_label(args.repo, APPROVE_LABEL, "0e8a16",
                     "Maintainer-approved: place the attached image")

    already = open_issue_markers(args.repo) if not args.dry_run else set()
    opened = skipped_placed = skipped_open = 0

    for slot in images:
        sid = slot.get("id")
        declared = slot.get("file")
        if not sid or not declared:
            print(f"  ! slot missing id/file, skipping: {slot!r}", file=sys.stderr)
            continue

        dst = book_dir / declared
        if dst.is_file() and dst.stat().st_size > 0:
            print(f"  · {sid}: already placed ({declared}) — skip")
            skipped_placed += 1
            continue

        if f"{args.book_id}/{sid}" in already:
            print(f"  · {sid}: open image-request issue already exists — skip")
            skipped_open += 1
            continue

        title = f"🎨 Image needed — {args.book_id} / {sid}"
        body = issue_body(args.book_id, slot, branch)
        if args.dry_run:
            print(f"  + would open: {title}")
            opened += 1
            continue

        r = gh("issue", "create", "--repo", args.repo,
               "--title", title, "--body", body,
               "--label", IMAGE_REQUEST_LABEL, check=False)
        if r.returncode == 0:
            print(f"  + opened: {title}  {r.stdout.strip()}")
            opened += 1
        else:
            print(f"  ! failed to open {sid}: {r.stderr.strip()}", file=sys.stderr)

    print(f"\n{args.book_id}: opened={opened} "
          f"skipped(placed)={skipped_placed} skipped(open-issue)={skipped_open}"
          + ("  [dry-run]" if args.dry_run else ""))


if __name__ == "__main__":
    main()
