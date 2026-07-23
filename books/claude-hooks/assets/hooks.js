/* Small, self-contained book extras for Claude Hooks.
   1) "Copy prompt" buttons on image slots.
   2) A tiny exit-code / decision simulator (chapter 05).
   No network, no dependencies. */
(function(){
  // ---- copy-prompt on image slots ----
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.img-copy');
    if(!b) return;
    var p = b.parentNode.querySelector('.img-prompt');
    if(!p) return;
    if(navigator.clipboard) navigator.clipboard.writeText(p.textContent.trim());
    var old = b.textContent; b.textContent = 'Copied';
    setTimeout(function(){ b.textContent = old; }, 1200);
  });

  // ---- exit-code simulator ----
  // For each .sim[data-sim="exit"], the buttons carry data-exit + data-event
  // and we describe what Claude Code does with that result.
  var VERBS = {
    PreToolUse: {
      '0': ['calm', 'Tool call proceeds. If stdout was JSON, its permissionDecision is applied.'],
      '2': ['fire', 'Tool call is BLOCKED. stderr is fed back to Claude as the reason.'],
      'n': ['warn', 'Non-blocking error: stderr shown, the tool call still runs.']
    },
    PostToolUse: {
      '0': ['calm', 'Nothing to block — the tool already ran. JSON may inject context.'],
      '2': ['fire', 'stderr is surfaced to Claude (the edit stands; you can’t un-ring the bell).'],
      'n': ['warn', 'Non-blocking error: stderr shown to the user only.']
    },
    Stop: {
      '0': ['calm', 'Claude is allowed to stop. The turn ends.'],
      '2': ['fire', 'Stop is BLOCKED — Claude keeps going, using stderr as its next instruction.'],
      'n': ['warn', 'Non-blocking error: stderr shown, Claude still stops.']
    },
    UserPromptSubmit: {
      '0': ['calm', 'Prompt proceeds. stdout (or additionalContext) is added to the context.'],
      '2': ['fire', 'Prompt is BLOCKED and erased; stderr is shown to you instead.'],
      'n': ['warn', 'Non-blocking error: stderr shown, the prompt still runs.']
    }
  };
  document.querySelectorAll('.sim[data-sim="exit"]').forEach(function(sim){
    var out = sim.querySelector('.readout');
    var ev  = sim.getAttribute('data-event') || 'PreToolUse';
    function show(code){
      var row = (VERBS[ev] || VERBS.PreToolUse)[code];
      if(!row){ return; }
      var cls = row[0] === 'fire' ? '' : (row[0] === 'calm' ? 'ok' : '');
      var label = code === 'n' ? 'exit 1 (any other)' : 'exit ' + code;
      out.innerHTML = '<b>' + ev + '</b> · ' + label + ' → ' +
        '<span class="' + cls + '">' + row[1] + '</span>';
    }
    sim.querySelectorAll('button[data-exit]').forEach(function(btn){
      btn.addEventListener('click', function(){ show(btn.getAttribute('data-exit')); });
    });
    show('2'); // default: show the interesting one
  });
})();
