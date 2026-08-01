# BookBank image automation

Books are generated with **image slots** — a prompt + a reserved file path in
`book.json`, but no artwork yet. A slot with no file renders an "Image needed"
card **showing the prompt**. So a book must never reach GitHub Pages until every
slot is filled: Pages/CDN would cache the prompt cards and readers would keep
seeing them even after the art lands.

This pipeline enforces that. The book stays on its **PR branch** (never on
Pages) while art is generated and committed *onto that branch*. Publishing =
merging the PR, and it's the **last** step — the first time the book is ever
live, it's already complete. The only human touches are: **generate the art**,
**label the issue**, **merge the book PR**.

```
routine writes book, pushes branch, opens PR      ← book exists, NOT live
   │
   │  .github/scripts/open_image_requests.py <book-id> --branch <pr-branch>
   ▼
①  image-request issue  (one per unfilled slot; marker names book, slot, branch)
   │
   │  human generates art, drags file into the issue,
   │  MAINTAINER adds the `art-approved` label   ◄── the only trusted trigger
   ▼
②  place-image.yml → downloads the image, runs place_image.py, commits the art
   │                 ONTO THE BOOK PR BRANCH (updates the same open PR), closes issue
   ▼
   … repeat ①–② until every slot is filled …
   │
   ▼
③  human merges the book PR  →  push to main under books/**
   │
   ▼
④  publish-on-merge.yml → build-library.py regenerates index.html + catalog.json;
                          Pages deploys the COMPLETE book for the first time
```

## Pieces

| File | Role |
|------|------|
| `.github/scripts/open_image_requests.py` | **Outbound.** Opens one `image-request` issue per unfilled slot; embeds the book PR branch in the marker. Idempotent (skips placed slots + slots that already have an open issue). |
| `.github/workflows/place-image.yml` | **Inbound.** On a maintainer's `art-approved` label → place the attached image and commit it onto the book PR branch. Serialized (`concurrency`) so approvals can't race-push. |
| `.github/workflows/publish-on-merge.yml` | **Publish.** On `push` to `main` under `books/**` (the book PR merging) → regenerate the shelf/catalog deterministically. |

## Why the book lives on its branch until complete

Placement commits into `books/<id>/assets/img/...` **on the book's PR branch**,
which is not served by Pages. Only merging the PR puts the book on `main` →
Pages. Because art is already on the branch by then, the published book has real
images from the first byte anyone can fetch. No prompt ever enters a cache.

## The security model

`sunprema/books` is **public**, so anyone can *attach* an image to an open
issue. That image is inert. The trusted trigger is the **`art-approved`
label**: assigning a label requires **triage/write** permission, which an
issue author does *not* have (authors can self-*close* but not self-*label*).
`place-image.yml` additionally re-checks the labeler's permission via the API
before touching the repo. No random user can drive a commit.

## The issue marker

Every `image-request` issue body starts with:

```
<!-- bookbank-img: book=<book-id> slot=<slot-id> branch=<book-pr-branch> -->
```

`book`+`slot` locate the slot (`place_image.py` derives the file path/aspect
from `book.json`); `branch` tells placement which open book PR to commit onto.
Don't edit or remove this line; the automation parses it.

## Loop-safety of publish

`publish-on-merge` triggers on pushes under `books/**`. Its own publish commit
only writes `index.html` / `catalog.json` / `assets/**` — never `books/**` — so
the `paths` filter guarantees it can't re-trigger itself.

## Dependencies

Both workflows sparse-clone the public **`sunprema/kit`** plugin for the two
scripts they shell out to (`place_image.py`, `build-library.py`) and
`defaults/personas` (required, or catalog persona names render blank). The
clone is **pinned to a kit SHA** (search `git -C /tmp/kit checkout` in the
workflows) so kit's moving `main` can't silently change CI behavior — bump
that SHA deliberately, in a reviewable one-line change, to adopt kit fixes.
`build-library.py`'s macOS-only `sips` share-JPEG step degrades gracefully on
the Ubuntu runner (cosmetic loss only).

## Manual escape hatches (unchanged)

- `/publish-library` (kit skill) still does a full-library rebuild by hand.
- `place_image.py` / `push-book-pr.sh` still work locally for one-off placement.
