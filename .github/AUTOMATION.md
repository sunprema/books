# BookBank image automation

Books are generated with **image slots** — a prompt + a reserved file path in
`book.json`, but no artwork yet (a fresh book ships publishable with gradient
covers; dangling slots are a validate *warning*, not an error). This pipeline
turns the "download book → read prompt → generate art → place → commit →
publish" manual round trip into a GitHub-native, event-driven flow. The only
human touches are: **generate the art**, **label the issue**, **merge the PR**.

```
book merged & live
   │
   │  .github/scripts/open_image_requests.py <book-id>
   ▼
①  image-request issue  (one per unfilled slot, carries a machine-readable marker)
   │
   │  human generates art, drags file into the issue,
   │  MAINTAINER adds the `art-approved` label   ◄── the only trusted trigger
   ▼
②  place-image.yml   → downloads the image, runs place_image.py into the slot,
   │                    commits to a shared `art/<book-id>` branch,
   │                    opens/updates ONE accumulating PR, closes the issue
   ▼
③  human merges the art PR
   │
   ▼
④  publish-on-merge.yml → build-library.py regenerates index.html + catalog.json
                          (gradient cover → real cover); Pages auto-deploys
```

## Pieces

| File | Role |
|------|------|
| `.github/scripts/open_image_requests.py` | **Outbound.** Opens one `image-request` issue per unfilled slot. Idempotent (skips placed slots and slots that already have an open issue). Run after a book is live. |
| `.github/workflows/place-image.yml` | **Inbound.** On `art-approved` label → place the attached image, accumulate into the book's art PR. |
| `.github/workflows/publish-on-merge.yml` | **Publish.** On merge of an `art/*` PR → regenerate the shelf/catalog deterministically. |

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
<!-- bookbank-img: book=<book-id> slot=<slot-id> -->
```

`book`+`slot` are enough — `place_image.py` derives the file path and aspect
from `book.json`. Don't edit or remove this line; the automation parses it.

## Dependencies

Both workflows shallow-sparse-clone the public **`sunprema/kit`** plugin for
the two scripts they shell out to (`place_image.py`, `build-library.py`) and
`defaults/personas` (required, or catalog persona names render blank).
`build-library.py`'s macOS-only `sips` share-JPEG step degrades gracefully on
the Ubuntu runner (cosmetic loss only).

## Manual escape hatches (unchanged)

- `/publish-library` (kit skill) still does a full-library rebuild by hand.
- `place_image.py` / `push-book-pr.sh` still work locally for one-off placement.
