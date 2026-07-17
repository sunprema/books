// Client-side search + voice filter for the shelf. No dependencies.
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
  var dls = Array.prototype.slice.call(document.querySelectorAll('.dl'));
  if (!('caches' in window)) {
    dls.forEach(function (b) { b.hidden = true; });
    dls = [];
  }
  function setUI(btn, state, pct) {
    var bytes = +btn.getAttribute('data-bytes');
    var size = bytes > 0 ? ' (' + (bytes / 1048576).toFixed(1) + ' MB)' : '';
    btn.classList.remove('is-busy', 'is-done');
    if (state === 'busy') {
      btn.classList.add('is-busy');
      btn.textContent = pct + '%';
    } else if (state === 'done') {
      btn.classList.add('is-done');
      btn.textContent = '✓ Offline';
      btn.title = 'Saved for offline reading — click to remove the download';
    } else {
      btn.textContent = '⤓ Offline';
      btn.title = 'Download this book for offline reading' + size;
    }
  }
  dls.forEach(function (btn) {
    var id = btn.getAttribute('data-book');
    var base = new URL('books/' + id + '/', location.href).href;
    var key = 'bb-offline-' + id;
    setUI(btn, localStorage.getItem(key) ? 'done' : 'idle');

    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-busy')) return;

      if (localStorage.getItem(key)) {  // downloaded → remove
        caches.open(OFFLINE).then(function (c) {
          return c.keys().then(function (reqs) {
            return Promise.all(reqs
              .filter(function (r) { return r.url.indexOf(base) === 0; })
              .map(function (r) { return c.delete(r); }));
          });
        }).then(function () {
          localStorage.removeItem(key);
          setUI(btn, 'idle');
        });
        return;
      }

      setUI(btn, 'busy', 0);
      fetch(base + 'offline.json').then(function (r) {
        if (!r.ok) throw new Error('offline.json ' + r.status);
        return r.json();
      }).then(function (m) {
        var urls = [base].concat(m.files.map(function (p) { return base + p; }));
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
        localStorage.setItem(key, '1');
        setUI(btn, 'done');
      }).catch(function (err) {
        setUI(btn, 'idle');
        btn.title = 'Download failed (' + err.message + ') — click to retry';
      });
    });
  });
})();
