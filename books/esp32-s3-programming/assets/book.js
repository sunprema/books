// Tiny, self-contained niceties. The BookBank app injects the real
// image-slot drag/drop + copy wiring; this is just a graceful fallback
// so "Copy prompt" also works when the book is opened in a plain browser.
document.addEventListener("click", function (e) {
  var btn = e.target.closest && e.target.closest(".img-copy");
  if (!btn) return;
  var slot = btn.closest(".img-slot");
  var prompt = slot && slot.querySelector(".img-prompt");
  if (!prompt || !navigator.clipboard) return;
  navigator.clipboard.writeText(prompt.textContent.trim()).then(function () {
    var old = btn.textContent;
    btn.textContent = "Copied ✓";
    setTimeout(function () { btn.textContent = old; }, 1400);
  });
});
