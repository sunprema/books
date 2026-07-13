/* GIT INTERNALS — spread pager. Contract: window.bookbankPager {next,prev,home}.
   The BookBank app binds arrow keys itself (it sets window.__bookbankNav);
   our keydown handler is only for plain browsers.

   NOTE: content extent is measured from child bounding rects, NOT
   leaf.scrollWidth — WebKit (the app's WKWebView) reports scrollWidth of a
   fixed-height multicolumn box as just the visible width, which would make
   every chapter look like a single spread and strand the rest of the content. */
(function () {
  var leaf = document.querySelector('.book-leaf');
  var vp = document.querySelector('.book-viewport');
  if (!leaf || !vp) return;
  var i = 0, total = 1, spread = 1;

  // Same 900px breakpoint as book.css. Below it there's no spread to
  // paginate — layout()/render() go inert and next()/prev() fall through to
  // plain file-to-file navigation.
  function mobile() { return !window.matchMedia('(min-width: 901px)').matches; }

  function contentRight() {
    // Rightmost content edge relative to the leaf's own left edge. Both rects
    // carry the current translateX equally, so the difference is invariant.
    var base = leaf.getBoundingClientRect().left, right = 0;
    var kids = leaf.children;
    for (var k = 0; k < kids.length; k++) {
      var r = kids[k].getBoundingClientRect().right - base;
      if (r > right) right = r;
    }
    return right;
  }

  function layout() {
    if (mobile()) {
      // Let the CSS breakpoint's natural flow take over — clear any inline
      // column/transform styles a wider layout() left behind (e.g. resize
      // across the breakpoint) and collapse to a single "page".
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if (n0) n0.textContent = '';
      return;
    }
    var W = vp.clientWidth, gap = Math.round(W * 0.08), colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
  }
  function render() {
    if (mobile()) return; // natural document flow — nothing to translate
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if (n) n.textContent = (i + 1) + ' / ' + total;
  }
  function href(rel) {
    var a = document.querySelector('a[rel~="' + rel + '"]');
    return a && a.getAttribute('href');
  }
  window.bookbankPager = {
    next: function () {
      if (i < total - 1) { i++; render(); }
      else { var h = href('next'); if (h) location.href = h; }
    },
    prev: function () {
      if (i > 0) { i--; render(); }
      else { var h = href('prev'); if (h) location.href = h + '#last'; }
    },
    home: function () { var h = href('home'); if (h) location.href = h; }
  };

  window.addEventListener('resize', layout);
  window.addEventListener('load', function () {
    layout();
    var m = /^#s(\d+)$/.exec(location.hash);
    if (location.hash === '#last') { i = total - 1; render(); }
    else if (m) { i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    // Re-measure once more after fonts settle.
    setTimeout(layout, 250);
  });
  // Images popping in or erroring (image-slot placeholders) reflow the columns.
  Array.prototype.forEach.call(document.images, function (im) {
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });
  layout();

  // Plain-browser keyboard support; the BookBank app handles keys itself (it
  // sets window.__bookbankNav), so defer to it to avoid turning twice.
  document.addEventListener('keydown', function (e) {
    if (window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { window.bookbankPager.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { window.bookbankPager.prev(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { window.bookbankPager.home(); e.preventDefault(); }
  });

  // REQUIRED — route clicks on the visible Next/Prev links through the pager.
  // The raw links navigate FILES, so without this a mouse click on "Next"
  // skips the chapter's remaining spreads. The pager still follows the href
  // once the last/first spread is reached.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if (!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    window.bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });

  // Plain-browser fallback for the "Copy prompt" buttons (the app injects its own).
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.img-copy');
    if (!btn) return;
    var slot = btn.closest('.img-slot');
    var p = slot && slot.querySelector('.img-prompt');
    if (p && navigator.clipboard) {
      navigator.clipboard.writeText(p.textContent.trim());
      var old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
  });
})();
