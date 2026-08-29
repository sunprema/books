// Client-side search + voice filter for the shelf. No dependencies.
// The first block is the shelf's own behavior and exposes it as
// window.bookbankShelf; the second registers that behavior as WebMCP tools on
// document.modelContext (https://webmachinelearning.github.io/webmcp/) so an
// in-browser agent can search the shelf, open books and manage offline copies.
(function () {
  var q = document.getElementById('q');
  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var voice = '';

  function apply() {
    var term = (q.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      var okText = !term || c.getAttribute('data-search').indexOf(term) !== -1;
      var okVoice = !voice || c.getAttribute('data-voice') === voice;
      var show = okText && okVoice;
      c.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (empty) empty.hidden = shown !== 0;
    return shown;
  }

  // Programmatic filter (used by the WebMCP filter_shelf tool): sets the
  // search box and the active voice chip exactly as a user would, so the UI
  // and the filter never disagree.
  function setFilter(term, v) {
    if (q) q.value = term || '';
    voice = v || '';
    chips.forEach(function (c) {
      c.classList.toggle('is-active', (c.getAttribute('data-voice') || '') === voice);
    });
    return apply();
  }

  q && q.addEventListener('input', apply);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      voice = chip.getAttribute('data-voice') || '';
      apply();
    });
  });

  // PWA: register the service worker (resolves to <site>/sw.js under the
  // shelf's own path, so the scope covers the whole library incl. books/).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // Offline downloads: each card's "⤓ Offline" button precaches the book's
  // full file list (its generated offline.json) into a persistent cache the
  // service worker serves from. Click again to remove the download.
  var OFFLINE = 'bookbank-offline';
  var canCache = 'caches' in window;
  var dls = Array.prototype.slice.call(document.querySelectorAll('.dl'));
  if (!canCache) {
    dls.forEach(function (b) { b.hidden = true; });
    dls = [];
  }
  function setUI(btn, state, pct) {
    if (!btn) return;
    var bytes = +btn.getAttribute('data-bytes');
    var size = bytes > 0 ? ' (' + (bytes / 1048576).toFixed(1) + ' MB)' : '';
    btn.classList.remove('is-busy', 'is-done', 'is-failed');
    if (state === 'busy') {
      btn.classList.add('is-busy');
      btn.textContent = pct + '%';
    } else if (state === 'done') {
      btn.classList.add('is-done');
      btn.textContent = '✓ Offline';
      btn.title = 'Saved for offline reading — click to remove the download';
    } else if (state === 'failed') {
      // Never fail silently back to the idle label: a button that visibly
      // does nothing on click reads as broken with no way to report it.
      btn.classList.add('is-failed');
      btn.textContent = '⚠ Retry';
    } else {
      btn.textContent = '⤓ Offline';
      btn.title = 'Download this book for offline reading' + size;
    }
  }
  function bookBase(id) { return new URL('books/' + id + '/', location.href).href; }
  function keyFor(id) { return 'bb-offline-' + id; }
  function btnFor(id) {
    return dls.filter(function (b) { return b.getAttribute('data-book') === id; })[0] || null;
  }
  function isOffline(id) {
    try { return !!localStorage.getItem(keyFor(id)); } catch (e) { return false; }
  }
  function offlineIds() {
    return cards.map(function (c) {
      var b = c.querySelector('.dl');
      return b ? b.getAttribute('data-book') : '';
    }).filter(function (id) { return id && isOffline(id); });
  }

  function remove(id) {
    if (!canCache) return Promise.reject(new Error('Cache API unavailable'));
    var base = bookBase(id), btn = btnFor(id);
    return caches.open(OFFLINE).then(function (c) {
      return c.keys().then(function (reqs) {
        return Promise.all(reqs
          .filter(function (r) { return r.url.indexOf(base) === 0; })
          .map(function (r) { return c.delete(r); }));
      });
    }).then(function () {
      try { localStorage.removeItem(keyFor(id)); } catch (e) {}
      setUI(btn, 'idle');
      return { id: id, offline: false };
    });
  }

  function download(id) {
    if (!canCache) return Promise.reject(new Error('Cache API unavailable'));
    var base = bookBase(id), btn = btnFor(id), files = 0, bytes = 0;
    setUI(btn, 'busy', 0);
    return fetch(base + 'offline.json').then(function (r) {
      if (!r.ok) throw new Error('offline.json ' + r.status);
      return r.json();
    }).then(function (m) {
      bytes = m.bytes || 0;
      var urls = [base].concat(m.files.map(function (p) { return base + p; }));
      files = urls.length;
      return caches.open(OFFLINE).then(function (c) {
        var i = 0, done = 0;
        function next() {
          if (i >= urls.length) return Promise.resolve();
          return c.add(urls[i++]).then(function () {
            done++;
            setUI(btn, 'busy', Math.round(done / urls.length * 100));
            return next();
          });
        }
        // A few parallel lanes keep it quick without hammering the host.
        var lanes = [];
        for (var n = 0; n < 6 && n < urls.length; n++) lanes.push(next());
        return Promise.all(lanes);
      });
    }).then(function () {
      try { localStorage.setItem(keyFor(id), '1'); } catch (e) {}
      setUI(btn, 'done');
      return { id: id, offline: true, files: files, bytes: bytes };
    }, function (err) {
      setUI(btn, 'failed');
      if (btn) btn.title = 'Download failed (' + err.message + ') — click to retry';
      throw err;
    });
  }

  dls.forEach(function (btn) {
    var id = btn.getAttribute('data-book');
    setUI(btn, isOffline(id) ? 'done' : 'idle');
    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-busy')) return;
      (isOffline(id) ? remove(id) : download(id)).catch(function () {});
    });
  });

  window.bookbankShelf = {
    filter: setFilter,
    download: download,
    remove: remove,
    isOffline: isOffline,
    offlineIds: offlineIds,
    canCache: canCache
  };
})();

// WebMCP: register the shelf as tools on document.modelContext. Feature-
// detected — browsers without the API (or with it disabled) skip this block
// entirely. Tools live for the document's lifetime, so no AbortSignal is used.
(function () {
  var mc = document.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;
  var shelf = window.bookbankShelf;
  if (!shelf) return;

  var catalogP = null;
  function catalog() {
    if (!catalogP) {
      catalogP = fetch('catalog.json').then(function (r) {
        if (!r.ok) throw new Error('catalog.json ' + r.status);
        return r.json();
      }).then(function (d) { return d.books || []; });
      catalogP.catch(function () { catalogP = null; });   // let a later call retry
    }
    return catalogP;
  }
  function abs(u) { return new URL(u, location.href).href; }
  function persona(b) { return b.persona || {}; }
  function brief(b) {
    return {
      id: b.id, title: b.title, topic: b.topic, summary: b.summary,
      voice: persona(b).name || '', voice_id: persona(b).id || '',
      chapters: b.concepts, created: b.created, url: abs(b.url)
    };
  }
  function outline(b) {
    var o = brief(b);
    o.voice_tagline = persona(b).tagline || '';
    o.chapters = (b.chapters || []).map(function (c, i) {
      return { n: i + 1, id: c.id, title: c.title, url: abs(c.url) };
    });
    if (b.cheatsheet) o.cheatsheet = abs(b.cheatsheet);
    o.offline = shelf.isOffline(b.id);
    o.offline_bytes = b.offline_bytes || 0;
    return o;
  }
  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
  function findBook(books, id) {
    var want = norm(id);
    if (!want) return null;
    return books.filter(function (b) { return norm(b.id) === want; })[0]
        || books.filter(function (b) { return norm(b.title) === want; })[0]
        || null;
  }
  function voiceMatches(b, v) {
    if (!v) return true;
    v = norm(v);
    var p = persona(b);
    return norm(p.id) === v || norm(p.name).indexOf(v) !== -1;
  }
  function score(b, terms) {
    var title = norm(b.title), topic = norm(b.topic), summary = norm(b.summary);
    var chap = (b.chapters || []).map(function (c) { return norm(c.title); }).join(' | ');
    var voice = norm(persona(b).name);
    var s = 0;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i], hit = 0;
      if (title.indexOf(t) !== -1) hit += 5;
      if (topic.indexOf(t) !== -1) hit += 3;
      if (chap.indexOf(t) !== -1) hit += 2;
      if (summary.indexOf(t) !== -1 || voice.indexOf(t) !== -1) hit += 1;
      if (!hit) return 0;          // every term must match somewhere
      s += hit;
    }
    return s;
  }
  function resolveChapter(b, want) {
    var chapters = (b.chapters || []);
    if (want == null || want === '') return null;
    if (typeof want === 'number' || /^\d+$/.test(String(want))) {
      return chapters[parseInt(want, 10) - 1] || null;
    }
    var w = norm(want);
    if (w === 'cheatsheet' && b.cheatsheet) return { title: 'Cheatsheet', url: b.cheatsheet };
    return chapters.filter(function (c) { return norm(c.id) === w; })[0]
        || chapters.filter(function (c) { return norm(c.title).indexOf(w) !== -1; })[0]
        || null;
  }
  function limitOf(v, dflt, max) {
    var n = parseInt(v, 10);
    if (!(n > 0)) n = dflt;
    return Math.min(n, max);
  }
  function reg(tool) {
    try {
      Promise.resolve(mc.registerTool(tool)).catch(function () {});
    } catch (e) { /* a duplicate or invalid tool must not break the shelf */ }
  }

  reg({
    name: 'search_books',
    title: 'Search the library',
    description: 'Search the BookBank Library catalog by title, topic, chapter titles, summary or narrator voice. Returns matching books (best first) with their ids, which the other tools take. An empty query lists the newest books.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for; every word must match somewhere in the book.' },
        voice: { type: 'string', description: 'Only books told in this narrator voice (an id or name from list_voices).' },
        limit: { type: 'integer', description: 'Maximum results (default 12, max 50).' }
      }
    },
    annotations: { readOnlyHint: true },
    execute: function (input) {
      input = input || {};
      var terms = norm(input.query).split(/\s+/).filter(Boolean);
      var limit = limitOf(input.limit, 12, 50);
      return catalog().then(function (books) {
        var hits = books.filter(function (b) { return voiceMatches(b, input.voice); });
        if (terms.length) {
          hits = hits.map(function (b) { return { b: b, s: score(b, terms) }; })
            .filter(function (x) { return x.s > 0; })
            .sort(function (x, y) { return y.s - x.s; })
            .map(function (x) { return x.b; });
        }
        return {
          total: hits.length,
          books: hits.slice(0, limit).map(brief)
        };
      });
    }
  });

  reg({
    name: 'list_voices',
    title: 'List narrator voices',
    description: 'List the narrator voices (personas) books in this library are written in, with how many books each has.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      return catalog().then(function (books) {
        var seen = {};
        books.forEach(function (b) {
          var p = persona(b);
          if (!p.id) return;
          seen[p.id] = seen[p.id] || { id: p.id, name: p.name || p.id, tagline: p.tagline || '', books: 0 };
          seen[p.id].books++;
        });
        return {
          voices: Object.keys(seen).map(function (k) { return seen[k]; })
            .sort(function (a, b) { return b.books - a.books || a.name.localeCompare(b.name); })
        };
      });
    }
  });

  reg({
    name: 'get_book',
    title: 'Get a book’s outline',
    description: 'Get one book’s full outline: summary, narrator voice, every chapter with its URL, the cheatsheet URL, and whether it is saved offline.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The book id (or exact title) from search_books.' } },
      required: ['id']
    },
    annotations: { readOnlyHint: true },
    execute: function (input) {
      return catalog().then(function (books) {
        var b = findBook(books, input && input.id);
        if (!b) return { error: 'No book with id "' + (input && input.id) + '". Use search_books to find ids.' };
        return outline(b);
      });
    }
  });

  reg({
    name: 'filter_shelf',
    title: 'Filter the visible shelf',
    description: 'Filter the shelf the user is looking at, exactly as typing in the search box and picking a voice chip would. Call with no arguments to show everything again. Returns how many books are now visible.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Text filter (matches title, topic, voice, summary).' },
        voice: { type: 'string', description: 'Voice id from list_voices, or empty for all voices.' }
      }
    },
    annotations: { readOnlyHint: false },
    execute: function (input) {
      input = input || {};
      return catalog().then(function (books) {
        var v = norm(input.voice);
        if (v) {
          var m = books.filter(function (b) { return voiceMatches(b, v); })[0];
          v = m ? persona(m).id : '';
        }
        return { shown: shelf.filter(input.query || '', v), voice: v || '' };
      }, function () {
        return { shown: shelf.filter(input.query || '', norm(input.voice)) };
      });
    }
  });

  reg({
    name: 'open_book',
    title: 'Open a book',
    description: 'Navigate this tab to a book’s contents page, or straight to one of its chapters (by number, id, or title) or its cheatsheet.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The book id from search_books.' },
        chapter: { type: 'string', description: 'Optional: chapter number, chapter id, part of a chapter title, or "cheatsheet".' }
      },
      required: ['id']
    },
    annotations: { readOnlyHint: false },
    execute: function (input) {
      return catalog().then(function (books) {
        var b = findBook(books, input && input.id);
        if (!b) return { error: 'No book with id "' + (input && input.id) + '".' };
        var url = abs(b.url), where = 'contents';
        if (input.chapter != null && input.chapter !== '') {
          var c = resolveChapter(outline(b), input.chapter);
          if (!c) return { error: 'No chapter matching "' + input.chapter + '" in ' + b.title + '.', chapters: outline(b).chapters };
          url = c.url; where = c.title;
        }
        setTimeout(function () { location.href = url; }, 0);
        return { opening: b.title, where: where, url: url };
      });
    }
  });

  reg({
    name: 'save_book_offline',
    title: 'Save a book offline',
    description: 'Download a whole book into this browser’s offline cache (same as the card’s "⤓ Offline" button) so it can be read without a network. Resolves when the download finishes.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The book id from search_books.' } },
      required: ['id']
    },
    annotations: { readOnlyHint: false },
    execute: function (input) {
      if (!shelf.canCache) return { error: 'Offline storage is not available in this browser.' };
      return catalog().then(function (books) {
        var b = findBook(books, input && input.id);
        if (!b) return { error: 'No book with id "' + (input && input.id) + '".' };
        if (shelf.isOffline(b.id)) return { id: b.id, title: b.title, offline: true, already: true };
        return shelf.download(b.id).then(function (r) { r.title = b.title; return r; },
          function (err) { return { id: b.id, offline: false, error: err.message }; });
      });
    }
  });

  reg({
    name: 'remove_offline_book',
    title: 'Remove an offline copy',
    description: 'Delete a book’s offline copy from this browser’s cache.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The book id.' } },
      required: ['id']
    },
    annotations: { readOnlyHint: false },
    execute: function (input) {
      if (!shelf.canCache) return { error: 'Offline storage is not available in this browser.' };
      var id = norm(input && input.id);
      if (!id) return { error: 'id is required.' };
      return shelf.remove(id).then(null, function (err) { return { id: id, error: err.message }; });
    }
  });

  reg({
    name: 'list_offline_books',
    title: 'List offline books',
    description: 'List the books saved in this browser’s offline cache.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      var ids = shelf.offlineIds();
      return catalog().then(function (books) {
        return {
          books: ids.map(function (id) {
            var b = findBook(books, id);
            return b ? brief(b) : { id: id };
          })
        };
      }, function () {
        return { books: ids.map(function (id) { return { id: id }; }) };
      });
    }
  });
})();
