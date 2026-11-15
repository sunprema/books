/* Computer Networks — two-page-spread pager for BookBank.
   Self-contained; works from file://. Exposes window.bookbankPager
   {next, prev, home}; the BookBank app binds → ← ↑ to it.
   Contract: dispatches `bookbank:relayout` after every layout() (widgets
   re-fit on it) and `bookbank:spread` on every render() (book-progress.js). */
(function(){
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  if(!leaf || !vp) return;
  var i = 0, total = 1, spread = 1;

  // Same 900px breakpoint as book.css. Below it: one scrolling column,
  // Next/Prev step file-to-file.
  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }

  function contentRight(){
    // Rightmost content edge relative to the leaf's left edge, from child
    // rects (engine-proof; invariant under the current translateX).
    var base = leaf.getBoundingClientRect().left, right = 0, kids = leaf.children;
    for(var k = 0; k < kids.length; k++){
      var r = kids[k].getBoundingClientRect().right - base;
      if(r > right) right = r;
    }
    return right;
  }

  function relayout(){ window.dispatchEvent(new CustomEvent('bookbank:relayout')); }

  function layout(){
    if(mobile()){
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if(n0) n0.textContent = '';
      relayout();
      return;
    }
    // Columns live in the leaf's CONTENT box — subtract its horizontal
    // padding (the outer page margins), or two columns + gap overflow.
    var cs = getComputedStyle(leaf);
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    var W = vp.clientWidth - padL - padR;
    var gap = Math.round(W * 0.09);           // the gap straddles the spine
    var colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - padL - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
    relayout();
  }

  function render(){
    if(mobile()) return;
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if(n) n.textContent = 'Sheet ' + (i + 1) + ' / ' + total;
    window.dispatchEvent(new CustomEvent('bookbank:spread', { detail: { i: i, total: total } }));
  }

  function href(rel){ var a = document.querySelector('a[rel~="' + rel + '"]'); return a && a.getAttribute('href'); }

  window.bookbankPager = {
    next: function(){ if(!mobile() && i < total - 1){ i++; render(); } else { var h = href('next'); if(h) location.href = h; } },
    prev: function(){ if(!mobile() && i > 0){ i--; render(); } else { var h = href('prev'); if(h) location.href = h + (mobile() ? '' : '#last'); } },
    home: function(){ var h = href('home'); if(h) location.href = h; }
  };

  var t = null;
  window.addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(layout, 60); });
  window.addEventListener('load', function(){
    layout();
    var m = /^#s(\d+)$/.exec(location.hash);              // #s2 = deep-link to spread 2
    if(location.hash === '#last'){ i = total - 1; render(); }
    else if(m){ i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    setTimeout(layout, 250);                              // re-measure after fonts settle
  });
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(layout); }
  Array.prototype.forEach.call(document.images, function(im){
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });
  layout();

  // Late DOM changes (book-progress.js unhiding the resume link, an image
  // slot flipping to its placeholder, a widget readout) can add or remove a
  // column after the first measure. Re-measure only when the content's right
  // edge actually moved — so our own style writes can never loop.
  var lastRight = -1, pend = false;
  function recheck(){
    pend = false;
    if(mobile()) return;
    var r = Math.round(contentRight());
    if(r !== lastRight){ lastRight = r; layout(); }
  }
  if(window.MutationObserver){
    new MutationObserver(function(muts){
      for(var k = 0; k < muts.length; k++){
        if(muts[k].target !== leaf){ if(!pend){ pend = true; requestAnimationFrame(recheck); } return; }
      }
    }).observe(leaf, { subtree:true, childList:true, attributes:true, attributeFilter:['hidden','class','open'] });
  }

  // Plain-browser keys; the app handles keys itself (sets __bookbankNav).
  document.addEventListener('keydown', function(e){
    if(window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    var tg = e.target;
    if(tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    if(e.key === 'ArrowRight'){ bookbankPager.next(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ bookbankPager.prev(); e.preventDefault(); }
    else if(e.key === 'ArrowUp'){ bookbankPager.home(); e.preventDefault(); }
  });

  // REQUIRED: visible Next/Prev clicks go through the pager so a chapter's
  // remaining spreads are never skipped.
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if(!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });

  // Image-slot "Copy prompt" in a plain browser (the app injects its own too).
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.img-copy');
    if(!b || window.__bookbankNav) return;
    var p = b.closest('.img-drop-inner'); p = p && p.querySelector('.img-prompt');
    if(p && navigator.clipboard){ navigator.clipboard.writeText(p.textContent.trim()).catch(function(){}); }
  });
})();
