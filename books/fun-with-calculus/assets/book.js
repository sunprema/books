/* Two-page-spread pager for BookBank. Self-contained; works from file://.
   Exposes window.bookbankPager {next,prev,home}. The app binds → ← ↑ to it. */
(function(){
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  if(!leaf || !vp) return;
  var i = 0, total = 1, spread = 1;
  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }
  function contentRight(){
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
      window.dispatchEvent(new CustomEvent('bookbank:relayout'));
      return;
    }
    // Available inline space is the leaf's CONTENT box — subtract its own
    // horizontal padding, or two columns won't fit and Chrome collapses to one.
    var cs = getComputedStyle(leaf);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var W = vp.clientWidth - padX, gap = Math.round(W * 0.08), colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
  }
  function render(){
    if(mobile()) return;
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var n = document.querySelector('.book-pageno');
    if(n) n.textContent = (i + 1) + ' / ' + total;
    window.dispatchEvent(new CustomEvent('bookbank:relayout'));
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
    var m = /^#s(\d+)$/.exec(location.hash);
    if(location.hash === '#last'){ i = total-1; render(); }
    else if(m){ i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
    setTimeout(layout, 250);
  });
  Array.prototype.forEach.call(document.images, function(im){
    im.addEventListener('load', layout);
    im.addEventListener('error', layout);
  });
  layout();
  document.addEventListener('keydown', function(e){
    if(window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if(e.key === 'ArrowRight'){ bookbankPager.next(); e.preventDefault(); }
    else if(e.key === 'ArrowLeft'){ bookbankPager.prev(); e.preventDefault(); }
    else if(e.key === 'ArrowUp'){ bookbankPager.home(); e.preventDefault(); }
  });
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if(!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });
})();
