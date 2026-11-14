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
