/* Practical Kafka — two-page-spread pager.
   Flows the leaf's content into page-width columns and translates it
   horizontally to turn spreads. Below 900px it goes inert and the CSS
   breakpoint's natural document flow takes over. */
(function(){
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  if(!leaf || !vp) return;

  var i = 0, total = 1, spread = 1;

  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }

  function contentRight(){
    // Rightmost content edge relative to the leaf's left edge, measured from
    // child rects (engine-proof, and invariant while translated).
    var base = leaf.getBoundingClientRect().left, right = 0, kids = leaf.children;
    for(var k = 0; k < kids.length; k++){
      var r = kids[k].getBoundingClientRect().right - base;
      if(r > right) right = r;
    }
    return right;
  }

  function layout(){
    if(mobile()){
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if(n0) n0.textContent = '';
      relayout();
      return;
    }
    // Subtract the leaf's own horizontal padding — the columns live inside the
    // content box, so sizing them off clientWidth overflows the fold.
    var cs = getComputedStyle(leaf);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    var W = vp.clientWidth - padL - padR;
    var gap = Math.round(W * 0.085), colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
    relayout();
  }

  function relayout(){ window.dispatchEvent(new CustomEvent('bookbank:relayout')); }

  function render(){
    if(mobile()) return;
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if(n) n.textContent = (i + 1) + ' / ' + total;
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
    var m = /^#s(\d+)$/.exec(location.hash);
    if(location.hash === '#last'){ i = total - 1; render(); }
    else if(m){ i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    setTimeout(layout, 250);   // re-measure once fonts settle
  });

  Array.prototype.forEach.call(document.images, function(im){
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });

  layout();

  // Plain-browser keys. The app sets window.__bookbankNav and handles keys
  // itself, so defer to it or the page would turn twice.
  document.addEventListener('keydown', function(e){
    if(window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if(e.key === 'ArrowRight'){ bookbankPager.next(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ bookbankPager.prev(); e.preventDefault(); }
    else if(e.key === 'ArrowUp'){ bookbankPager.home(); e.preventDefault(); }
  });

  // REQUIRED: route clicks on the visible Next/Prev links through the pager,
  // or a mouse click jumps to the next FILE and skips the chapter's remaining
  // spreads with no scrollbar to betray the loss.
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
      navigator.clipboard.writeText(p.textContent.trim()).then(function(){
        var old = b.textContent; b.textContent = 'Copied';
        setTimeout(function(){ b.textContent = old; }, 1200);
      });
    }
  });
})();
