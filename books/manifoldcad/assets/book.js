/* ManifoldCAD book — self-contained: a tiny JavaScript highlighter + the
   BookBank pager. No CDNs; runs from file://. Highlight first, then lay out
   the open-book spread. */
(function () {
  /* ---------- minimal JavaScript / TypeScript highlighter ---------- */
  var KW = /^(const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|this|import|from|export|default|typeof|instanceof|void|delete|break|continue|switch|case|try|catch|throw|await|async|yield|true|false|null|undefined)$/;

  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function highlight(code) {
    var out = '', i = 0, n = code.length;
    function emit(cls, txt){ out += '<span class="'+cls+'">'+esc(txt)+'</span>'; }
    while (i < n) {
      var c = code[i], c2 = code[i+1];
      // line comment
      if (c === '/' && c2 === '/') {
        var j = code.indexOf('\n', i); if (j < 0) j = n; emit('tok-com', code.slice(i, j)); i = j; continue;
      }
      // block comment
      if (c === '/' && c2 === '*') {
        var jb = code.indexOf('*/', i); jb = jb < 0 ? n : jb + 2; emit('tok-com', code.slice(i, jb)); i = jb; continue;
      }
      // strings: ' " `
      if (c === '"' || c === "'" || c === '`') {
        var q = c, k = i + 1;
        while (k < n && code[k] !== q) { if (code[k] === '\\') k++; k++; }
        k = Math.min(k + 1, n); emit('tok-str', code.slice(i, k)); i = k; continue;
      }
      // numbers
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(c2 || ''))) {
        var nm = i; while (nm < n && /[0-9xXeE.a-fA-F_]/.test(code[nm])) nm++;
        emit('tok-num', code.slice(i, nm)); i = nm; continue;
      }
      // property access: .name
      if (c === '.' && /[A-Za-z_$]/.test(c2 || '')) {
        var p = i + 1; while (p < n && /[A-Za-z0-9_$]/.test(code[p])) p++;
        out += '.'; emit(code[p] === '(' ? 'tok-fn' : 'tok-prop', code.slice(i + 1, p)); i = p; continue;
      }
      // identifiers / words
      if (/[A-Za-z_$]/.test(c)) {
        var w = i; while (w < n && /[A-Za-z0-9_$]/.test(code[w])) w++;
        var word = code.slice(i, w);
        if (KW.test(word))            emit('tok-kw', word);
        else if (/^[A-Z]/.test(word)) emit('tok-mod', word);          // Manifold, CrossSection, GLTFNode, Math…
        else if (code[w] === '(')     emit('tok-fn', word);           // bare call: cube(), union()
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
      btn.addEventListener('click', function () {
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

  function layout() {
    if (!leaf || !vp) return;
    var W = vp.clientWidth, gap = Math.round(W * 0.07), colW = (W - gap) / 2;
    leaf.style.columnGap = gap + 'px';
    leaf.style.columnWidth = colW + 'px';
    spread = 2 * (colW + gap);
    var cols = Math.max(1, Math.round((leaf.scrollWidth + gap) / (colW + gap)));
    total = Math.max(1, Math.ceil(cols / 2));
    i = Math.min(i, total - 1);
    render();
  }
  function render() {
    if (!leaf) return;
    leaf.style.transform = 'translateX(' + (-i * spread) + 'px)';
    var nEl = document.querySelector('.book-pageno');
    if (nEl) nEl.textContent = (i + 1) + ' / ' + total;
  }
  function href(rel) { var a = document.querySelector('a[rel~="' + rel + '"]'); return a && a.href; }

  window.bookbankPager = {
    next: function () { if (i < total - 1) { i++; render(); } else { var h = href('next'); if (h) location.href = h; } },
    prev: function () { if (i > 0) { i--; render(); } else { var h = href('prev'); if (h) location.href = h + '#last'; } },
    home: function () { var h = href('home'); if (h) location.href = h; }
  };

  window.addEventListener('resize', layout);

  function boot() {
    highlightAll();
    wireCopy();
    layout();
    if (location.hash === '#last') { i = total - 1; render(); }
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('load', boot);

  // Plain-browser keyboard support; defer to the host app when it drives nav.
  document.addEventListener('keydown', function (e) {
    if (window.__bookbankNav || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { bookbankPager.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { bookbankPager.prev(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { bookbankPager.home(); e.preventDefault(); }
  });

  // Route the visible Next/Prev links through the pager so a click turns the
  // spread instead of skipping the rest of the chapter (the pager itself
  // follows the link once the last/first spread is reached).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[rel~="next"],a[rel~="prev"]');
    if (!a) return;
    e.preventDefault();
    var rel = a.getAttribute('rel') || '';
    bookbankPager[rel.indexOf('next') >= 0 ? 'next' : 'prev']();
  });
})();
