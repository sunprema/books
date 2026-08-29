# WebMCP tools in the BookBank Library

Every page of this site registers tools on `document.modelContext` — the
[WebMCP](https://webmachinelearning.github.io/webmcp/) API — so a browser
agent gets a structured way to search the library, open books, read and
search chapters and turn pages, instead of scraping the DOM.

Tools are **per document**, as the spec intends: the shelf registers one set,
each book page registers another. The registration is feature-detected, so
browsers without `document.modelContext` load exactly the same pages with no
errors and no behavior change. Everything is same-origin (no `exposedTo`), and
every tool that changes nothing is annotated `readOnlyHint: true`.

The code is generated — `assets/library.js` (shelf) and
`assets/webmcp-book.js` (book pages, loaded by the "⌂ Library" chip block
stamped on every page) both come from `build-library.py` in the BookBank
plugin. Don't hand-edit them here.

## Shelf tools (`index.html`)

| Tool | Input | Read-only | Does |
|---|---|---|---|
| `search_books` | `query?`, `voice?`, `limit?` | ✓ | Ranks the catalog by title › topic › chapter titles › summary/voice. Every word must match. Empty query = newest books. Returns `{total, books:[{id, title, topic, summary, voice, voice_id, chapters, created, url}]}`. |
| `list_voices` | — | ✓ | Narrator personas with book counts. |
| `get_book` | `id` | ✓ | One book's outline: chapters `{n, id, title, url}`, `cheatsheet`, `offline`, `offline_bytes`. |
| `filter_shelf` | `query?`, `voice?` | | Filters the visible grid exactly as the search box + voice chips do. No args = show all. Returns `{shown}`. |
| `open_book` | `id`, `chapter?` | | Navigates to the book, or straight to a chapter (number, id, title fragment) or `"cheatsheet"`. |
| `save_book_offline` | `id` | | Same as the card's ⤓ Offline button; resolves when the download is complete. |
| `remove_offline_book` | `id` | | Deletes the offline copy. |
| `list_offline_books` | — | ✓ | Books saved in this browser. |

`id` is the book's directory name under `books/` (e.g. `http-caching-headers`);
`search_books` returns it. `catalog.json` carries the same data (now with
`chapters` and `cheatsheet` per book) for agents that would rather read a file.

## Book-page tools (every page under `books/<id>/`)

| Tool | Input | Read-only | Does |
|---|---|---|---|
| `get_book_outline` | — | ✓ | This book's title, summary, voice, chapters with URLs, `contents` / `cheatsheet` / `library` URLs, and `current` — which page this document is (`chapter` n, `contents`, `cheatsheet`). |
| `get_page_text` | `maxChars?` (default 12000), `offset?` | ✓ | The readable text of the whole open chapter with navigation chrome removed; `truncated` + `offset` page through long chapters. |
| `find_in_book` | `query`, `limit?` | ✓ | Fetches every chapter (and the cheatsheet) of this book and returns the ones mentioning the words, best first, with snippets. |
| `go_to_chapter` | `chapter` | | Navigates within the book: chapter number / id / title fragment, or `"contents"`, `"cheatsheet"`, `"library"`. Unknown target → `{error, chapters}`. |
| `next_page` / `previous_page` | — | | Turns the two-page spread (`{turned, spread}`); at a chapter boundary follows the chapter link (`{navigating_to}`); `{at_end}` when there is nowhere to go. |
| `open_library` | — | | Back to the shelf. |

Errors are returned as `{error: "..."}` objects rather than rejections, so an
agent can read them and recover (a wrong chapter name comes back with the
chapter list, for instance).

## Trying it yourself

1. Serve the repo: `python3 -m http.server 8000` → <http://localhost:8000/>.
   (`localhost` is a secure context; the spec requires one.)
2. Chrome ≥ 146 with `chrome://flags/#enable-webmcp-testing` enabled — or
   launch with `--enable-features=WebMCP`.
3. In DevTools on any page:

```js
const tools = await document.modelContext.getTools();
tools.map(t => t.name);
const search = tools.find(t => t.name === 'search_books');
await document.modelContext.executeTool(search, JSON.stringify({ query: 'rust' }));
```

Note that Chrome 151 still takes `executeTool`'s input as a JSON **string**
while the draft spec says object; the tools here receive a parsed object either
way and are unaffected. Chrome also mirrors the API on `navigator.modelContext`;
this site only uses the spec's `document.modelContext`.
