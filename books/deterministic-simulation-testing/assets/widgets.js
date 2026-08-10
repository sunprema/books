/* Deterministic Simulation Testing — book-specific canvas widgets.
   Runs on top of the vendored assets/vendor/book-widgets.js runtime
   (BookWidgets.register(name, init) — see that file's header for the API).

   replay-strip: the same seed always draws the same event trace; a fresh
   seed draws a different (but equally exact) one. The only place this
   widget touches Math.random() is the "new seed" button — picking *which*
   seed to explore is the one deliberately uncontrolled choice; everything
   downstream of that choice runs through W.rng(seed), so it is exactly
   reproducible from then on. */
BookWidgets.register('replay-strip', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var p = W.params(box);
  var C = W.theme();
  var seedInput = box.querySelector('.seed-input');
  var readout = box.querySelector('.readout');
  var seed = p.seed || 4242;

  var KINDS = [
    { k: 'op',    label: 'op',      w: 0.60 },
    { k: 'net',   label: 'network', w: 0.16 },
    { k: 'disk',  label: 'disk',    w: 0.12 },
    { k: 'clock', label: 'clock',   w: 0.06 },
    { k: 'crash', label: 'crash',   w: 0.06 }
  ];
  function pick(roll){
    var x = roll(), acc = 0, i;
    for(i = 0; i < KINDS.length; i++){
      acc += KINDS[i].w;
      if(x <= acc) return KINDS[i];
    }
    return KINDS[0];
  }
  function trace(s){
    var roll = W.rng(s), t = 0, out = [], n = 13, i;
    for(i = 0; i < n; i++){
      t += 0.35 + roll() * 1.25;
      out.push({ t: t, kind: pick(roll) });
    }
    return out;
  }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    var pts = trace(seed);
    var maxT = pts[pts.length - 1].t;
    var midY = h * 0.58, padX = 20;

    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, midY); ctx.lineTo(w - padX, midY); ctx.stroke();

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('seed ' + seed, padX, 16);

    var faults = 0;
    pts.forEach(function(pt){
      var x = padX + (pt.t / maxT) * (w - 2 * padX);
      var isFault = pt.kind.k !== 'op';
      if(isFault) faults++;
      ctx.beginPath();
      ctx.arc(x, midY, isFault ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isFault ? C.accent : C.ink;
      ctx.globalAlpha = isFault ? 1 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      if(isFault){
        ctx.fillStyle = C.soft;
        ctx.font = '9px "SF Mono",Menlo,Consolas,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(pt.kind.label, x, midY - 12);
        ctx.textAlign = 'left';
      }
    });

    if(readout){
      readout.textContent = pts.length + ' events, ' + faults + ' faults injected — ' +
        'replay this exact seed and the dots above will not move a single pixel.';
    }
  }

  var replayBtn = box.querySelector('.replay');
  var reseedBtn = box.querySelector('.reseed');
  if(seedInput) seedInput.addEventListener('change', function(){
    var v = parseInt(seedInput.value, 10);
    if(isFinite(v)){ seed = v; draw(); }
  });
  if(replayBtn) replayBtn.addEventListener('click', draw);
  if(reseedBtn) reseedBtn.addEventListener('click', function(){
    seed = Math.floor(Math.random() * 1000000);
    if(seedInput) seedInput.value = seed;
    draw();
  });

  W.onRelayout(draw);
  draw();
});
