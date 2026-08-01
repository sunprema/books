/* book.js — the two-page-spread pager.
   Self-contained, no dependencies, works from file://.

   Note on the fold: layout() subtracts the leaf's horizontal padding before
   sizing the two columns. Without that subtraction the columns + gap are
   measured against the viewport rather than the content box, and the spread
   overflows to the right (the canonical fold bug). */
(function(){
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  if(!leaf || !vp) return;

  var i = 0, total = 1, spread = 1;

  // Same 900px breakpoint as the CSS. Below it there is no spread to
  // paginate — layout()/render() go inert and next()/prev() fall through
  // to file navigation.
  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }

  function pads(){
    var cs = getComputedStyle(leaf);
    return {
      l: parseFloat(cs.paddingLeft)  || 0,
      r: parseFloat(cs.paddingRight) || 0
    };
  }

  function contentRight(padL){
    // Rightmost content edge relative to the leaf's CONTENT-box left edge.
    // Measured from child bounding rects, not leaf.scrollWidth — rects are
    // engine-proof, and every rect carries the current translateX equally so
    // the difference stays invariant while flipped or animating.
    var base = leaf.getBoundingClientRect().left + padL;
    var right = 0, kids = leaf.children;
    for(var k = 0; k < kids.length; k++){
      var r = kids[k].getBoundingClientRect().right - base;
      if(r > right) right = r;
    }
    return right;
  }

  function layout(){
    if(mobile()){
      // Hand back to the CSS breakpoint's natural flow — clear any inline
      // column/transform styles a wider layout() left behind.
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if(n0) n0.textContent = '';
      relayout();
      return;
    }
    var p = pads();
    var avail = vp.clientWidth - p.l - p.r;      // the real content box
    if(avail <= 0) return;
    var gap  = Math.round(avail * 0.085);
    var colW = (avail - gap) / 2;
    if(colW <= 0) return;

    leaf.style.columnGap   = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);                   // distance travelled per spread

    var cols = Math.max(1, Math.ceil((contentRight(p.l) - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
    relayout();
  }

  // REQUIRED after every layout(): canvas widgets and 3D figures re-fit and
  // redraw on this event.
  function relayout(){ window.dispatchEvent(new CustomEvent('bookbank:relayout')); }

  function render(){
    if(mobile()) return;                         // natural flow — nothing to translate
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if(n) n.textContent = (i + 1) + ' / ' + total;
    // book-progress.js listens for this to learn the reader's spread.
    window.dispatchEvent(new CustomEvent('bookbank:spread', { detail: { i: i, total: total } }));
  }

  function href(rel){
    var a = document.querySelector('a[rel~="' + rel + '"]');
    return a && a.getAttribute('href');
  }

  window.bookbankPager = {
    next: function(){
      if(i < total - 1){ i++; render(); }
      else { var h = href('next'); if(h) location.href = h; }
    },
    prev: function(){
      if(i > 0){ i--; render(); }
      else { var h = href('prev'); if(h) location.href = h + '#last'; }
    },
    home: function(){ var h = href('home'); if(h) location.href = h; }
  };

  window.addEventListener('resize', layout);

  window.addEventListener('load', function(){
    layout();
    var m = /^#s(\d+)$/.exec(location.hash);     // #s2 = deep-link to spread 2
    if(location.hash === '#last'){ i = total - 1; render(); }
    else if(m){ i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    setTimeout(layout, 250);                      // re-measure once fonts settle
  });

  // Images popping in or erroring (image-slot placeholders) reflow the columns.
  Array.prototype.forEach.call(document.images, function(im){
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });

  layout();

  // Plain-browser keyboard support. The BookBank app handles keys itself and
  // sets window.__bookbankNav, so defer to it or the page would turn twice.
  document.addEventListener('keydown', function(e){
    if(window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.key === 'ArrowRight'){ bookbankPager.next(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ bookbankPager.prev(); e.preventDefault(); }
    else if(e.key === 'ArrowUp'){ bookbankPager.home(); e.preventDefault(); }
  });

  // REQUIRED — route clicks on the visible Next/Prev links through the pager.
  // The raw links navigate FILES, so without this a mouse click on "Next"
  // skips the chapter's remaining spreads and the book reads as truncated,
  // with no scrollbar to betray the loss.
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if(!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });

  // Copy-prompt buttons on image slots (plain-browser convenience).
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.img-copy');
    if(!b) return;
    var slot = b.closest('.img-slot');
    var p = slot && slot.querySelector('.img-prompt');
    if(p && navigator.clipboard){
      navigator.clipboard.writeText(p.textContent.trim());
      var was = b.textContent; b.textContent = 'Copied';
      setTimeout(function(){ b.textContent = was; }, 1400);
    }
  });
})();
