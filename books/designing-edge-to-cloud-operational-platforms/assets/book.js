/* Designing Edge-to-Cloud Operational Platforms — two-page spread pager.
   Contract (see the write-book skill): exposes window.bookbankPager with
   next/prev/home, dispatches bookbank:relayout after every layout() and
   bookbank:spread on every render(), routes rel~="next"/"prev" clicks
   through the pager, and goes inert below the 900px CSS breakpoint. */
(function () {
  var leaf = document.querySelector('.book-leaf');
  var vp = document.querySelector('.book-viewport');
  if (!leaf || !vp) return;

  var i = 0, total = 1, spread = 1;

  // Same breakpoint as the CSS. Below it there is no spread to paginate.
  function mobile() { return !window.matchMedia('(min-width: 901px)').matches; }

  // Rightmost content edge relative to the leaf's left edge, measured from the
  // children's bounding rects (engine-proof, and invariant while translated).
  function contentRight() {
    var base = leaf.getBoundingClientRect().left, right = 0, kids = leaf.children;
    for (var k = 0; k < kids.length; k++) {
      var r = kids[k].getBoundingClientRect().right - base;
      if (r > right) right = r;
    }
    return right;
  }

  function layout() {
    if (mobile()) {
      leaf.style.columnGap = '';
      leaf.style.columnWidth = '';
      leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if (n0) n0.textContent = '';
      relayout();
      return;
    }
    // The leaf's own horizontal padding is NOT available to the columns, so it
    // must come off the viewport width before the column arithmetic. Without
    // this the two columns plus the gap overflow the content box and the
    // right-hand page bleeds past the fold.
    var cs = getComputedStyle(leaf);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var W = Math.max(240, vp.clientWidth - padX);
    var gap = Math.round(W * 0.085);
    var colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
    relayout();
  }

  // Canvas widgets and 3D figures re-fit on this event.
  function relayout() { window.dispatchEvent(new CustomEvent('bookbank:relayout')); }

  function render() {
    if (mobile()) return;
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if (n) n.textContent = (i + 1) + ' / ' + total;
    // book-progress.js listens for this to learn the reader's spread.
    window.dispatchEvent(new CustomEvent('bookbank:spread', { detail: { i: i, total: total } }));
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
    setTimeout(layout, 250); // re-measure once fonts have settled
  });

  // Images popping in or erroring (unfilled image slots) reflow the columns.
  Array.prototype.forEach.call(document.images, function (im) {
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });

  layout();

  // Plain-browser keyboard support; the app sets window.__bookbankNav and
  // handles keys itself, so defer to it rather than turning twice.
  document.addEventListener('keydown', function (e) {
    if (window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { bookbankPager.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { bookbankPager.prev(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { bookbankPager.home(); e.preventDefault(); }
  });

  // REQUIRED — route clicks on the visible Next/Prev links through the pager,
  // or a mouse click skips the chapter's remaining spreads.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if (!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });
})();
