/* Computer Networks — the book's shared widget layer.
   Loaded AFTER vendor/book-widgets.js, as a classic script:
     <script src="../assets/vendor/book-widgets.js"></script>
     <script src="../assets/widgets.js"></script>

   Two halves:
   1. window.NetViz — drawing + simulation helpers every networking widget
      shares, so a router looks like a router and a packet like a packet on
      every page (forwarding, routing, transport, queues, overlays…).
   2. BookWidgets.register(...) calls — concept pages APPEND their widgets
      in the marked section at the bottom, one block per concept, each
      prefixed with the concept id (e.g. 'qos-queue', 'transport-cwnd').

   Rules (from the BookBank runtime — all required):
   - draw a static first frame before any animation; tick(dt) is time-based;
   - redraw via W.onRelayout(draw); Plot.fit()/NetViz.fit() false = skip frame;
   - never bind arrow keys or wheel; pointer interaction via W.drag only;
   - W.rng(seed) / NetViz.rng, never Math.random — renders are reproducible;
   - colors only from theme tokens (NetViz.palette()), never literals. */
(function(){
  'use strict';
  var W = window.BookWidgets;
  if(!W){ return; }

  /* ---------- palette: the book's tokens, resolved once per draw ---------- */
  function palette(){
    return W.colors({
      ink:'--ink|#dbeaf4', soft:'--ink-soft|#8fb0c4', accent:'--accent|#46b1e0',
      grid:'--rule|#244a63', paper:'--bg|#0c2233', panel:'--bg-2|#123049',
      code:'--code-bg|#0a1b28', warm:'--num|#f0a15a', good:'--en|#9fd35a',
      cyan:'--at|#7fd1c8', faint:'--cm|#5b7d92', violet:'--mac|#c792ea'
    });
  }

  /* ---------- canvas fitting in CSS pixels ---------- */
  // Returns {ctx, w, h} or null while the rect is 0 (mid-relayout).
  function fit(cv){
    if(!W.fitCanvas(cv)) return null;
    return { ctx: cv.getContext('2d'), w: cv.__w, h: cv.__h };
  }

  function font(px, mono){
    var v = W.cssVar(mono ? '--font-mono' : '--font-body', mono ? 'monospace' : 'sans-serif');
    return (mono ? '' : '600 ') + px + 'px ' + v;
  }

  /* ---------- Topo: a node-link drawing in unit coordinates ----------
     var t = NetViz.topo(cv, {
       nodes:{ A:{x:.1,y:.5,kind:'host'}, R1:{x:.4,y:.3,kind:'router'} },
       links:[ ['A','R1',{label:'10G'}], ... ]
     });
     t.draw({ highlight:['A','R1'], packets:[{from:'A',to:'R1',t:.4,label:'1'}] })
     kinds: host (rounded box) · router (circle, crossed arrows) ·
            switch (square) · cloud (dashed ellipse). */
  function topo(cv, spec){
    var nodes = spec.nodes || {}, links = spec.links || [];
    function P(f, id){ var n = nodes[id]; return { x: n.x * f.w, y: n.y * f.h }; }
    function onPath(hl, a, b){
      if(!hl) return false;
      for(var i = 0; i + 1 < hl.length; i++){
        if((hl[i] === a && hl[i+1] === b) || (hl[i] === b && hl[i+1] === a)) return true;
      }
      return false;
    }
    function drawNode(ctx, C, id, p, n, r, hot){
      ctx.lineWidth = hot ? 2 : 1.3;
      ctx.strokeStyle = hot ? C.accent : C.ink;
      ctx.fillStyle = C.code;
      ctx.beginPath();
      if(n.kind === 'router'){
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath();                                   // the router "X" glyph
        ctx.moveTo(p.x - r*.45, p.y - r*.45); ctx.lineTo(p.x + r*.45, p.y + r*.45);
        ctx.moveTo(p.x + r*.45, p.y - r*.45); ctx.lineTo(p.x - r*.45, p.y + r*.45);
        ctx.stroke();
      } else if(n.kind === 'switch'){
        ctx.rect(p.x - r, p.y - r*.7, 2*r, 1.4*r); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - r*.55, p.y - r*.2); ctx.lineTo(p.x + r*.55, p.y - r*.2);
        ctx.moveTo(p.x + r*.55, p.y + r*.2); ctx.lineTo(p.x - r*.55, p.y + r*.2);
        ctx.stroke();
      } else if(n.kind === 'cloud'){
        ctx.setLineDash([4, 3]);
        ctx.ellipse(p.x, p.y, r*1.8, r*1.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      } else {                                             // host
        var w = r*1.5, h = r*1.05, k = 3;
        ctx.moveTo(p.x - w + k, p.y - h); ctx.lineTo(p.x + w - k, p.y - h);
        ctx.quadraticCurveTo(p.x + w, p.y - h, p.x + w, p.y - h + k);
        ctx.lineTo(p.x + w, p.y + h - k); ctx.quadraticCurveTo(p.x + w, p.y + h, p.x + w - k, p.y + h);
        ctx.lineTo(p.x - w + k, p.y + h); ctx.quadraticCurveTo(p.x - w, p.y + h, p.x - w, p.y + h - k);
        ctx.lineTo(p.x - w, p.y - h + k); ctx.quadraticCurveTo(p.x - w, p.y - h, p.x - w + k, p.y - h);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = hot ? C.accent : C.ink;
      ctx.font = font(Math.max(9, r * .62), true);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(n.label != null ? n.label : id, p.x, p.y + r * 1.25 + 2);
    }
    function draw(o){
      o = o || {};
      var f = fit(cv); if(!f) return false;
      var ctx = f.ctx, C = palette(), r = Math.max(9, Math.min(f.w, f.h) * .045);
      ctx.clearRect(0, 0, f.w, f.h);
      links.forEach(function(L){
        var a = P(f, L[0]), b = P(f, L[1]), opt = L[2] || {}, hot = onPath(o.highlight, L[0], L[1]);
        ctx.strokeStyle = opt.down ? C.faint : hot ? C.accent : C.soft;
        ctx.lineWidth = hot ? 2.2 : 1.2;
        ctx.setLineDash(opt.down || opt.dashed ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        var lab = opt.label != null ? opt.label : (o.linkLabels && o.linkLabels[L[0] + '-' + L[1]]);
        if(lab != null){
          ctx.font = font(Math.max(9, r * .55), true);
          ctx.fillStyle = opt.down ? C.faint : C.cyan; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText(lab, (a.x + b.x) / 2, (a.y + b.y) / 2 - 3);
        }
      });
      (o.packets || []).forEach(function(pk){ packet(ctx, C, P(f, pk.from), P(f, pk.to), pk.t, r * .55, pk); });
      Object.keys(nodes).forEach(function(id){
        var hot = o.highlight && o.highlight.indexOf(id) >= 0;
        drawNode(ctx, C, id, P(f, id), nodes[id], r, hot);
      });
      if(o.after) o.after(ctx, f, C, function(id){ return P(f, id); });
      return true;
    }
    return { draw: draw, nodes: nodes, links: links };
  }

  /* a packet: small labelled rectangle at fraction t along a→b */
  function packet(ctx, C, a, b, t, s, opt){
    opt = opt || {};
    var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    ctx.fillStyle = opt.color ? (C[opt.color] || C.warm) : C.warm;
    ctx.fillRect(x - s, y - s * .7, 2 * s, 1.4 * s);
    if(opt.label != null){
      ctx.fillStyle = C.paper; ctx.font = font(Math.max(8, s * 1.05), true);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(opt.label), x, y + .5);
    }
  }

  /* ---------- queue: a deterministic single-server FIFO/drop-tail model ---
     Used by the queueing, AQM, scheduling and transport pages so their
     numbers agree. Time unit = one packet service time at link rate.
       var q = NetViz.queue({ cap: 20, seed: 3 });
       q.step(dt, arrivalRate)  -> {len, dropped, served}
     Arrivals are Poisson (exponential gaps) from a seeded RNG; service is
     deterministic, so this is an M/D/1(/K) queue — checked against the
     closed form NetViz.md1 (mean in system at rho=.5/.8/.95 → .75/2.4/9.97). */
  function queue(o){
    o = o || {};
    var cap = o.cap || 20, r = W.rng(o.seed || 11);
    var len = 0, busy = 0, nextArr = null, dropped = 0, served = 0, arrived = 0, now = 0;
    function exp(rate){ var u = r(); if(u < 1e-9) u = 1e-9; return -Math.log(u) / rate; }
    function step(dt, lambda){
      var end = now + dt;
      if(lambda <= 0){ nextArr = null; }
      else if(nextArr === null) nextArr = now + exp(lambda);
      while(true){
        var tDep = len > 0 ? now + (1 - busy) : Infinity;   // service time = 1
        var tArr = nextArr === null ? Infinity : nextArr;
        var tn = Math.min(tDep, tArr);
        if(tn > end) break;
        if(len > 0) busy += tn - now;
        now = tn;
        if(tn === tDep){ len--; served++; busy = 0; }
        else { arrived++; if(len < cap) len++; else dropped++; nextArr = now + exp(lambda); }
      }
      if(len > 0) busy += end - now;
      now = end;
      return { len: len, dropped: dropped, served: served, arrived: arrived, t: now };
    }
    return { step: step, cap: cap, reset: function(){ len = busy = dropped = served = arrived = now = 0; nextArr = null; } };
  }

  /* Closed forms for annotating curves (rho = load in [0,1); time unit =
     one mean service time). md1 matches NetViz.queue; mm1 is the textbook
     exponential-service case. */
  var md1 = {
    meanInSystem: function(rho){ return rho >= 1 ? Infinity : rho + rho * rho / (2 * (1 - rho)); },
    meanDelay:    function(rho){ return rho >= 1 ? Infinity : 1 + rho / (2 * (1 - rho)); }
  };
  var mm1 = {
    meanInSystem: function(rho){ return rho >= 1 ? Infinity : rho / (1 - rho); },
    meanDelay:    function(rho){ return rho >= 1 ? Infinity : 1 / (1 - rho); }  // in service times
  };

  /* bit/byte/rate formatting so every page writes units the same way */
  function rate(bps){
    var u = ['b/s','kb/s','Mb/s','Gb/s','Tb/s'], i = 0;
    while(Math.abs(bps) >= 1000 && i < u.length - 1){ bps /= 1000; i++; }
    return W.fmt(bps) + ' ' + u[i];
  }
  function bytes(n){
    var u = ['B','KB','MB','GB','TB'], i = 0;
    while(Math.abs(n) >= 1000 && i < u.length - 1){ n /= 1000; i++; }
    return W.fmt(n) + ' ' + u[i];
  }

  window.NetViz = {
    palette: palette, fit: fit, font: font, topo: topo, packet: packet,
    queue: queue, md1: md1, mm1: mm1, rate: rate, bytes: bytes, rng: W.rng
  };
})();

/* ==========================================================================
   Concept widgets — append below, one block per concept, in book order.
   Each block: BookWidgets.register('<concept-prefix>-<name>', function(box, W){ … });
   ========================================================================== */

/* ---------- 01 · architectures-and-design-principles ----------
   arch-retry: where should "try again" live? Compares the mean number of
   link transmissions to deliver one packet over n hops with per-hop loss p:
     end-to-end retry only : ((1-(1-p)^n)/p) / (1-p)^n
     per-hop retry         : n / (1-p)
   (research.json → concepts.architectures-and-design-principles, retry claim) */
BookWidgets.register('arch-retry', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var nIn = box.querySelector('input.hops'), pIn = box.querySelector('input.loss');
  var out = box.querySelector('.readout');
  var C = NetViz.palette();
  var P = W.Plot(cv, { xr:[0, .4], yr:[0, 60], colors:{ grid:C.grid, soft:C.soft, ink:C.ink, accent:C.accent, paper:C.paper } });
  function e2e(n, p){ if(p <= 0) return n; var s = Math.pow(1 - p, n); return ((1 - s) / p) / s; }
  function hop(n, p){ return n / (1 - p); }
  function draw(){
    C = NetViz.palette();
    var n = nIn ? +nIn.value : 10, p = pIn ? +pIn.value / 100 : .1;
    if(!P.fit()) return;
    P.clear(); P.axes({ gx:.1, gy:10 });
    P.curve(function(x){ return e2e(n, x); }, C.warm, 2.4);
    P.curve(function(x){ return hop(n, x); }, C.cyan, 2.4);
    var a = e2e(n, p), b = hop(n, p);
    P.seg(p, 0, p, 60, C.faint, 1, [4, 3]);
    if(a <= 60){ P.dot(p, a, C.warm); }
    P.dot(p, b, C.cyan);
    P.label(.012, 56, 'link sends per delivered packet', C.soft, 0, 0);
    P.label(.3, Math.min(56, hop(n, .3)) - 4, 'retry at each hop', C.cyan, 0, 10);
    if(out){
      out.textContent = n + ' hops · ' + W.fmt(p * 100, 0) + '% loss per hop → ' +
        'ends-only: ' + (a > 9999 ? '>9999' : W.fmt(a, 1)) + ' sends (whole trip works ' +
        W.fmt(Math.pow(1 - p, n) * 100, 1) + '% of the time) · per hop: ' + W.fmt(b, 1) + ' sends';
    }
  }
  [nIn, pIn].forEach(function(el){ if(el) el.addEventListener('input', draw); });
  W.onRelayout(draw);
  draw();
});

/* ---------- 02 · packet-processing-and-forwarding ----------
   fwd-hol: head-of-line blocking in an N×N input-queued switch, fixed-size
   cells, every input always has traffic (saturated), destinations uniform.
     FIFO: one queue per input; each output serves one of the inputs whose
           head cell wants it (seeded random pick); the rest wait.
     VOQ : one queue per output at each input, single-iteration iSLIP
           (round-robin grant + accept pointers, updated only on accept).
   Theory (research.json → concepts.packet-processing-and-forwarding):
   FIFO saturation throughput 0.75 (N=2) … 0.6184 (N=8) → 2−√2 ≈ 0.586;
   VOQ + iSLIP → 100% under uniform traffic. */
BookWidgets.register('fwd-hol', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var nIn = box.querySelector('input.ports');
  var modeBtns = box.querySelectorAll('button[data-mode]');
  var playBtn = box.querySelector('button.play');
  var out = box.querySelector('.readout');
  var KAROL = { 1:1, 2:.75, 3:.6825, 4:.6553, 5:.6399, 6:.6302, 7:.6234, 8:.6184 };
  var LIMIT = 2 - Math.SQRT2;
  var mode = 'fifo', N = 8, rnd, Q, g, a, slots, served, hist, last;
  function pick(){ return Math.floor(rnd() * N) % N; }
  function reset(){
    N = nIn ? +nIn.value : 8;
    rnd = W.rng(17 + N);
    Q = []; g = []; a = [];
    for(var i = 0; i < N; i++){ Q.push([pick(), pick(), pick(), pick()]); g.push(0); a.push(0); }
    slots = 0; served = 0; hist = []; last = null;
  }
  function slot(){
    var i, o, match = [], blocked = [];
    for(i = 0; i < N; i++){ match.push(-1); blocked.push(false); }
    if(mode === 'fifo'){
      var want = [];
      for(o = 0; o < N; o++) want.push([]);
      for(i = 0; i < N; i++) want[Q[i][0]].push(i);
      for(o = 0; o < N; o++){
        if(!want[o].length) continue;
        var win = want[o][Math.floor(rnd() * want[o].length) % want[o].length];
        match[win] = o;
        want[o].forEach(function(k){ if(k !== win) blocked[k] = true; });
      }
      for(i = 0; i < N; i++) if(match[i] >= 0){ Q[i].shift(); Q[i].push(pick()); served++; }
    } else {
      // every VOQ is non-empty (saturated): all inputs request all outputs
      var grant = [];
      for(o = 0; o < N; o++) grant.push(g[o]);          // output o grants input g[o]
      for(i = 0; i < N; i++){
        for(var k = 0; k < N; k++){
          o = (a[i] + k) % N;
          if(grant[o] === i){ match[i] = o; break; }
        }
        if(match[i] >= 0){ o = match[i]; a[i] = (o + 1) % N; g[o] = (i + 1) % N; served++; }
      }
    }
    slots++;
    if(slots % 4 === 0) hist.push(served / (N * slots));
    last = { match: match, blocked: blocked };
  }
  function readout(){
    if(out){
      var th = slots ? served / (N * slots) : 0;
      var theory = mode === 'fifo'
        ? (KAROL[N] ? 'theory for ' + N + ' ports: ' + W.fmt(KAROL[N] * 100, 1) + '%' : 'theory → 58.6% for many ports')
        : 'theory: 100% for even traffic';
      out.textContent = N + ' ports · ' + (mode === 'fifo' ? 'one line per input' : 'per-output lines + iSLIP') +
        ' · measured ' + W.fmt(th * 100, 1) + '% of the outputs busy over ' + slots + ' slots · ' + theory;
    }
  }
  function draw(){
    readout();
    var f = NetViz.fit(cv); if(!f) return;
    var ctx = f.ctx, C = NetViz.palette(), w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    // --- left: inputs, queues, crossbar, outputs
    var L = w * .56, top = 18, bot = h - 14, rowH = (bot - top) / N;
    var cell = Math.max(6, Math.min(rowH * .72, L * .075));
    var qx = 8, xbL = qx + cell * 4.6, xbR = L - 34;
    ctx.font = NetViz.font(Math.max(8, Math.min(11, cell * .8)), true);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = C.soft;
    ctx.fillText(mode === 'fifo' ? 'one line per input' : 'a line per output, per input', (qx + xbL) / 2, 8);
    ctx.fillText('outputs', xbR + 18, 8);
    for(var i = 0; i < N; i++){
      var y = top + rowH * (i + .5);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xbL, y); ctx.lineTo(xbR, y); ctx.stroke();
      if(mode === 'fifo'){
        for(var k = 3; k >= 0; k--){
          var cx = qx + (3 - k) * cell * 1.1, head = k === 0;
          var hot = head && last && last.match[i] >= 0, blk = head && last && last.blocked[i];
          ctx.fillStyle = hot ? C.accent : blk ? C.warm : C.code;
          ctx.strokeStyle = head ? (hot ? C.accent : blk ? C.warm : C.ink) : C.soft;
          ctx.fillRect(cx, y - cell / 2, cell, cell); ctx.strokeRect(cx, y - cell / 2, cell, cell);
          ctx.fillStyle = (hot || blk) ? C.paper : C.ink;
          ctx.fillText(String(Q[i][k] + 1), cx + cell / 2, y + .5);
        }
      } else {
        var mini = Math.min(cell, (xbL - qx - 4) / N);
        for(var o2 = 0; o2 < N; o2++){
          var mx = qx + o2 * mini, on = last && last.match[i] === o2;
          ctx.fillStyle = on ? C.accent : C.code; ctx.strokeStyle = on ? C.accent : C.soft;
          ctx.fillRect(mx, y - cell / 2, mini - 1, cell); ctx.strokeRect(mx, y - cell / 2, mini - 1, cell);
        }
      }
      var yo = top + rowH * (i + .5);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
      ctx.strokeRect(xbR + 8, yo - cell / 2, cell * 1.2, cell);
      ctx.fillStyle = C.ink; ctx.fillText(String(i + 1), xbR + 8 + cell * .6, yo + .5);
    }
    if(last){
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.8;
      for(i = 0; i < N; i++){
        if(last.match[i] < 0) continue;
        var y1 = top + rowH * (i + .5), y2 = top + rowH * (last.match[i] + .5);
        ctx.beginPath(); ctx.moveTo(xbL, y1); ctx.lineTo(xbR + 8, y2); ctx.stroke();
      }
    }
    // --- right: running throughput
    var px0 = L + 30, px1 = w - 8, py0 = 18, py1 = h - 24;
    function Y(v){ return py1 - (v - .4) / .6 * (py1 - py0); }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    [.4, .6, .8, 1].forEach(function(v){
      ctx.beginPath(); ctx.moveTo(px0, Y(v)); ctx.lineTo(px1, Y(v)); ctx.stroke();
      ctx.fillText(Math.round(v * 100) + '%', px0 - 4, Y(v));
    });
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C.warm;
    ctx.beginPath(); ctx.moveTo(px0, Y(LIMIT)); ctx.lineTo(px1, Y(LIMIT)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'left'; ctx.fillStyle = C.warm;
    ctx.fillText('58.6%', px0 + 3, Y(LIMIT) + 9);
    ctx.fillStyle = C.soft; ctx.textAlign = 'center';
    ctx.fillText('time slots →', (px0 + px1) / 2, h - 8);
    if(hist.length > 1){
      ctx.strokeStyle = mode === 'fifo' ? C.warm : C.cyan; ctx.lineWidth = 2;
      ctx.beginPath();
      for(var j = 0; j < hist.length; j++){
        var x = px0 + (px1 - px0) * j / (hist.length - 1), v = Math.max(.4, Math.min(1, hist[j]));
        if(j) ctx.lineTo(x, Y(v)); else ctx.moveTo(x, Y(v));
      }
      ctx.stroke();
    }
  }
  var acc = 0;
  var eng = W.anim(box, function(dt){
    acc += dt * 30;
    while(acc >= 1){ slot(); acc -= 1; }
    if(hist.length > 600) hist = hist.filter(function(_, k){ return k % 2 === 0; });
    draw();
  });
  function restart(){ reset(); for(var s = 0; s < 600; s++) slot(); draw(); }
  if(nIn) nIn.addEventListener('input', restart);
  Array.prototype.forEach.call(modeBtns, function(b){
    b.addEventListener('click', function(){
      mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(modeBtns, function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      restart();
    });
  });
  if(playBtn) playBtn.addEventListener('click', function(){
    var on = eng.toggle(true); playBtn.textContent = on ? 'Pause' : 'Play';
  });
  W.onRelayout(draw);
  restart();
  eng.start();
  if(playBtn) playBtn.textContent = eng.running() ? 'Pause' : 'Play';
});

/* ---------- 03 · routing-algorithms-protocols-policy ----------
   route-cti: count-to-infinity on a chain A–B–C–D (unit link costs).
   The A–B link breaks at round 0. Synchronous distance-vector rounds:
     dist_x = min over live neighbours n of 1 + adv(n→x)
   where adv is n's previous-round distance, or 16 if poisoned reverse is on
   and n's next hop is x. 16 = "unreachable" (RIP). Hand-checked trace in
   research.json → concepts.routing-algorithms-protocols-policy.snippets. */
BookWidgets.register('route-cti', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var modeBtns = box.querySelectorAll('button[data-mode]');
  var playBtn = box.querySelector('button.play');
  var out = box.querySelector('.readout');
  var INF = 16, names = ['B', 'C', 'D'];
  var nb = { B:['C'], C:['B','D'], D:['C'] };   // after A–B breaks
  var mode = 'plain', round, dist, via, hist, done;
  function reset(){
    round = 0; done = false;
    dist = { B:1, C:2, D:3 }; via = { B:'A', C:'B', D:'C' };
    hist = [[1, 2, 3]];
  }
  function step(){
    if(done) return;
    var nd = {}, nv = {};
    names.forEach(function(x){
      var best = INF, hop = '–';
      nb[x].forEach(function(n){
        var adv = (mode === 'poison' && via[n] === x) ? INF : dist[n];
        var c = Math.min(INF, 1 + adv);
        if(c < best){ best = c; hop = n; }
      });
      nd[x] = best; nv[x] = best >= INF ? '–' : hop;
    });
    dist = nd; via = nv; round++;
    hist.push([dist.B, dist.C, dist.D]);
    if(dist.B >= INF && dist.C >= INF && dist.D >= INF) done = true;
  }
  function readout(){
    if(!out) return;
    out.textContent = (mode === 'plain' ? 'plain distance-vector' : 'split horizon + poisoned reverse') +
      ' · round ' + round + ' · B=' + dist.B + ' C=' + dist.C + ' D=' + dist.D +
      (done ? ' · everyone agrees A is gone after ' + round + ' rounds (≈ ' + round * 30 + ' s at a 30 s timer, no early updates)' : ' · still believing in A');
  }
  function draw(){
    readout();
    var f = NetViz.fit(cv); if(!f) return;
    var ctx = f.ctx, C = NetViz.palette(), w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    var top = h * .30, r = Math.max(10, Math.min(w, h) * .05);
    var xs = [.10, .36, .62, .88].map(function(t){ return t * w; });
    var lab = ['A', 'B', 'C', 'D'];
    // links
    for(var i = 0; i < 3; i++){
      var broken = i === 0;
      ctx.strokeStyle = broken ? C.warm : C.soft; ctx.lineWidth = 1.6;
      ctx.setLineDash(broken ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(xs[i] + r, top); ctx.lineTo(xs[i+1] - r, top); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = NetViz.font(Math.max(10, r * .8), true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C.warm; ctx.fillText('✕ broken', (xs[0] + xs[1]) / 2, top - r * 1.3);
    // next-hop arrows (who each router thinks is closer to A)
    names.forEach(function(x, k){
      var at = xs[k + 1], v = via[x];
      if(v === '–' || v === 'A') return;
      var to = xs[lab.indexOf(v)], y = top + r * 1.9;
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(at, y); ctx.lineTo(to + (to < at ? r : -r), y); ctx.stroke();
      var tip = to + (to < at ? r : -r), d = to < at ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(tip, y); ctx.lineTo(tip + 6 * d, y - 4); ctx.lineTo(tip + 6 * d, y + 4); ctx.closePath();
      ctx.fillStyle = C.accent; ctx.fill();
    });
    // nodes
    lab.forEach(function(n, k){
      ctx.lineWidth = 1.4; ctx.strokeStyle = k === 0 ? C.faint : C.ink; ctx.fillStyle = C.code;
      ctx.beginPath(); ctx.arc(xs[k], top, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = k === 0 ? C.faint : C.ink; ctx.fillText(n, xs[k], top + .5);
      if(k){
        var d = dist[n];
        ctx.fillStyle = d >= INF ? C.warm : C.cyan;
        ctx.fillText(d >= INF ? '∞' : 'to A: ' + d, xs[k], top - r * 1.3);
      } else {
        ctx.fillStyle = C.faint; ctx.fillText('the place', xs[k], top - r * 1.3);
      }
    });
    // history chart
    var px0 = 34, px1 = w - 10, py0 = h * .58, py1 = h - 18;
    function Y(v){ return py1 - Math.min(v, INF) / INF * (py1 - py0); }
    var maxR = Math.max(16, hist.length - 1);
    function X(k){ return px0 + (px1 - px0) * k / maxR; }
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    ctx.font = NetViz.font(10, true);
    [0, 8, 16].forEach(function(v){
      ctx.beginPath(); ctx.moveTo(px0, Y(v)); ctx.lineTo(px1, Y(v)); ctx.stroke();
      ctx.fillText(v === 16 ? '16=∞' : String(v), px0 - 4, Y(v));
    });
    ctx.textAlign = 'center'; ctx.fillText('rounds of telling the neighbours →', (px0 + px1) / 2, h - 6);
    var cols = [C.cyan, C.accent, C.violet];
    for(var s = 0; s < 3; s++){
      ctx.strokeStyle = cols[s]; ctx.lineWidth = 2; ctx.beginPath();
      for(var k = 0; k < hist.length; k++){
        var x = X(k), y = Y(hist[k][s]) - s * 1.5;
        if(k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = cols[s]; ctx.textAlign = 'left';
      var last = hist[hist.length - 1][s];
      ctx.fillText(names[s], Math.min(X(hist.length - 1) + 4, px1 - 8), Y(last) - s * 9 + 8);
    }
  }
  var acc = 0, hold = 0, fresh = true;
  function runOut(){ reset(); while(!done) step(); }
  var eng = W.anim(box, function(dt){
    if(fresh){ fresh = false; reset(); }
    if(done){ hold += dt; if(hold > 2.5){ hold = 0; reset(); } draw(); return; }
    acc += dt;
    if(acc >= .7){ acc = 0; step(); }
    draw();
  });
  Array.prototype.forEach.call(modeBtns, function(b){
    b.addEventListener('click', function(){
      mode = b.getAttribute('data-mode');
      Array.prototype.forEach.call(modeBtns, function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if(eng.running()) reset(); else runOut();
      draw();
    });
  });
  if(playBtn) playBtn.addEventListener('click', function(){
    var on = eng.toggle(true); playBtn.textContent = on ? 'Pause' : 'Play';
  });
  W.onRelayout(draw);
  // static first frame (reduced motion / print): the whole story, run to the end
  runOut(); draw();
  eng.start();
  if(playBtn) playBtn.textContent = eng.running() ? 'Pause' : 'Play';
});

/* ---------- 04 · transport-beyond-tcp-basics ----------
   transport-cwnd: one flow, one bottleneck. The pipe holds BDP = 100 packets
   (base trip 100 ms); the bottleneck's buffer holds B = buf × BDP more.
   Packets in flight above BDP sit in the queue; above BDP + B they drop.
   Each step is one round trip (base RTT + queueing delay).
     Reno : slow start doubles; then +1 per round; on drop, halve.
     CUBIC: RFC 9438 — W(t) = 0.4·(t−K)³ + Wmax, K = ∛(Wmax·0.3/0.4),
            β = 0.7, Reno-friendly floor Wmax·β + 0.529·t/RTT; t in seconds.
     BBR  : a cartoon of v1 — startup doubles to BDP, two rounds at 2×BDP,
            drain, then ProbeBW (1.25×BDP one round in eight, else BDP) and
            ProbeRTT (4 packets for 2 rounds every ~10 s). Ignores drops.
   (research.json → concepts.transport-beyond-tcp-basics) */
BookWidgets.register('transport-cwnd', function(box, W){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var algBtns = box.querySelectorAll('button[data-alg]');
  var bufIn = box.querySelector('input.buf');
  var playBtn = box.querySelector('button.play');
  var out = box.querySelector('.readout');
  var BUFS = [0.1, 0.25, 0.5, 1, 2, 4];
  var BDP = 100, RTT = 0.1, N = 240, alg = 'reno', trace = [], shown = N, stats = {};
  function bufX(){ return BUFS[bufIn ? +bufIn.value : 3]; }
  function simulate(){
    var cap = BDP * (1 + bufX()), w = 10, ss = true, wmax = 0, t = 0, drops = 0;
    var bbrPhase = 'startup', k = 0, sinceRtt = 0;
    trace = [];
    for(var r = 0; r < N; r++){
      var inflight, drop = false;
      if(alg === 'bbr'){
        sinceRtt++;
        if(bbrPhase === 'startup'){ w = w * 2; if(w >= BDP){ bbrPhase = 'full'; k = 0; } inflight = w; }
        else if(bbrPhase === 'full'){ inflight = 2 * BDP; if(++k >= 2){ bbrPhase = 'drain'; } }
        else if(bbrPhase === 'drain'){ inflight = BDP; bbrPhase = 'probe'; k = 0; }
        else if(bbrPhase === 'probertt'){ inflight = 4; if(++k >= 2){ bbrPhase = 'probe'; k = 0; sinceRtt = 0; } }
        else {
          inflight = (k % 8 === 0) ? 1.25 * BDP : BDP; k++;
          if(sinceRtt >= 100){ bbrPhase = 'probertt'; k = 0; }
        }
        if(inflight > cap){ drop = true; inflight = cap; }
      } else {
        if(w > cap){
          drop = true; inflight = cap;
          if(alg === 'reno'){ w = cap / 2; }
          else { wmax = cap; w = 0.7 * cap; t = 0; }
          ss = false;
        } else {
          inflight = w;
          if(ss){ w = w * 2; }
          else if(alg === 'reno'){ w = w + 1; }
          else {
            var rtt = RTT * (1 + Math.max(0, inflight - BDP) / BDP);
            t += rtt;
            var K = Math.cbrt(wmax * 0.3 / 0.4);
            var wc = 0.4 * Math.pow(t - K, 3) + wmax;
            var we = wmax * 0.7 + (3 * 0.3 / 1.7) * (t / RTT);
            w = Math.max(wc, we);
          }
        }
      }
      if(drop) drops++;
      trace.push({ w: inflight, drop: drop });
    }
    var u = 0, q = 0, from = 30;
    for(var i = from; i < N; i++){
      u += Math.min(trace[i].w, BDP) / BDP;
      q += Math.max(0, trace[i].w - BDP) / BDP * RTT * 1000;
    }
    stats = { util: u / (N - from) * 100, qms: q / (N - from), drops: drops, cap: cap };
  }
  function readout(){
    if(!out) return;
    var name = { reno:'Reno', cubic:'CUBIC', bbr:'BBR (sketch)' }[alg];
    out.textContent = name + ' · waiting room = ' + bufX() + '× the pipe · pipe kept busy ' +
      W.fmt(stats.util, 0) + '% · average wait in line ' + W.fmt(stats.qms, 0) + ' ms on a 100 ms trip · ' +
      stats.drops + ' drops in ' + N + ' trips';
  }
  function draw(){
    readout();
    var f = NetViz.fit(cv); if(!f) return;
    var ctx = f.ctx, C = NetViz.palette(), w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    var x0 = 40, x1 = w - 12, y0 = 14, y1 = h - 24;
    var ymax = Math.max(stats.cap, 2.2 * BDP) * 1.08;
    function X(r){ return x0 + (x1 - x0) * r / (N - 1); }
    function Y(v){ return y1 - v / ymax * (y1 - y0); }
    // the waiting room (buffer) band
    ctx.fillStyle = C.panel; ctx.fillRect(x0, Y(stats.cap), x1 - x0, Y(BDP) - Y(stats.cap));
    ctx.font = NetViz.font(10, true); ctx.textBaseline = 'middle';
    ctx.strokeStyle = C.soft; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, Y(BDP)); ctx.lineTo(x1, Y(BDP)); ctx.stroke();
    ctx.strokeStyle = C.warm; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x0, Y(stats.cap)); ctx.lineTo(x1, Y(stats.cap)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    ctx.fillText('pipe full', x1 - 4, Y(BDP) + 9);
    ctx.fillStyle = C.warm; ctx.fillText('room full → drop', x1 - 4, Y(stats.cap) - 8);
    ctx.fillStyle = C.faint; ctx.textAlign = 'right';
    var mid = (Y(BDP) + Y(stats.cap)) / 2;
    if(Y(BDP) - Y(stats.cap) > 30) ctx.fillText('waiting in line', x1 - 4, mid);
    // y labels
    ctx.textAlign = 'right'; ctx.fillStyle = C.soft;
    [0, BDP, Math.round(stats.cap)].forEach(function(v){ ctx.fillText(String(v), x0 - 4, Y(v)); });
    ctx.textAlign = 'center';
    ctx.fillText('round trips →   (height = packets on the way)', (x0 + x1) / 2, h - 8);
    // trace
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.beginPath();
    for(var r = 0; r < shown; r++){
      var px = X(r), py = Y(trace[r].w);
      if(r) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.fillStyle = C.warm;
    for(var d = 0; d < shown; d++){
      if(trace[d].drop){ ctx.beginPath(); ctx.arc(X(d), Y(trace[d].w), 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  var acc = 0, hold = 0;
  var eng = W.anim(box, function(dt){
    if(shown >= N){ hold += dt; if(hold > 2.5){ hold = 0; shown = 1; } draw(); return; }
    acc += dt;
    var step = Math.floor(acc / 0.03);
    if(step > 0){ acc -= step * 0.03; shown = Math.min(N, shown + step); }
    draw();
  });
  function redo(){ simulate(); if(!eng.running()) shown = N; draw(); }
  Array.prototype.forEach.call(algBtns, function(b){
    b.addEventListener('click', function(){
      alg = b.getAttribute('data-alg');
      Array.prototype.forEach.call(algBtns, function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if(eng.running()) shown = 1;
      redo();
    });
  });
  if(bufIn) bufIn.addEventListener('input', redo);
  if(playBtn) playBtn.addEventListener('click', function(){
    var on = eng.toggle(true); playBtn.textContent = on ? 'Pause' : 'Play';
    if(on && shown >= N) shown = 1;
  });
  W.onRelayout(draw);
  simulate(); shown = N; draw();     // static first frame: the whole run
});
