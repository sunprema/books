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
