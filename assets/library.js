// Client-side search + voice filter for the shelf. No dependencies.
(function () {
  var q = document.getElementById('q');
  var grid = document.getElementById('grid');
  var empty = document.getElementById('empty');
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var voice = '';

  function apply() {
    var term = (q.value || '').trim().toLowerCase();
    var shown = 0;
    cards.forEach(function (c) {
      var okText = !term || c.getAttribute('data-search').indexOf(term) !== -1;
      var okVoice = !voice || c.getAttribute('data-voice') === voice;
      var show = okText && okVoice;
      c.style.display = show ? '' : 'none';
      if (show) shown++;
    });
    if (empty) empty.hidden = shown !== 0;
  }

  q && q.addEventListener('input', apply);
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      voice = chip.getAttribute('data-voice') || '';
      apply();
    });
  });

  // PWA: register the service worker (resolves to <site>/sw.js under the
  // shelf's own path, so the scope covers the whole library incl. books/).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
