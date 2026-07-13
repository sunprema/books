/* Shared interactive widgets for the Tauri book. Self-contained; works from
   file://. Every concept page includes this after book.js and reuses these
   three behaviors as-is — do not fork per page.

   1. Schematic trace-flow — figures with class "schematic" draw the
      frontend <-> Rust-core boundary with animated command/event traces
      (see .schematic / .trace in book.css). This wakes the animation only
      while the figure is on screen, and freezes it entirely under
      prefers-reduced-motion.
   2. Compare toggle — ".compare" blocks with a ".compare-toggle" button
      pair and two ".compare-panel"s (e.g. Electron vs Tauri, Command vs
      Event, Plugin vs Sidecar). Click a button to swap panels.
   3. Copy-to-clipboard — any button with [data-copy-target] copies the
      text of the element it points to (an agent-ask prompt, a snippet).
      data-copy-target="_prev" copies the previous sibling's text; anything
      else is treated as a CSS selector.
*/
(function(){
  // ---- 1. schematic trace-flow ----
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var schematics = document.querySelectorAll('.schematic');
  if(schematics.length){
    if(reduceMotion || !('IntersectionObserver' in window)){
      // No animation available/wanted: leave traces static (book.css already
      // renders them with stroke-dashoffset:0 when .is-live is absent).
    } else {
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          entry.target.classList.toggle('is-live', entry.isIntersecting);
        });
      }, { threshold: 0.35 });
      schematics.forEach(function(s){ io.observe(s); });
    }
  }

  // ---- 2. compare toggle ----
  document.querySelectorAll('.compare').forEach(function(c){
    var buttons = c.querySelectorAll('.compare-toggle button');
    var panels = c.querySelectorAll('.compare-panel');
    buttons.forEach(function(btn, idx){
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
      btn.addEventListener('click', function(){
        buttons.forEach(function(b){ b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        panels.forEach(function(p){ p.classList.remove('active'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        if(panels[idx]) panels[idx].classList.add('active');
      });
    });
    // If nothing was marked active in the markup, default to the first pair.
    if(!c.querySelector('.compare-toggle button.active') && buttons[0]){ buttons[0].click(); }
  });

  // ---- 3. copy-to-clipboard ----
  document.querySelectorAll('[data-copy-target]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sel = btn.getAttribute('data-copy-target');
      var el = sel === '_prev' ? btn.previousElementSibling : document.querySelector(sel);
      if(!el) return;
      var text = el.textContent.trim();
      var flash = function(){
        var old = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function(){ btn.textContent = old; }, 1400);
      };
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(flash, flash);
      } else {
        flash();
      }
    });
  });
})();
