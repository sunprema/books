/* widgets.js — Basic Electronics' interactive canvas widgets.
   Built on the vendored BookWidgets runtime (assets/vendor/book-widgets.js):
   the runtime handles DOM-scan boot, the shared dt-clamped rAF loop (paused
   offscreen), reduced-motion, DPR-correct canvas fitting, and theme colors.
   This file only draws the electronics: current-flow loops, RC/LC curves,
   a PN-junction gate, a triode grid, an NPN valve, and an LC tuning sweep.

   Every widget: draws a static first frame (reduced-motion + print), ticks
   are dt-based (never frame-counted), redraws via W.onRelayout, never binds
   arrow keys (those belong to the pager), and uses W.rng() (never
   Math.random) for any decorative jitter so renders are reproducible.
*/
(function(){
  "use strict";
  if(!window.BookWidgets) return;
  var W0 = window.BookWidgets;

  /* ---- shared drawing helpers, reused by several widgets ---- */

  // A rectangular wire "track" — trackPoint(t) walks its perimeter clockwise
  // from the top-left corner, t in [0,1). Used to animate charge along a loop.
  function makeTrack(rect){
    var perim = 2 * (rect.w + rect.h);
    return function(t){
      var d = (((t % 1) + 1) % 1) * perim, x, y;
      if(d <= rect.w){ x = rect.x + d; y = rect.y; }
      else{
        d -= rect.w;
        if(d <= rect.h){ x = rect.x + rect.w; y = rect.y + d; }
        else{
          d -= rect.h;
          if(d <= rect.w){ x = rect.x + rect.w - d; y = rect.y + rect.h; }
          else{ d -= rect.w; x = rect.x; y = rect.y + rect.h - d; }
        }
      }
      return { x: x, y: y };
    };
  }

  function zigzag(ctx, x0, y0, x1, y0b, teeth, amp, color, width){
    ctx.strokeStyle = color; ctx.lineWidth = width || 3;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    var seg = (x1 - x0) / teeth;
    for(var k = 0; k < teeth; k++){
      ctx.lineTo(x0 + seg * (k + 1), y0 + ((k % 2 === 0) ? -amp : amp));
    }
    ctx.lineTo(x1, y0b);
    ctx.stroke();
  }

  function coil(ctx, x0, y, x1, turns, r, color, width){
    ctx.strokeStyle = color; ctx.lineWidth = width || 3;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    var span = (x1 - x0) / turns;
    for(var k = 0; k < turns; k++){
      var cx = x0 + span * (k + 0.5);
      ctx.arc(cx, y, r, Math.PI, 0, false);
    }
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  function battery(ctx, x, y, color){
    ctx.strokeStyle = color; ctx.lineCap = 'butt';
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 12, y - 4); ctx.lineTo(x + 12, y - 4); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 7, y + 5); ctx.lineTo(x + 7, y + 5); ctx.stroke();
  }

  function diodeGlyph(ctx, x, y, size, color, blocked){
    ctx.save();
    ctx.strokeStyle = blocked ? '#b0461f' : color; ctx.fillStyle = blocked ? 'rgba(176,70,31,.18)' : color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - size, y - size * 0.75);
    ctx.lineTo(x - size, y + size * 0.75);
    ctx.lineTo(x + size, y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size, y - size * 0.9); ctx.lineTo(x + size, y + size * 0.9);
    ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  function fmtSI(v, unit){
    if(v >= 1e6) return (v/1e6).toFixed(2) + ' M' + unit;
    if(v >= 1e3) return (v/1e3).toFixed(2) + ' k' + unit;
    if(v < 1 && v > 0) return (v*1000).toFixed(1) + ' m' + unit;
    return v.toFixed(2) + ' ' + unit;
  }

  /* =========================================================
     1) "circuit" — Ohm's law: a loop with a battery, a resistor,
        and a bulb. Charge dots flow at a rate set by I = V / R.
     ========================================================= */
  W0.register('circuit', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elV = box.querySelector('.ctl-v'), elR = box.querySelector('.ctl-r');
    var elVv = box.querySelector('.v-out'), elRv = box.querySelector('.r-out');
    var readout = box.querySelector('.readout');
    var playBtn = box.querySelector('.btn.play');
    var V = elV ? parseFloat(elV.value) : 6, R = elR ? parseFloat(elR.value) : 100;
    function syncLabels(){
      if(elVv) elVv.textContent = V.toFixed(1) + ' V';
      if(elRv) elRv.textContent = Math.round(R) + ' Ω';
    }
    if(elV) elV.addEventListener('input', function(){ V = parseFloat(elV.value); syncLabels(); draw(); });
    if(elR) elR.addEventListener('input', function(){ R = parseFloat(elR.value); syncLabels(); draw(); });
    syncLabels();

    var dots = [0, 0.25, 0.5, 0.75];
    var rect = null, track = null;
    function layoutRect(){
      if(!W.fitCanvas(cv)) return false;
      var w = cv.__w, h = cv.__h, pad = Math.min(w, h) * 0.18;
      rect = { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad };
      track = makeTrack(rect);
      return true;
    }
    function draw(){
      if(!rect && !layoutRect()) return;
      ctx.clearRect(0, 0, cv.__w, cv.__h);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 3; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      battery(ctx, rect.x, rect.y + rect.h / 2, C.ink);
      ctx.fillStyle = C.soft; ctx.font = '11px monospace'; ctx.textAlign = 'left';
      ctx.fillText(V.toFixed(1) + 'V', rect.x + 10, rect.y + rect.h / 2 + 3);

      var zx0 = rect.x + rect.w * 0.28, zx1 = rect.x + rect.w * 0.72;
      zigzag(ctx, zx0, rect.y, zx1, rect.y, 6, 10, C.accent, 3);
      ctx.fillText(Math.round(R) + 'Ω', (zx0 + zx1) / 2 - 16, rect.y - 12);

      var I = V / R; // amps
      var bright = Math.max(0.12, Math.min(1, I * 45));
      var bx = rect.x + rect.w / 2, by = rect.y + rect.h;
      if(bright > 0.04){
        var grad = ctx.createRadialGradient(bx, by, 4, bx, by, 30);
        grad.addColorStop(0, 'rgba(255,196,60,' + (bright * 0.65).toFixed(2) + ')');
        grad.addColorStop(1, 'rgba(255,196,60,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bx, by, 30, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,196,60,' + bright.toFixed(2) + ')';
      ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.stroke();

      ctx.fillStyle = C.accent;
      for(var d = 0; d < dots.length; d++){
        var p = track(dots[d]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.2, 0, Math.PI * 2); ctx.fill();
      }
      if(readout) readout.textContent =
        'I = V ÷ R = ' + V.toFixed(1) + 'V ÷ ' + Math.round(R) + 'Ω = ' + (I * 1000).toFixed(1) + ' mA';
    }
    var eng = W.anim(box, function(dt){
      var I = V / R, speed = Math.max(0.03, Math.min(1.6, I * 32));
      for(var d = 0; d < dots.length; d++) dots[d] = (dots[d] + speed * dt * 0.22) % 1;
      draw();
    });
    if(playBtn) playBtn.addEventListener('click', function(){
      var r = eng.toggle(true); playBtn.textContent = r ? '⏸ Pause' : '▶ Play';
    });
    W.onRelayout(function(){ rect = null; draw(); });
    draw();
    eng.start();
  });

  /* =========================================================
     2) "rc" — a capacitor charging/discharging through a resistor.
        Left: the plates filling with charge. Right: V(t) curve.
     ========================================================= */
  W0.register('rc', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elTau = box.querySelector('.ctl-tau'), elTauv = box.querySelector('.tau-out');
    var readout = box.querySelector('.readout');
    var playBtn = box.querySelector('.btn.play');
    var tau = elTau ? parseFloat(elTau.value) : 1.0;
    function syncLabel(){ if(elTauv) elTauv.textContent = tau.toFixed(1) + ' s'; }
    if(elTau) elTau.addEventListener('input', function(){ tau = parseFloat(elTau.value); syncLabel(); });
    syncLabel();

    var phase = 'charging', t = 0;
    var W_, H_;
    function draw(){
      if(!W.fitCanvas(cv)) return;
      W_ = cv.__w; H_ = cv.__h;
      ctx.clearRect(0, 0, W_, H_);
      var frac = phase === 'charging' ? (1 - Math.exp(-t / tau)) : Math.exp(-t / tau);

      // --- left: schematic, plates filling ---
      var lw = W_ * 0.36, pad = H_ * 0.16;
      var px = lw * 0.62, gap = lw * 0.16, plateH = H_ - 2 * pad;
      ctx.strokeStyle = C.soft; ctx.lineWidth = 2;
      ctx.strokeRect(pad * 0.4, pad, lw - pad * 0.8, H_ - 2 * pad);
      ctx.fillStyle = C.ink; ctx.font = '11px monospace'; ctx.textAlign = 'center';
      ctx.fillText(phase === 'charging' ? 'charging' : 'discharging', lw / 2, pad - 6);

      ctx.fillStyle = C.accent; ctx.globalAlpha = 0.85;
      var fillH = plateH * frac;
      ctx.fillRect(px - gap / 2 - 3, pad + (plateH - fillH), 3, fillH);
      ctx.fillRect(px + gap / 2, pad + (plateH - fillH), 3, fillH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(px - gap / 2, pad); ctx.lineTo(px - gap / 2, pad + plateH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + gap / 2, pad); ctx.lineTo(px + gap / 2, pad + plateH); ctx.stroke();
      ctx.font = '10px monospace'; ctx.fillStyle = C.soft;
      ctx.fillText((frac * 100).toFixed(0) + '% of Vₛ', px, pad + plateH + 16);

      // --- right: V(t) curve for a full 5*tau charge or discharge ---
      var gx = lw + W_ * 0.06, gw = W_ - gx - W_ * 0.04;
      var gy = pad, gh = H_ - 2 * pad;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2.2;
      var tmax = 5 * tau, N = 80;
      for(var i = 0; i <= N; i++){
        var tt = tmax * i / N;
        var vv = phase === 'charging' ? (1 - Math.exp(-tt / tau)) : Math.exp(-tt / tau);
        var xx = gx + gw * (tt / tmax), yy = gy + gh * (1 - vv);
        if(i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      var curX = gx + gw * Math.min(1, t / tmax);
      var curY = gy + gh * (1 - frac);
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(curX, curY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.font = '10px monospace'; ctx.fillStyle = C.soft; ctx.textAlign = 'left';
      ctx.fillText('V', gx - 12, gy + 8); ctx.fillText('t', gx + gw - 6, gy + gh + 14);

      if(readout) readout.textContent =
        'τ = RC = ' + tau.toFixed(1) + ' s — ' + (phase === 'charging' ? 'V(t) = Vₛ(1−e^−t/τ)' : 'V(t) = V₀·e^−t/τ') +
        ', now at ' + (frac * 100).toFixed(0) + '%';
    }
    var eng = W.anim(box, function(dt){
      t += dt;
      if(t > 5 * tau){ t = 0; phase = phase === 'charging' ? 'discharging' : 'charging'; }
      draw();
    });
    if(playBtn) playBtn.addEventListener('click', function(){
      var r = eng.toggle(true); playBtn.textContent = r ? '⏸ Pause' : '▶ Play';
    });
    W.onRelayout(draw);
    draw();
    eng.start();
  });

  /* =========================================================
     3) "lc" — energy sloshing between a capacitor and an inductor;
        the resonant frequency f = 1 / (2π√(LC)).
        (Animation speed is scaled for visibility — the readout
        shows the real computed frequency.)
     ========================================================= */
  W0.register('lc', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elC = box.querySelector('.ctl-c'), elCv = box.querySelector('.c-out');
    var readout = box.querySelector('.readout');
    var playBtn = box.querySelector('.btn.play');
    var Lh = 0.001; // 1 mH fixed
    var Cf = elC ? parseFloat(elC.value) * 1e-9 : 100e-9; // nF -> F
    function syncLabel(){ if(elCv) elCv.textContent = (Cf * 1e9).toFixed(0) + ' nF'; }
    if(elC) elC.addEventListener('input', function(){ Cf = parseFloat(elC.value) * 1e-9; syncLabel(); draw(); });
    syncLabel();

    var theta = 0;
    function freq(){ return 1 / (2 * Math.PI * Math.sqrt(Lh * Cf)); }
    function draw(){
      if(!W.fitCanvas(cv)) return;
      var Wd = cv.__w, Hd = cv.__h;
      ctx.clearRect(0, 0, Wd, Hd);
      var lw = Wd * 0.42, pad = Hd * 0.18;
      // capacitor (left) + inductor (right) loop
      var top = pad, bot = Hd - pad, midx = lw * 0.5;
      var capX = lw * 0.28, indX0 = lw * 0.55, indX1 = lw * 0.92;
      ctx.strokeStyle = C.soft; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(capX, top); ctx.lineTo(indX1, top); ctx.moveTo(capX, bot); ctx.lineTo(indX1, bot);
      ctx.moveTo(capX, top); ctx.lineTo(capX, bot); ctx.moveTo(indX1, top); ctx.lineTo(indX1, bot);
      ctx.stroke();
      var q = Math.cos(theta); // charge, normalized -1..1
      var i = Math.sin(theta); // current, normalized -1..1 (90deg out of phase)
      ctx.globalAlpha = 0.85; ctx.fillStyle = C.accent;
      var plateGap = 14, plateHalf = (bot - top) * 0.4 * Math.abs(q);
      var midY = (top + bot) / 2;
      // q>0: charge shown growing upward from mid; q<0: growing downward
      if(q >= 0){ ctx.fillRect(capX - plateGap / 2 - 3, midY - plateHalf, 3, plateHalf); }
      else{ ctx.fillRect(capX - plateGap / 2 - 3, midY, 3, plateHalf); }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(capX - plateGap/2, midY-24); ctx.lineTo(capX - plateGap/2, midY+24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(capX + plateGap/2, midY-24); ctx.lineTo(capX + plateGap/2, midY+24); ctx.stroke();
      ctx.fillStyle = C.soft; ctx.font='10px monospace'; ctx.textAlign='center';
      ctx.fillText('C', capX, top - 8);
      // inductor coil, glow intensity = |current|
      coil(ctx, indX0, top, indX1 - 6, 4, 8, C.ink, 3);
      ctx.fillText('L', (indX0+indX1)/2, top - 8);
      if(Math.abs(i) > 0.05){
        var gy = top;
        var grad = ctx.createRadialGradient((indX0+indX1)/2, gy, 2, (indX0+indX1)/2, gy, 26);
        grad.addColorStop(0, 'rgba(47,111,79,'+(Math.abs(i)*0.5).toFixed(2)+')');
        grad.addColorStop(1, 'rgba(47,111,79,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc((indX0+indX1)/2, gy, 26, 0, Math.PI*2); ctx.fill();
      }
      // current direction arrow along the top wire
      var ax = capX + (indX1-capX) * ((i+1)/2);
      ctx.fillStyle = C.accent;
      ctx.beginPath(); ctx.arc(ax, top, 4, 0, Math.PI*2); ctx.fill();

      // right: q(t) and i(t) sine traces
      var gx = lw + Wd*0.06, gw = Wd - gx - Wd*0.03, gy2 = pad, gh2 = Hd - 2*pad;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx, gy2 + gh2/2); ctx.lineTo(gx+gw, gy2+gh2/2); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      for(var k=0;k<=100;k++){
        var xx = gx + gw*k/100, ph = theta - Math.PI*2*(1 - k/100);
        var yy = gy2 + gh2/2 - Math.cos(ph)*gh2*0.42;
        if(k===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; ctx.setLineDash([3,3]);
      for(var k2=0;k2<=100;k2++){
        var xx2 = gx + gw*k2/100, ph2 = theta - Math.PI*2*(1 - k2/100);
        var yy2 = gy2 + gh2/2 - Math.sin(ph2)*gh2*0.42;
        if(k2===0) ctx.moveTo(xx2,yy2); else ctx.lineTo(xx2,yy2);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=C.soft; ctx.font='9px monospace'; ctx.textAlign='left';
      ctx.fillText('— charge q(t)', gx, gy2+gh2+14);
      ctx.fillText('–– current i(t)', gx+gw*0.5, gy2+gh2+14);

      if(readout) readout.textContent =
        'f = 1 / (2π√(LC)) = ' + fmtSI(freq(), 'Hz') + '  (L = 1 mH fixed, animation speed scaled for visibility)';
    }
    var eng = W.anim(box, function(dt){ theta += dt * 2.4; draw(); });
    if(playBtn) playBtn.addEventListener('click', function(){
      var r = eng.toggle(true); playBtn.textContent = r ? '⏸ Pause' : '▶ Play';
    });
    W.onRelayout(draw);
    draw();
    eng.start();
  });

  /* =========================================================
     4) "diode" — forward vs reverse bias: current flows one way
        only. Toggle the bias direction.
     ========================================================= */
  W0.register('diode', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var toggleBtn = box.querySelector('.btn.bias');
    var readout = box.querySelector('.readout');
    var forward = true;
    var dots = [0.05, 0.2, 0.35]; // t along left half only when blocked
    var rect = null, track = null;
    function layoutRect(){
      if(!W.fitCanvas(cv)) return false;
      var w = cv.__w, h = cv.__h, pad = Math.min(w,h)*0.2;
      rect = { x: pad, y: pad, w: w - 2*pad, h: h - 2*pad };
      track = makeTrack(rect);
      return true;
    }
    function draw(){
      if(!rect && !layoutRect()) return;
      ctx.clearRect(0, 0, cv.__w, cv.__h);
      ctx.strokeStyle = C.soft; ctx.lineWidth = 3; ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      battery(ctx, rect.x, rect.y + rect.h/2, C.ink);
      var midx = rect.x + rect.w/2, midy = rect.y;
      diodeGlyph(ctx, midx, midy, 14, C.accent, !forward);
      ctx.fillStyle = C.soft; ctx.font='11px monospace'; ctx.textAlign='center';
      ctx.fillText(forward ? 'forward bias' : 'reverse bias', midx, midy - 22);

      ctx.fillStyle = forward ? C.accent : 'rgba(176,70,31,.55)';
      for(var d=0; d<dots.length; d++){
        var p = track(dots[d]);
        ctx.beginPath(); ctx.arc(p.x,p.y,4.2,0,Math.PI*2); ctx.fill();
      }
      if(!forward){
        ctx.fillStyle='#b0461f'; ctx.font='10px monospace'; ctx.textAlign='center';
        ctx.fillText('blocked — depletion region widens', midx, midy + 26);
      }
      if(readout) readout.textContent = forward
        ? 'Forward bias collapses the depletion region past ≈ 0.7 V (Si) — current flows freely.'
        : 'Reverse bias widens the depletion region — only a tiny leakage current flows.';
    }
    var eng = W.anim(box, function(dt){
      if(forward){ for(var d=0; d<dots.length; d++) dots[d] = (dots[d] + dt*0.4) % 1; }
      draw();
    });
    if(toggleBtn) toggleBtn.addEventListener('click', function(){
      forward = !forward;
      toggleBtn.textContent = forward ? 'Flip to reverse bias' : 'Flip to forward bias';
      draw();
    });
    W.onRelayout(function(){ rect = null; draw(); });
    draw();
    eng.start();
  });

  /* =========================================================
     5) "triode" — a heated cathode emits electrons; the grid's
        voltage throttles how many reach the plate.
     ========================================================= */
  W0.register('triode', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elG = box.querySelector('.ctl-grid'), elGv = box.querySelector('.grid-out');
    var readout = box.querySelector('.readout');
    var rng = W.rng(11);
    var gridV = elG ? parseFloat(elG.value) : -3;
    function syncLabel(){ if(elGv) elGv.textContent = gridV.toFixed(1) + ' V'; }
    if(elG) elG.addEventListener('input', function(){ gridV = parseFloat(elG.value); syncLabel(); });
    syncLabel();

    var N = 22;
    var es = [];
    for(var k=0;k<N;k++) es.push({ x: rng(), y: rng(), pass: rng() });

    function passProb(){ return Math.max(0, Math.min(1, (gridV + 8) / 8)); }

    function draw(){
      if(!W.fitCanvas(cv)) return;
      var Wd = cv.__w, Hd = cv.__h;
      ctx.clearRect(0,0,Wd,Hd);
      var padY = Hd*0.14, cathX = Wd*0.1, gridX = Wd*0.5, plateX = Wd*0.86;
      // cathode
      ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(cathX, padY); ctx.lineTo(cathX, Hd-padY); ctx.stroke();
      ctx.fillStyle = C.soft; ctx.font='10px monospace'; ctx.textAlign='center';
      ctx.fillText('cathode', cathX, Hd-padY+14);
      // grid — vertical bars, spacing constant (voltage changes the field, not the bars)
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      for(var b=0;b<6;b++){
        var by = padY + (Hd-2*padY)*b/5;
        ctx.beginPath(); ctx.moveTo(gridX, by); ctx.lineTo(gridX, by+ (Hd-2*padY)/5*0.5); ctx.stroke();
      }
      ctx.fillText('grid', gridX, Hd-padY+14);
      ctx.fillText(gridV.toFixed(1)+' V', gridX, padY-8);
      // plate
      ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(plateX, padY); ctx.lineTo(plateX, Hd-padY); ctx.stroke();
      ctx.fillText('plate', plateX, Hd-padY+14);

      var p = passProb(), collected = 0;
      for(var i=0;i<es.length;i++){
        var e = es[i];
        var x = cathX + e.x * (plateX - cathX);
        var y = padY + e.y * (Hd - 2*padY);
        var blocked = e.pass > p && x > gridX - 8;
        ctx.fillStyle = blocked ? 'rgba(176,70,31,.5)' : C.accent;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
        if(!blocked && x >= plateX - 6) collected++;
      }
      // plate current meter
      var meterX = Wd - 14, meterH = (Hd-2*padY) * p;
      ctx.fillStyle = C.en; ctx.fillRect(meterX, Hd-padY-meterH, 6, meterH);
      ctx.strokeStyle = C.soft; ctx.lineWidth=1; ctx.strokeRect(meterX, padY, 6, Hd-2*padY);

      if(readout) readout.textContent =
        'Grid ' + gridV.toFixed(1) + ' V → plate current ≈ ' + Math.round(p*100) + '% of maximum. ' +
        'A small grid swing produces a much larger plate-current swing — that ratio is the tube’s gain.';
    }
    var eng = W.anim(box, function(dt){
      var speed = 0.15 + passProb()*0.35;
      for(var i=0;i<es.length;i++){
        var e = es[i];
        e.x += speed * dt;
        if(e.x > 1){ e.x = 0; e.y = rng(); e.pass = rng(); }
      }
      draw();
    });
    W.onRelayout(draw);
    draw();
    eng.start();
  });

  /* =========================================================
     6) "transistor" — an NPN transistor: a small base current
        opens a much larger emitter→collector current (β gain).
     ========================================================= */
  W0.register('transistor', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elB = box.querySelector('.ctl-base'), elBv = box.querySelector('.base-out');
    var readout = box.querySelector('.readout');
    var rng = W.rng(19);
    var beta = 50;
    var baseMA = elB ? parseFloat(elB.value) : 0.2; // mA
    function syncLabel(){ if(elBv) elBv.textContent = baseMA.toFixed(2) + ' mA'; }
    if(elB) elB.addEventListener('input', function(){ baseMA = parseFloat(elB.value); syncLabel(); });
    syncLabel();

    var N = 16, cs = [];
    for(var k=0;k<N;k++) cs.push({ y: rng() });

    function collectorMA(){ return Math.min(50, baseMA * beta); }
    function mode(){
      var ic = collectorMA();
      if(baseMA <= 0.001) return 'cutoff (open switch)';
      if(ic >= 49.9) return 'saturation (closed switch)';
      return 'active (amplifying)';
    }
    function draw(){
      if(!W.fitCanvas(cv)) return;
      var Wd = cv.__w, Hd = cv.__h;
      ctx.clearRect(0,0,Wd,Hd);
      var padY = Hd*0.12, colX = Wd*0.55, chanTop = padY, chanBot = Hd-padY;
      var openFrac = Math.max(0.04, Math.min(1, collectorMA()/50));
      var chanW = (Wd*0.22) * openFrac;
      // collector (top) to emitter (bottom) channel
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(colX, chanTop); ctx.lineTo(colX, chanTop+18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(colX, chanBot-18); ctx.lineTo(colX, chanBot); ctx.stroke();
      ctx.fillStyle = C.soft; ctx.font='10px monospace'; ctx.textAlign='center';
      ctx.fillText('collector', colX, chanTop-6);
      ctx.fillText('emitter', colX, chanBot+16);
      // the "valve" — a channel whose width shows how open the gate is
      ctx.fillStyle = 'rgba(47,111,79,.16)';
      ctx.fillRect(colX - chanW/2, chanTop+18, chanW, chanBot-chanTop-36);
      ctx.strokeStyle = C.en; ctx.lineWidth=2;
      ctx.strokeRect(colX - chanW/2, chanTop+18, chanW, chanBot-chanTop-36);
      // base, entering from the side
      var baseX = colX - Wd*0.28, baseY = (chanTop+chanBot)/2;
      ctx.strokeStyle = C.accent; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(colX - chanW/2 - 4, baseY); ctx.stroke();
      ctx.fillStyle = C.accent; ctx.textAlign='center';
      ctx.fillText('base', baseX, baseY-10);
      ctx.fillText(baseMA.toFixed(2)+' mA', baseX, baseY+16);

      // flowing dots through the open channel
      ctx.fillStyle = C.ink;
      for(var i=0;i<cs.length;i++){
        var e = cs[i];
        var y = chanTop+18 + e.y*(chanBot-chanTop-36);
        var x = colX + (Math.sin(e.y*6)*chanW*0.2);
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI*2); ctx.fill();
      }
      ctx.font='10px monospace'; ctx.fillStyle=C.soft; ctx.textAlign='left';
      ctx.fillText('Iᴄ = β × Iᴮ = ' + beta + ' × ' + baseMA.toFixed(2) + ' mA ≈ ' + collectorMA().toFixed(1) + ' mA', 6, Hd-6);

      if(readout) readout.textContent = 'Mode: ' + mode() + ' — collector current ≈ ' + collectorMA().toFixed(1) + ' mA';
    }
    var eng = W.anim(box, function(dt){
      var speed = 0.1 + Math.min(1, collectorMA()/50) * 0.6;
      for(var i=0;i<cs.length;i++){
        var e = cs[i];
        e.y += speed*dt;
        if(e.y > 1) e.y -= 1;
      }
      draw();
    });
    W.onRelayout(draw);
    draw();
    eng.start();
  });

  /* =========================================================
     7) "tuning" — sweep a tuned LC circuit's resonant peak across
        a dial of stations by dragging the tuning capacitor.
     ========================================================= */
  W0.register('tuning', function(box, W){
    var cv = box.querySelector('canvas'); if(!cv) return;
    var ctx = cv.getContext('2d');
    var C = W.theme();
    var elC = box.querySelector('.ctl-tune'), elCv = box.querySelector('.tune-out');
    var readout = box.querySelector('.readout');
    var stations = [ {f:560,name:'WKMT'}, {f:680,name:'KZRO'}, {f:800,name:'WABC'}, {f:980,name:'KJAX'}, {f:1200,name:'WNDL'} ];
    var Lh = 250e-6; // 250 uH fixed loopstick
    var Cf = elC ? parseFloat(elC.value) * 1e-12 : 300e-12;
    function fkHz(){ return 1/(2*Math.PI*Math.sqrt(Lh*Cf)) / 1000; }
    function syncLabel(){ if(elCv) elCv.textContent = fkHz().toFixed(0) + ' kHz'; }
    if(elC) elC.addEventListener('input', function(){ Cf = parseFloat(elC.value)*1e-12; syncLabel(); draw(); });
    syncLabel();

    function draw(){
      if(!W.fitCanvas(cv)) return;
      var Wd = cv.__w, Hd = cv.__h;
      ctx.clearRect(0,0,Wd,Hd);
      var padX = Wd*0.06, padY = Hd*0.16, gw = Wd-2*padX, gh = Hd-2*padY;
      var fmin = 500, fmax = 1300;
      function xOf(f){ return padX + gw * (f - fmin) / (fmax - fmin); }
      // resonance bell curve centered at current tuned frequency
      var f0 = fkHz(), Q = 18;
      ctx.strokeStyle = C.grid; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(padX, padY+gh); ctx.lineTo(padX+gw, padY+gh); ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle=C.accent; ctx.lineWidth=2.4;
      for(var i=0;i<=140;i++){
        var f = fmin + (fmax-fmin)*i/140;
        var x = (f - f0) / (f0 / Q);
        var resp = 1/Math.sqrt(1 + x*x);
        var px = xOf(f), py = padY + gh*(1-resp);
        if(i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.stroke();
      // station ticks
      var tuned = null;
      for(var s=0;s<stations.length;s++){
        var st = stations[s], sx = xOf(st.f);
        var near = Math.abs(st.f - f0) < 20;
        if(near) tuned = st;
        ctx.strokeStyle = near ? C.en : C.soft; ctx.lineWidth = near ? 3 : 1.4;
        ctx.beginPath(); ctx.moveTo(sx, padY+gh); ctx.lineTo(sx, padY+gh+10); ctx.stroke();
        ctx.fillStyle = near ? C.en : C.soft; ctx.font = (near?'bold ':'')+'10px monospace'; ctx.textAlign='center';
        ctx.fillText(st.name, sx, padY+gh+22);
      }
      // tuned cursor
      var cx = xOf(f0);
      ctx.strokeStyle = C.ink; ctx.lineWidth=1.6; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(cx, padY); ctx.lineTo(cx, padY+gh); ctx.stroke(); ctx.setLineDash([]);

      if(readout) readout.textContent = 'f = 1/(2π√(LC)) ≈ ' + f0.toFixed(0) + ' kHz' +
        (tuned ? '  —  ▶ tuned in: ' + tuned.name : '  —  (between stations)');
    }
    // Static tuning demo — no continuous animation needed; redraw on input/relayout.
    W.onRelayout(draw);
    draw();
  });

})();
