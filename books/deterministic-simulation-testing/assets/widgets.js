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

/* adapter-swap: the core box never changes; only the four adapters wired
   into its ports do. Static (no animation) — draws once per mode switch,
   which is itself the point: nothing about the core is in motion. */
BookWidgets.register('adapter-swap', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var C = W.theme();
  var readout = box.querySelector('.readout');
  var mode = 'production';

  var PORTS = ['Clock', 'Random', 'Network', 'Storage'];
  var ADAPTERS = {
    production: ['RealClock', 'OsRandom', 'TcpNetwork', 'DiskStorage'],
    simulation: ['SimClock', 'SeededRandom(seed)', 'SimNetwork(seed)', 'SimStorage(seed)']
  };

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    var rowH = h / (PORTS.length + 1), coreW = w * 0.22, coreX = w * 0.5 - coreW / 2;
    var portX = w * 0.06, portW = w * 0.2;
    var adapterX = w * 0.76, adapterW = w * 0.2;

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.ink;
    ctx.fillText('wiring: ' + mode, 10, 16);

    ctx.fillStyle = C.ink;
    ctx.fillRect(coreX, rowH * 0.5, coreW, rowH * PORTS.length);
    ctx.fillStyle = C.paper;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "SF Mono",Menlo,Consolas,monospace';
    ctx.save();
    ctx.translate(coreX + coreW / 2, rowH * 0.5 + rowH * PORTS.length / 2);
    ctx.fillText('CORE', 0, 4);
    ctx.restore();

    var adapters = ADAPTERS[mode];
    var accent = mode === 'simulation' ? C.accent : C.soft;

    PORTS.forEach(function(port, i){
      var y = rowH * (i + 1);

      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.fillStyle = C.grid;
      ctx.fillRect(portX, y - 10, portW, 20);
      ctx.fillStyle = C.ink;
      ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
      ctx.textAlign = 'left';
      ctx.fillText(port + ' port', portX + 8, y + 4);

      ctx.beginPath();
      ctx.moveTo(portX + portW, y);
      ctx.lineTo(coreX, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(coreX + coreW, y);
      ctx.lineTo(adapterX, y);
      ctx.strokeStyle = accent;
      ctx.lineWidth = mode === 'simulation' ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(adapterX, y - 10, adapterW, 20);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = accent; ctx.lineWidth = 1;
      ctx.strokeRect(adapterX, y - 10, adapterW, 20);
      ctx.fillStyle = accent;
      ctx.font = '10px "SF Mono",Menlo,Consolas,monospace';
      ctx.textAlign = 'left';
      ctx.fillText(adapters[i], adapterX + 6, y + 4);
    });

    if(readout){
      readout.textContent = mode === 'production'
        ? 'Production wiring: real adapters, real entropy, not replayable.'
        : 'Simulation wiring: every adapter’s decisions are drawn from one seed — same core, replayable run.';
    }
  }

  var buttons = box.querySelectorAll('.wire');
  Array.prototype.forEach.call(buttons, function(btn){
    btn.addEventListener('click', function(){
      mode = btn.getAttribute('data-mode') === 'simulation' ? 'simulation' : 'production';
      draw();
    });
  });

  W.onRelayout(draw);
  draw();
});

/* event-queue: the engine room itself. A timestamp-ordered priority queue
   drains one event at a time; "Step" always pops the earliest entry, jumps
   the clock straight to it (never sleeps), and — deterministically, from
   the same seed — may push zero, one, or two new events as that handler's
   effects. Same seed pressed the same number of times produces the exact
   same sequence of pops, in the exact same order, every time. */
BookWidgets.register('event-queue', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var p = W.params(box);
  var C = W.theme();
  var seedInput = box.querySelector('.seed-input');
  var readout = box.querySelector('.readout');
  var seed = p.seed || 90210;

  var KINDS = [
    { k: 'net',   label: 'network deliver', spawns: [0, 1] },
    { k: 'disk',  label: 'disk op done',     spawns: [0, 1] },
    { k: 'timer', label: 'lease/deadline',   spawns: [0, 1, 1] },
    { k: 'wake',  label: 'actor wakes',      spawns: [0, 0, 1] }
  ];

  var roll, clock, queue, popped, seq;

  function reset(s){
    seed = s;
    roll = W.rng(seed);
    clock = 0;
    queue = [];
    popped = 0;
    seq = 0;
    for(var i = 0; i < 6; i++) push(roll() * 4);
  }

  function push(dt){
    var kind = KINDS[Math.floor(roll() * KINDS.length) % KINDS.length];
    seq++;
    queue.push({ t: clock + 0.3 + dt, kind: kind, id: seq });
    queue.sort(function(a, b){ return a.t - b.t; });
    if(queue.length > 9) queue.length = 9;
  }

  function step(){
    if(!queue.length) return;
    var ev = queue.shift();
    clock = ev.t;
    popped++;
    var spawns = ev.kind.spawns;
    var n = spawns[Math.floor(roll() * spawns.length) % spawns.length];
    for(var i = 0; i < n; i++) push(roll() * 3);
    draw();
  }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('seed ' + seed + '  ·  ' + popped + ' popped', 12, 16);
    ctx.font = 'bold 15px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.accent;
    ctx.fillText('clock = ' + clock.toFixed(2), 12, 36);

    var top = 52, rowH = Math.max(16, Math.min(24, (h - top - 8) / Math.max(1, queue.length)));
    var maxT = queue.length ? queue[queue.length - 1].t : 1;
    var barX = 90, barW = w - barX - 70;

    queue.forEach(function(ev, i){
      var y = top + i * rowH;
      var frac = maxT > 0 ? (ev.t - clock) / (maxT - clock + 0.0001) : 0;
      var bw = Math.max(3, frac * barW);

      ctx.font = '10px "SF Mono",Menlo,Consolas,monospace';
      ctx.fillStyle = i === 0 ? C.accent : C.soft;
      ctx.textAlign = 'right';
      ctx.fillText('t=' + ev.t.toFixed(2), barX - 8, y + rowH * 0.65);

      ctx.fillStyle = i === 0 ? C.accent : C.grid;
      ctx.globalAlpha = i === 0 ? 1 : 0.55;
      ctx.fillRect(barX, y + 3, bw, rowH - 8);
      ctx.globalAlpha = 1;

      ctx.fillStyle = i === 0 ? C.paper : C.ink;
      ctx.textAlign = 'left';
      ctx.fillText(ev.kind.label, barX + 6, y + rowH * 0.65);
    });

    if(readout){
      readout.textContent = queue.length
        ? 'next: ' + queue[0].kind.label + ' at t=' + queue[0].t.toFixed(2) +
          ' — press Step to pop it (the clock will jump straight there)'
        : 'queue empty — press Replay to refill from this seed';
    }
  }

  var stepBtn = box.querySelector('.step');
  var replayBtn = box.querySelector('.replay');
  var reseedBtn = box.querySelector('.reseed');
  if(seedInput) seedInput.addEventListener('change', function(){
    var v = parseInt(seedInput.value, 10);
    if(isFinite(v)){ reset(v); draw(); }
  });
  if(stepBtn) stepBtn.addEventListener('click', step);
  if(replayBtn) replayBtn.addEventListener('click', function(){ reset(seed); draw(); });
  if(reseedBtn) reseedBtn.addEventListener('click', function(){
    var v = Math.floor(Math.random() * 1000000);
    if(seedInput) seedInput.value = v;
    reset(v);
    draw();
  });

  reset(seed);
  W.onRelayout(draw);
  draw();
});

/* swarm-sampler: each "Roll new run" draws one combination of five
   independent swarm dimensions (topology, replication, storage engine,
   workload mix, fault profile) from a seed -- exactly like FoundationDB's
   SimulatedCluster picking a random topology/replication/storage engine
   per run. "Replay same seed" redraws the identical combination; only the
   "Roll new run" button touches real randomness (picking which seed to
   explore next), same convention as replay-strip. A small coverage grid
   accumulates which combinations have been visited this session, making
   swarm testing's "many different slices, each one reproducible" claim
   visible rather than asserted. */
BookWidgets.register('swarm-sampler', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var p = W.params(box);
  var C = W.theme();
  var seedInput = box.querySelector('.seed-input');
  var readout = box.querySelector('.readout');
  var seed = p.seed || 4104;

  var DIMS = [
    { label: 'topology',   opts: ['1 DC', '3 DC', '5 DC'] },
    { label: 'replication', opts: ['single', 'double', 'triple'] },
    { label: 'storage',    opts: ['memory', 'ssd', 'redwood'] },
    { label: 'workload',   opts: ['transfer', 'queue', 'mixed'] },
    { label: 'faults',     opts: ['calm', 'lossy', 'chaotic'] }
  ];

  var visited = {};
  var combo;

  function draw_combo(s){
    var roll = W.rng(s);
    return DIMS.map(function(d){
      return d.opts[Math.floor(roll() * d.opts.length) % d.opts.length];
    });
  }

  function reset(s){
    seed = s;
    combo = draw_combo(seed);
    visited[combo.join('|')] = true;
  }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('seed ' + seed, 12, 16);

    var dialW = (w * 0.62 - 12) / DIMS.length, dialX0 = 8, top = 34, dialH = h - top - 26;
    DIMS.forEach(function(d, i){
      var x = dialX0 + i * dialW;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.strokeRect(x, top, dialW - 8, dialH);
      ctx.fillStyle = C.soft;
      ctx.font = '9px "SF Mono",Menlo,Consolas,monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + (dialW - 8) / 2, top + 14);
      ctx.fillStyle = C.accent;
      ctx.font = 'bold 10px "SF Mono",Menlo,Consolas,monospace';
      var val = combo[i];
      ctx.fillText(val, x + (dialW - 8) / 2, top + dialH / 2 + 4);
    });

    var gridX0 = w * 0.68, gridTop = 30, cell = Math.max(5, Math.min(9, (w - gridX0 - 10) / 27));
    ctx.font = '9px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('coverage', gridX0, 18);
    var cols = Math.max(6, Math.floor((w - gridX0 - 10) / (cell + 2)));
    var keys = Object.keys(visited);
    keys.forEach(function(k, i){
      var cx = gridX0 + (i % cols) * (cell + 2);
      var cy = gridTop + Math.floor(i / cols) * (cell + 2);
      if(cy + cell > h - 6) return;
      ctx.fillStyle = k === combo.join('|') ? C.accent : C.soft;
      ctx.fillRect(cx, cy, cell, cell);
    });

    if(readout){
      readout.textContent = combo.join(' · ') + '  —  ' + keys.length +
        ' distinct combination' + (keys.length === 1 ? '' : 's') + ' visited this session';
    }
  }

  var replayBtn = box.querySelector('.replay');
  var reseedBtn = box.querySelector('.reseed');
  if(seedInput) seedInput.addEventListener('change', function(){
    var v = parseInt(seedInput.value, 10);
    if(isFinite(v)){ reset(v); draw(); }
  });
  if(replayBtn) replayBtn.addEventListener('click', function(){ reset(seed); draw(); });
  if(reseedBtn) reseedBtn.addEventListener('click', function(){
    var v = Math.floor(Math.random() * 1000000);
    if(seedInput) seedInput.value = v;
    reset(v);
    draw();
  });

  reset(seed);
  W.onRelayout(draw);
  draw();
});

/* history-checker: a miniature linearizability checker, run for real in the
   browser rather than just described. Generates a history of 5 concurrent
   client operations on one register from a seed; each op gets a real-time
   interval [start,end] and a linearization point drawn inside that interval,
   which -- by construction -- makes the *raw* generated history always
   linearizable (the whole trick behind "seed everything"). With some
   probability, one read's observed value is then corrupted to a value no
   write ever wrote, which -- also by construction -- makes it provably NOT
   linearizable. "Check history" brute-forces every real-time-consistent
   permutation looking for one legal sequential order that reproduces every
   read; this is the same shape Knossos-style checkers use (see the chapter's
   pseudocode), just small enough to run instantly on 5 operations. The point
   of the widget is the gap between the raw timeline (which looks the same
   either way to the eye) and the verdict (which requires actually running
   the search) -- eyeballing a history is not an oracle; the search is. */
BookWidgets.register('history-checker', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var p = W.params(box);
  var C = W.theme();
  var C2 = W.colors({ good: '--en|#2f6f4f', bad: '--accent-2|#944118' });
  var seedInput = box.querySelector('.seed-input');
  var readout = box.querySelector('.readout');
  var checkBtn = box.querySelector('.check');
  var seed = p.seed || 7331;
  var N = 5;
  var ops, verdict, culprit, witness;

  function permutations(arr){
    if(arr.length <= 1) return [arr];
    var out = [];
    for(var i = 0; i < arr.length; i++){
      var rest = arr.slice(0, i).concat(arr.slice(i + 1));
      var subs = permutations(rest);
      for(var j = 0; j < subs.length; j++) out.push([arr[i]].concat(subs[j]));
    }
    return out;
  }
  var ALL_PERMS = permutations([0, 1, 2, 3, 4]);

  function realTimeConsistent(perm){
    for(var a = 0; a < perm.length; a++){
      for(var b = a + 1; b < perm.length; b++){
        var oa = ops[perm[a]], ob = ops[perm[b]];
        if(oa.end < ob.start) continue;   // fine, a really is before b
        if(ob.end < oa.start) return false; // b must be before a -- wrong order
      }
    }
    return true;
  }
  function replay(perm, skipIdx){
    var cur = 0;
    for(var i = 0; i < perm.length; i++){
      var op = ops[perm[i]];
      if(op.type === 'W') cur = op.value;
      else if(perm[i] !== skipIdx && op.observed !== cur) return false;
    }
    return true;
  }
  function findWitness(skipIdx){
    for(var i = 0; i < ALL_PERMS.length; i++){
      var perm = ALL_PERMS[i];
      if(realTimeConsistent(perm) && replay(perm, skipIdx)) return perm;
    }
    return null;
  }

  function gen(s){
    var roll = W.rng(s);
    ops = [];
    for(var i = 0; i < N; i++){
      var start = roll() * 5.4;
      var dur = 0.7 + roll() * 1.5;
      var type = (i === 0) ? 'W' : (i === 1) ? 'R' : (roll() < 0.5 ? 'W' : 'R');
      var op = { type: type, start: start, end: start + dur };
      if(type === 'W') op.value = 1 + Math.floor(roll() * 9);
      ops.push(op);
    }
    var lp = ops.map(function(op){ return op.start + roll() * (op.end - op.start); });
    var order = ops.map(function(_, i){ return i; }).sort(function(a, b){ return lp[a] - lp[b]; });
    var cur = 0;
    order.forEach(function(idx){
      var op = ops[idx];
      if(op.type === 'W') cur = op.value;
      else op.observed = cur;   // correct-by-construction read
    });
    var readIdxs = ops.map(function(_, i){ return i; }).filter(function(i){ return ops[i].type === 'R'; });
    if(roll() < 0.45 && readIdxs.length){
      var target = readIdxs[Math.floor(roll() * readIdxs.length) % readIdxs.length];
      ops[target].observed = 99;   // no write ever writes 99 -- guaranteed illegal
    }
    verdict = null; culprit = -1; witness = null;
  }

  function check(){
    witness = findWitness(-1);
    if(witness){ verdict = 'pass'; }
    else{
      verdict = 'fail';
      for(var i = 0; i < ops.length; i++){
        if(ops[i].type !== 'R') continue;
        if(findWitness(i)){ culprit = i; break; }
      }
    }
    draw();
  }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    var maxEnd = Math.max.apply(null, ops.map(function(o){ return o.end; }));
    var padL = 96, padR = 16, top = 26, rowH = Math.min(30, (h - top - 34) / N);

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('seed ' + seed + '  ·  register x, one key', 8, 14);

    ops.forEach(function(op, i){
      var y = top + i * rowH;
      var x0 = padL + (op.start / maxEnd) * (w - padL - padR);
      var x1 = padL + (op.end / maxEnd) * (w - padL - padR);

      ctx.font = '10px "SF Mono",Menlo,Consolas,monospace';
      ctx.fillStyle = C.soft; ctx.textAlign = 'right';
      ctx.fillText('op' + i, padL - 8, y + rowH * 0.62);

      var isCulprit = verdict === 'fail' && i === culprit;
      ctx.fillStyle = isCulprit ? C2.bad : (verdict === 'pass' ? C2.good : (op.type === 'W' ? C.accent : C.grid));
      ctx.globalAlpha = (op.type === 'W' || verdict) ? 0.9 : 0.55;
      ctx.fillRect(x0, y + 4, Math.max(3, x1 - x0), rowH - 10);
      ctx.globalAlpha = 1;

      ctx.fillStyle = (op.type === 'W' && !verdict) ? C.paper : C.ink;
      ctx.font = '10px "SF Mono",Menlo,Consolas,monospace';
      ctx.textAlign = 'left';
      var label = op.type === 'W' ? ('W(x)=' + op.value) : ('R(x)→' + op.observed);
      ctx.fillText(label, x0 + 4, y + rowH * 0.62);
    });

    if(readout){
      if(!verdict){
        readout.textContent = 'a raw history — press "Check history" to run the oracle; the bars alone don’t tell you if this is legal.';
      } else if(verdict === 'pass'){
        readout.textContent = 'LINEARIZABLE — witness order: ' + witness.map(function(i){ return 'op' + i; }).join(' → ');
      } else {
        readout.textContent = 'NOT LINEARIZABLE — no legal order reproduces op' + culprit + '’s read; every other read can still be explained.';
      }
    }
  }

  if(seedInput) seedInput.addEventListener('change', function(){
    var v = parseInt(seedInput.value, 10);
    if(isFinite(v)){ seed = v; gen(seed); draw(); }
  });
  if(checkBtn) checkBtn.addEventListener('click', check);
  var replayBtn = box.querySelector('.replay');
  var reseedBtn = box.querySelector('.reseed');
  if(replayBtn) replayBtn.addEventListener('click', function(){ gen(seed); draw(); });
  if(reseedBtn) reseedBtn.addEventListener('click', function(){
    var v = Math.floor(Math.random() * 1000000);
    if(seedInput) seedInput.value = v;
    seed = v;
    gen(seed);
    draw();
  });

  gen(seed);
  W.onRelayout(draw);
  draw();
});

/* bisect-culprit: a real (if tiny) delta-debugging run. A fixed-length
   trace of N events hides exactly one culprit, chosen from the seed; the
   only thing the widget's oracle ever reports is yes/no -- "does the bug
   still reproduce in this candidate range?" -- exactly the shape of
   replaying a fault schedule against real code, never the culprit's
   identity directly. Each "Bisect" press halves the surviving range the
   way ddmin halves a failing input, so a trace of N events isolates its
   minimal cause in ceil(log2(N)) replays instead of a linear read of all
   of them. "Replay same seed" resets to the same culprit and confirms the
   same number of steps finds it again; only "New seed" touches
   Math.random(), same convention as every other widget in this book. */
BookWidgets.register('bisect-culprit', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var p = W.params(box);
  var C = W.theme();
  var seedInput = box.querySelector('.seed-input');
  var readout = box.querySelector('.readout');
  var seed = p.seed || 5566;
  var N = p.n || 16;

  var culprit, lo, hi, steps, done;

  function reset(s){
    seed = s;
    var roll = W.rng(seed);
    culprit = Math.floor(roll() * N);
    lo = 0; hi = N - 1; steps = 0; done = false;
  }

  function bisect(){
    if(done) return;
    var mid = lo + Math.floor((hi - lo) / 2);
    steps++;
    if(culprit <= mid){ hi = mid; } else { lo = mid + 1; }
    if(lo === hi) done = true;
    draw();
  }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d'), w = cv.__w, h = cv.__h;
    ctx.clearRect(0, 0, w, h);

    ctx.font = '11px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.ink; ctx.textAlign = 'left';
    ctx.fillText('seed ' + seed + '  ·  ' + steps + ' replay' + (steps === 1 ? '' : 's'), 10, 16);

    var padX = 14, top = 32, boxH = Math.min(38, h - top - 30);
    var gap = 3, boxW = (w - 2 * padX - (N - 1) * gap) / N;

    for(var i = 0; i < N; i++){
      var x = padX + i * (boxW + gap);
      var inRange = i >= lo && i <= hi;
      var isCulprit = done && i === culprit;
      ctx.fillStyle = isCulprit ? C.accent : (inRange ? C.grid : C.paper);
      ctx.globalAlpha = isCulprit ? 1 : (inRange ? 0.9 : 0.35);
      ctx.fillRect(x, top, boxW, boxH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isCulprit ? C.accent : C.grid;
      ctx.lineWidth = isCulprit ? 2 : 1;
      ctx.strokeRect(x, top, boxW, boxH);
      if(isCulprit){
        ctx.fillStyle = C.paper;
        ctx.font = 'bold 10px "SF Mono",Menlo,Consolas,monospace';
        ctx.textAlign = 'center';
        ctx.fillText('#' + i, x + boxW / 2, top + boxH / 2 + 4);
      }
    }

    ctx.font = '10px "SF Mono",Menlo,Consolas,monospace';
    ctx.fillStyle = C.soft; ctx.textAlign = 'left';
    ctx.fillText('N=' + N + ' events, still-candidate range: ' + (hi - lo + 1), padX, top + boxH + 18);

    if(readout){
      if(done){
        readout.textContent = 'isolated event #' + culprit + ' as the minimal cause in ' + steps +
          ' replays — ceil(log2(' + N + ')) = ' + Math.ceil(Math.log2(N)) +
          '. Press Replay to confirm the same seed finds it the same way every time.';
      } else {
        readout.textContent = (hi - lo + 1) + ' of ' + N + ' events still candidates — press Bisect to ' +
          'replay one half and let the oracle (pass/fail only, never "which one") rule it in or out.';
      }
    }
  }

  var bisectBtn = box.querySelector('.bisect');
  var replayBtn = box.querySelector('.replay');
  var reseedBtn = box.querySelector('.reseed');
  if(seedInput) seedInput.addEventListener('change', function(){
    var v = parseInt(seedInput.value, 10);
    if(isFinite(v)){ reset(v); draw(); }
  });
  if(bisectBtn) bisectBtn.addEventListener('click', bisect);
  if(replayBtn) replayBtn.addEventListener('click', function(){ reset(seed); draw(); });
  if(reseedBtn) reseedBtn.addEventListener('click', function(){
    var v = Math.floor(Math.random() * 1000000);
    if(seedInput) seedInput.value = v;
    reset(v);
    draw();
  });

  reset(seed);
  W.onRelayout(draw);
  draw();
});
