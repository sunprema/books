/* Two-page-spread pager for BookBank. Self-contained; works from file://.
   Exposes window.bookbankPager {next,prev,home}. The app binds → ← ↑ to it. */
(function(){
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  if(!leaf || !vp) return;
  var i = 0, total = 1, spread = 1;
  // Same 900px breakpoint as the CSS. Below it there's no spread to paginate —
  // layout()/render() go inert and next()/prev() fall through to file navigation.
  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }
  function contentRight(){
    // Rightmost content edge relative to the leaf's left edge. Measured from
    // child bounding rects, NOT leaf.scrollWidth — rects are engine-proof, and
    // both rects carry the current translateX equally so the difference is
    // invariant while flipped/animating.
    var base = leaf.getBoundingClientRect().left, right = 0, kids = leaf.children;
    for(var k = 0; k < kids.length; k++){
      var r = kids[k].getBoundingClientRect().right - base;
      if(r > right) right = r;
    }
    return right;
  }
  function layout(){
    if(mobile()){
      // Let the CSS breakpoint's natural flow take over — clear any inline
      // column/transform styles a wider layout() left behind (e.g. resize
      // across the breakpoint) and collapse to a single "page".
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if(n0) n0.textContent = '';
      return;
    }
    // Available inline space is the leaf's CONTENT box — subtract its own
    // horizontal padding, or two columns won't fit and Chrome collapses to one.
    var cs = getComputedStyle(leaf);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var W = vp.clientWidth - padX, gap = Math.round(W * 0.08), colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);                              // distance per spread
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
  }
  function render(){
    if(mobile()) return;               // natural document flow — nothing to translate
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if(n) n.textContent = (i + 1) + ' / ' + total;
  }
  function href(rel){ var a = document.querySelector('a[rel~="' + rel + '"]'); return a && a.getAttribute('href'); }
  window.bookbankPager = {
    next: function(){ if(i < total-1){ i++; render(); } else { var h=href('next'); if(h) location.href = h; } },
    prev: function(){ if(i > 0){ i--; render(); } else { var h=href('prev'); if(h) location.href = h + '#last'; } },
    home: function(){ var h=href('home'); if(h) location.href = h; }
  };
  window.addEventListener('resize', layout);
  window.addEventListener('load', function(){
    layout();
    var m = /^#s(\d+)$/.exec(location.hash);               // #s2 = deep-link to spread 2
    if(location.hash === '#last'){ i = total-1; render(); }
    else if(m){ i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    setTimeout(layout, 250);                               // re-measure after fonts settle
  });
  // Images popping in or erroring (image-slot placeholders) reflow the columns.
  Array.prototype.forEach.call(document.images, function(im){
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });
  layout();
  // Plain-browser keyboard support; the BookBank app handles keys itself (it sets
  // window.__bookbankNav), so defer to it to avoid turning twice.
  document.addEventListener('keydown', function(e){
    if(window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if(e.key === 'ArrowRight'){ bookbankPager.next(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ bookbankPager.prev(); e.preventDefault(); }
    else if(e.key === 'ArrowUp'){ bookbankPager.home(); e.preventDefault(); }
  });
  // REQUIRED — route clicks on the visible Next/Prev links through the pager.
  // The raw links navigate FILES, so without this a mouse click on "Next ›"
  // skips the chapter's remaining spreads — the book reads as truncated, and
  // there's no scrollbar to reveal the loss (real bug, 2026-07-04). The pager
  // still follows the href once the last/first spread is reached.
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if(!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });
  // "Copy prompt" fallback for a plain browser (the app injects the real
  // drag/drop wiring; this just makes the button work standalone).
  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.img-copy');
    if(!btn) return;
    var slot = btn.closest('.img-slot');
    var prompt = slot && slot.querySelector('.img-prompt');
    if(!prompt || !navigator.clipboard) return;
    navigator.clipboard.writeText(prompt.textContent.trim()).then(function(){
      var old = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(function(){ btn.textContent = old; }, 1400);
    });
  });
})();
