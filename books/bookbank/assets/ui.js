/* Tiny, optional UI helpers for BookBank's "BookBank" book.
   - Copy-to-clipboard for image-slot prompts and starter prompt-cards.
   Self-contained, no network. Safe to no-op in the app's WebView. */
(function(){
  function flash(btn, msg){
    var old = btn.textContent; btn.textContent = msg;
    setTimeout(function(){ btn.textContent = old; }, 1200);
  }
  function copy(text, btn){
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(function(){ flash(btn, 'Copied ✓'); },
                                                  function(){ flash(btn, 'Press ⌘C'); });
        return;
      }
    }catch(e){}
    flash(btn, 'Select & copy');
  }
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.img-copy, .pc-copy');
    if(!b) return;
    e.preventDefault();
    var src;
    if(b.classList.contains('img-copy')){
      var slot = b.closest('.img-slot');
      src = slot && slot.querySelector('.img-prompt');
    } else {
      var card = b.closest('.prompt-card');
      src = card && card.querySelector('.pc-copytext, .pc-body');
    }
    if(src) copy(src.textContent.trim(), b);
  });
})();
