# The BookBank Library

Public home for books written with **BookBank** — each one web-researched and
written page by page in a chosen narrator's voice, then rendered as a
self-contained multi-page HTML book.

**Live:** https://sunprema.github.io/books/

Every book under [`books/`](books/) is static HTML with no network
dependencies. The front page (`index.html`) and `catalog.json` are generated
from each book's `book.json` by `build-library.py` in the BookBank project —
do not hand-edit them; re-run the publisher instead.
