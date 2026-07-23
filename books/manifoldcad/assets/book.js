/* ManifoldCAD book — self-contained: a tiny JavaScript highlighter + the
   BookBank open-book pager. No CDNs; runs from file://. Highlight and wire the
   copy buttons first, then lay out the two-page spread and keep re-measuring
   until fonts + images settle so the column count is right. */
(function () {
  /* ---------- minimal JavaScript / TypeScript highlighter ---------- */
  var KW = /^(const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|this|import|from|export|default|typeof|instanceof|void|delete|break|continue|switch|case|try|catch|throw|await|async|yield|true|false|null|undefined)$/;

  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function highlight(code) {
    var out = '', i = 0, n = code.length;
    function emit(cls, txt){ out += '<span class="'+cls+'">'+esc(txt)+'</span>'; }
    while (i < n) {
      var c = code[i], c2 = code[i+1];
      if (c === '/' && c2 === '/') {
        var j = code.indexOf('\n', i); if (j < 0) j = n; emit('tok-com', code.slice(i, j)); i = j; continue;
      }
      if (c === '/' && c2 === '*') {
        var jb = code.indexOf('*/', i); jb = jb < 0 ? n : jb + 2; emit('tok-com', code.slice(i, jb)); i = jb; continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        var q = c, k = i + 1;
        while (k < n && code[k] !== q) { if (code[k] === '\\') k++; k++; }
        k = Math.min(k + 1, n); emit('tok-str', code.slice(i, k)); i = k; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 || ''))) {
        var nm = i; while (nm < n && /[0-9xXeE.a-fA-F_]/.test(code[nm])) nm++;
        emit('tok-num', code.slice(i, nm)); i = nm; continue;
      }
      if (c === '.' && /[A-Za-z_$]/.test(c2 || '')) {
        var p = i + 1; while (p < n && /[A-Za-z0-9_$]/.test(code[p])) p++;
        out += '.'; emit(code[p] === '(' ? 'tok-fn' : 'tok-prop', code.slice(i + 1, p)); i = p; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        var w = i; while (w < n && /[A-Za-z0-9_$]/.test(code[w])) w++;
        var word = code.slice(i, w);
        if (KW.test(word))            emit('tok-kw', word);
        else if (/^[A-Z]/.test(word)) emit('tok-mod', word);
        else if (code[w] === '(')     emit('tok-fn', word);
        else                          out += esc(word);
        i = w; continue;
      }
      out += esc(c); i++;
    }
    return out;
  }

  function highlightAll() {
    var blocks = document.querySelectorAll('pre code.js');
    for (var b = 0; b < blocks.length; b++) {
      blocks[b].innerHTML = highlight(blocks[b].textContent);
    }
  }

  /* ---------- copy-prompt buttons for image slots ---------- */
  function wireCopy() {
    document.querySelectorAll('.img-copy').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var p = btn.closest('.img-drop-inner').querySelector('.img-prompt');
        if (p && navigator.clipboard) navigator.clipboard.writeText(p.textContent.trim());
        btn.textContent = 'Copied ✓';
        setTimeout(function () { btn.textContent = 'Copy prompt'; }, 1500);
      });
    });
  }

  /* ---------- the open-book pager (BookBank house mechanics) ---------- */
  var leaf = document.querySelector('.book-leaf');
  var vp   = document.querySelector('.book-viewport');
  var i = 0, total = 1, spread = 1;

  // Below this width we drop the spread and let the page scroll normally — two
  // columns get unreadably narrow on a phone. Matches the CSS breakpoint.
  function mobile(){ return !window.matchMedia('(min-width: 901px)').matches; }

  // Rightmost content edge relative to the leaf's left edge, measured from the
  // children's bounding rects (engine-proof; scrollWidth is unreliable under
  // CSS multicolumn). translateX shifts every rect equally, so the difference
  // from the leaf's own left is invariant while flipped or animating.
  function contentRight(){
    // Measure from the content-box left edge (past border + left padding) so the
    // returned distance is column-aligned with the colW/gap math in layout().
    var cs = getComputedStyle(leaf);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var base = leaf.getBoundingClientRect().left + leaf.clientLeft + padL;
    var right = 0, kids = leaf.children;
    for (var k = 0; k < kids.length; k++){
      var r = kids[k].getBoundingClientRect().right - base;
      if (r > right) right = r;
    }
    return right;
  }

  function layout() {
    if (!leaf || !vp) return;
    if (mobile()) {
      // Natural document flow takes over via the CSS breakpoint — clear any
      // inline column/transform styles a wider layout() left behind.
      leaf.style.columnGap = ''; leaf.style.columnWidth = ''; leaf.style.transform = '';
      total = 1; i = 0;
      var n0 = document.querySelector('.book-pageno');
      if (n0) n0.textContent = '';
      return;
    }
    // Columns are laid inside the leaf's CONTENT box, which is narrower than the
    // viewport because the leaf has horizontal padding. Basing colW on the
    // viewport width makes two columns too wide to fit, so the browser collapses
    // to a single full-width column. Measure the content box directly.
    var cs = getComputedStyle(leaf);
    var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
    var cw = leaf.clientWidth - padL - padR;
    var gap = Math.round(cw * 0.06), colW = (cw - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.ceil((contentRight() - 1) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
  }
  function render() {
    if (!leaf) return;
    if (mobile()) { leaf.style.transform = ''; return; }
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var nEl = document.querySelector('.book-pageno');
    if (nEl) nEl.textContent = (i + 1) + ' / ' + total;
  }
  function href(rel) { var a = document.querySelector('a[rel~="' + rel + '"]'); return a && a.getAttribute('href'); }

  window.bookbankPager = {
    next: function () { if (i < total - 1) { i++; render(); } else { var h = href('next'); if (h) location.href = h; } },
    prev: function () { if (i > 0) { i--; render(); } else { var h = href('prev'); if (h) location.href = h + '#last'; } },
    home: function () { var h = href('home'); if (h) location.href = h; }
  };

  window.addEventListener('resize', layout);

  function applyHash(){
    if (mobile()) return;
    var m = /^#s(\d+)$/.exec(location.hash);
    if (location.hash === '#last') { i = total - 1; render(); }
    else if (m) { i = Math.min(parseInt(m[1], 10) - 1, total - 1); render(); }
  }

  function boot() {
    highlightAll();
    wireCopy();
    layout();
    applyHash();
    // Re-measure once fonts have settled — the very bug this replaces: a single
    // early layout() locks in a wrong column count when text is still reflowing.
    setTimeout(function(){ layout(); applyHash(); }, 250);
    setTimeout(function(){ layout(); applyHash(); }, 700);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('load', boot);

  // Images popping in or erroring (image-slot placeholders) reflow the columns.
  Array.prototype.forEach.call(document.images, function (im) {
    im.addEventListener('load', function(){ layout(); applyHash(); });
    im.addEventListener('error', function(){ layout(); applyHash(); });
  });

  // Plain-browser keyboard support; defer to the host app when it drives nav.
  document.addEventListener('keydown', function (e) {
    if (window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { bookbankPager.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { bookbankPager.prev(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { bookbankPager.home(); e.preventDefault(); }
  });

  // Route the visible Next/Prev links through the pager so a click turns the
  // spread instead of skipping the rest of the chapter (the pager follows the
  // link itself once the last/first spread is reached).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if (!a) return;
    if (mobile()) return;                 // let the link navigate normally on phones
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });
})();
