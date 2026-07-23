/* ============================================================
   calc.js — offline interactive engine for "Fun with Calculus".
   No network, no CDN. Scans the DOM on load for
   <div class="figbox" data-widget="..."> and wires up a
   canvas visualization. Every animation pauses offscreen and
   honours prefers-reduced-motion.  Palette matches book.css.
   ============================================================ */
(function(){
"use strict";

var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var COL = {
  ink:'#2a2216', soft:'#6a5a41', grid:'#d8c79f', axis:'#8a744a',
  curve:'#1f6f63', tangent:'#b23a1e', area:'#38598f', gold:'#a9822c',
  indigo:'#27406b', paper:'#faf3e2', ghost:'rgba(178,58,30,.28)'
};

/* ---------------- math function registry (name -> {f, df, F}) ----------------
   Kept as a whitelist so we never eval strings from the page. */
var FUNCS = {
  square:  { f:function(x){return x*x;},            df:function(x){return 2*x;},        F:function(x){return x*x*x/3;},      label:'x²' },
  cube:    { f:function(x){return x*x*x;},          df:function(x){return 3*x*x;},      F:function(x){return x*x*x*x/4;},    label:'x³' },
  cubic:   { f:function(x){return 0.15*x*x*x - 0.6*x;}, df:function(x){return 0.45*x*x - 0.6;}, F:function(x){return 0.0375*x*x*x*x - 0.3*x*x;}, label:'0.15x³ − 0.6x' },
  sin:     { f:Math.sin,                            df:Math.cos,                        F:function(x){return -Math.cos(x);}, label:'sin x' },
  cos:     { f:Math.cos,                            df:function(x){return -Math.sin(x);}, F:Math.sin,                        label:'cos x' },
  bump:    { f:function(x){return Math.exp(-x*x);}, df:function(x){return -2*x*Math.exp(-x*x);}, F:null,                     label:'e^(−x²)' },
  half:    { f:function(x){return 0.5*x*x;},        df:function(x){return x;},          F:function(x){return x*x*x/6;},      label:'½x²' }
};

/* ---------------- a reusable plotter ---------------- */
function Plot(canvas, opts){
  var ctx = canvas.getContext('2d');
  var W=0, H=0, dpr=1;
  var xr = opts.xr, yr = opts.yr;          // world ranges [min,max]
  var pad = opts.pad || {l:34,r:12,t:12,b:26};
  function fit(){
    var r = canvas.getBoundingClientRect();
    if(!r.width || !r.height) return false;
    dpr = Math.min(window.devicePixelRatio||1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return true;
  }
  function px(x){ return pad.l + (x-xr[0])/(xr[1]-xr[0])*(W-pad.l-pad.r); }
  function py(y){ return H-pad.b - (y-yr[0])/(yr[1]-yr[0])*(H-pad.t-pad.b); }
  function ix(sx){ return xr[0] + (sx-pad.l)/(W-pad.l-pad.r)*(xr[1]-xr[0]); }   // inverse: screen->world x
  function clear(){ ctx.clearRect(0,0,W,H); }
  function axes(o){
    o=o||{};
    ctx.lineWidth=1; ctx.strokeStyle=COL.grid; ctx.fillStyle=COL.soft;
    ctx.font='10px "SF Mono",Menlo,monospace'; ctx.textAlign='center'; ctx.textBaseline='top';
    var gx = o.gx || niceStep(xr), gy = o.gy || niceStep(yr);
    var x, y;
    for(x=Math.ceil(xr[0]/gx)*gx; x<=xr[1]+1e-9; x+=gx){
      ctx.globalAlpha=.55; ctx.beginPath(); ctx.moveTo(px(x),pad.t); ctx.lineTo(px(x),H-pad.b); ctx.stroke(); ctx.globalAlpha=1;
      if(o.labels!==false){ ctx.fillText(fmt(x), px(x), H-pad.b+4); }
    }
    ctx.textAlign='right'; ctx.textBaseline='middle';
    for(y=Math.ceil(yr[0]/gy)*gy; y<=yr[1]+1e-9; y+=gy){
      ctx.globalAlpha=.55; ctx.beginPath(); ctx.moveTo(pad.l,py(y)); ctx.lineTo(W-pad.r,py(y)); ctx.stroke(); ctx.globalAlpha=1;
      if(o.labels!==false && Math.abs(y)>1e-9){ ctx.fillText(fmt(y), pad.l-4, py(y)); }
    }
    // zero axes
    ctx.strokeStyle=COL.axis; ctx.lineWidth=1.4;
    if(yr[0]<0 && yr[1]>0){ ctx.beginPath(); ctx.moveTo(pad.l,py(0)); ctx.lineTo(W-pad.r,py(0)); ctx.stroke(); }
    if(xr[0]<0 && xr[1]>0){ ctx.beginPath(); ctx.moveTo(px(0),pad.t); ctx.lineTo(px(0),H-pad.b); ctx.stroke(); }
  }
  function curve(f, color, width){
    ctx.strokeStyle=color; ctx.lineWidth=width||2.4; ctx.lineJoin='round'; ctx.beginPath();
    var started=false, N=Math.max(120, Math.round(W)), i, x, y;
    for(i=0;i<=N;i++){
      x = xr[0] + (xr[1]-xr[0])*i/N; y=f(x);
      if(!isFinite(y) || y<yr[0]-6*(yr[1]-yr[0]) || y>yr[1]+6*(yr[1]-yr[0])){ started=false; continue; }
      var sy=py(y); sy=Math.max(-1e4,Math.min(1e4,sy));
      if(!started){ ctx.moveTo(px(x),sy); started=true; } else ctx.lineTo(px(x),sy);
    }
    ctx.stroke();
  }
  function seg(x1,y1,x2,y2,color,width,dash){
    ctx.strokeStyle=color; ctx.lineWidth=width||1.6; ctx.setLineDash(dash||[]);
    ctx.beginPath(); ctx.moveTo(px(x1),py(y1)); ctx.lineTo(px(x2),py(y2)); ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(x,y,color,r){
    ctx.fillStyle=color; ctx.beginPath(); ctx.arc(px(x),py(y),r||4.5,0,7); ctx.fill();
    ctx.lineWidth=1.5; ctx.strokeStyle='#fff'; ctx.stroke();
  }
  function label(x,y,text,color,dx,dy){
    ctx.fillStyle=color; ctx.font='11px "SF Mono",Menlo,monospace'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText(text, px(x)+(dx||6), py(y)+(dy||-8));
  }
  return {
    ctx:ctx, fit:fit, clear:clear, axes:axes, curve:curve, seg:seg, dot:dot, label:label,
    px:px, py:py, ix:ix, pad:pad, get W(){return W;}, get H(){return H;},
    setYR:function(v){yr=v;}, setXR:function(v){xr=v;}, get xr(){return xr;}, get yr(){return yr;}
  };
}
function niceStep(r){ var span=r[1]-r[0], raw=span/6, p=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)), n=raw/p;
  var s = n<1.5?1:n<3?2:n<7?5:10; return s*p; }
function fmt(v){ if(Math.abs(v)<1e-9) return '0'; var s=Math.abs(v)<10?(Math.round(v*100)/100):(Math.round(v*10)/10); return String(s); }

/* ---------------- animation governor (pause offscreen) ---------------- */
var rafs = [];
function animate(box, step){
  var running=false, id=null;
  function loop(){ step(); id=requestAnimationFrame(loop); }
  function start(){ if(running||REDUCE) return; running=true; loop(); }
  function stop(){ running=false; if(id) cancelAnimationFrame(id); id=null; }
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ if(box.__wantAnim) start(); } else stop(); });
  },{threshold:.12});
  io.observe(box);
  return { start:function(){ box.__wantAnim=true; start(); }, stop:function(){ box.__wantAnim=false; stop(); }, isRunning:function(){return running;} };
}

/* small helper to re-fit + redraw on the pager's relayout event */
function onRelayout(fn){ window.addEventListener('bookbank:relayout', fn); window.addEventListener('resize', fn); }

/* ============================================================
   WIDGET 1 — motion: an object moving along a line.
   Position s(t) = ½·g·t². Shows the moving stone, a distance
   track, and average speed over a shrinking window closing on
   the instantaneous speed v = g·t.
   ============================================================ */
function motionWidget(box){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var g = 9.8, T = 2.0;                 // fall for 2 seconds
  var P = new Plot(cv, { xr:[0,T], yr:[0, 0.5*g*T*T*1.05], pad:{l:38,r:14,t:14,b:26} });
  var out = box.querySelector('.readout');
  var t = 0, dir = 1;
  function s(tt){ return 0.5*g*tt*tt; }
  function v(tt){ return g*tt; }
  function draw(){
    if(!P.fit()) return;
    P.clear(); P.axes({});
    // the distance-time curve
    P.curve(s, COL.curve, 2.6);
    // a moving stone marker on the curve
    var st=s(t);
    // average speed over window [t-h, t]
    var h = Math.max(0.12, 0.6*(1 - t/T));   // window shrinks as it falls
    var t0=Math.max(0,t-h);
    P.seg(t0, s(t0), t, st, COL.tangent, 2, [6,4]);         // secant = average speed
    P.dot(t, st, COL.tangent, 5);
    P.dot(t0, s(t0), COL.gold, 3.5);
    // a vertical "ruler" on the left showing distance fallen
    var xr0 = 0.04*T;
    P.seg(xr0, 0, xr0, st, COL.area, 6);
    P.label(t, st, 't = '+t.toFixed(2)+'s', COL.tangent, 8, -10);
    if(out){
      var avg = (st - s(t0))/(t-t0 || 1);
      out.innerHTML = 'fallen <b>'+st.toFixed(2)+' m</b> &nbsp; average speed over last '+h.toFixed(2)+'s: <span class="g">'+avg.toFixed(2)+' m/s</span> &nbsp; instantaneous <b>'+v(t).toFixed(2)+' m/s</b>';
    }
  }
  var eng = animate(box, function(){
    t += dir*0.01*T*2;
    if(t>=T){ t=T; dir=-1; } if(t<=0){ t=0; dir=1; }
    draw();
  });
  var btn = box.querySelector('.btn.play');
  if(btn) btn.addEventListener('click', function(){
    if(eng.isRunning()){ eng.stop(); btn.textContent='▶ Play'; } else { eng.start(); btn.textContent='❚❚ Pause'; }
  });
  onRelayout(draw); draw();
  if(!REDUCE){ eng.start(); if(btn) btn.textContent='❚❚ Pause'; }
}

/* ============================================================
   WIDGET 2 — secant → tangent explorer.
   Plot f, fix a point a, slider for h. The secant through
   (a,f(a)) and (a+h,f(a+h)) sweeps toward the tangent as h→0;
   the difference quotient converges to f'(a).
   ============================================================ */
function secantWidget(box){
  var cv = box.querySelector('canvas'); if(!cv) return;
  var key = box.getAttribute('data-fn') || 'square';
  var F = FUNCS[key]; var a = parseFloat(box.getAttribute('data-a')||'1');
  var xr = [ -0.5, 3 ], yr=[-1, 9];
  if(key==='sin'){ xr=[-0.3,6.5]; yr=[-1.3,1.3]; a=1; }
  var P = new Plot(cv, { xr:xr, yr:yr, pad:{l:36,r:14,t:14,b:26} });
  var hslider = box.querySelector('input.h'); var out = box.querySelector('.readout');
  var h = parseFloat(hslider && hslider.value || '1');
  var anim=false, aid=null;
  function draw(){
    if(!P.fit()) return;
    P.clear(); P.axes({});
    P.curve(F.f, COL.curve, 2.6);
    var fa=F.f(a), fah=F.f(a+h);
    // secant, extended across the frame
    var m=(fah-fa)/h;
    var xL=P.xr[0], xR=P.xr[1];
    P.seg(xL, fa+m*(xL-a), xR, fa+m*(xR-a), COL.ghost, 1.4, []);
    P.seg(a, fa, a+h, fah, COL.tangent, 2.4, []);
    // the little run/rise triangle
    P.seg(a, fa, a+h, fa, COL.gold, 1.4, [4,3]);
    P.seg(a+h, fa, a+h, fah, COL.gold, 1.4, [4,3]);
    P.dot(a, fa, COL.indigo, 5); P.dot(a+h, fah, COL.tangent, 4.5);
    P.label(a, fa, 'a', COL.indigo, -14, -6);
    if(out){
      var dq=(fah-fa)/h, tru=F.df(a);
      out.innerHTML = 'h = <b>'+h.toFixed(3)+'</b> &nbsp; slope <span class="g">(f(a+h)−f(a))/h = '+dq.toFixed(3)+'</span> &nbsp;→&nbsp; f′(a) = <b>'+tru.toFixed(3)+'</b>';
    }
  }
  if(hslider) hslider.addEventListener('input', function(){ h=parseFloat(hslider.value); if(h<0.01)h=0.01; draw(); });
  var btn=box.querySelector('.btn.shrink');
  if(btn) btn.addEventListener('click', function(){
    if(aid){ cancelAnimationFrame(aid); aid=null; btn.textContent='Animate h → 0'; return; }
    btn.textContent='Reset';
    (function tick(){
      h*=0.94; if(h<0.01){ h=0.01; }
      if(hslider) hslider.value=h;
      draw();
      if(h>0.011) aid=requestAnimationFrame(tick); else { aid=null; btn.textContent='Animate h → 0'; }
    })();
  });
  // drag the point a
  cv.addEventListener('pointerdown', function(e){ move(e); cv.setPointerCapture(e.pointerId);
    cv.onpointermove=move; cv.onpointerup=function(){ cv.onpointermove=null; }; });
  function move(e){ var r=cv.getBoundingClientRect(); a=P.ix(e.clientX-r.left);
    a=Math.max(P.xr[0]+0.05, Math.min(P.xr[1]-h-0.05, a)); draw(); }
  onRelayout(draw); draw();
}

/* ============================================================
   WIDGET 3 — live grapher: f and its derivative f′ together.
   Pick a function; hover to read the slope; f′ is drawn beneath.
   ============================================================ */
function grapherWidget(box){
  var cv=box.querySelector('canvas'); if(!cv) return;
  var sel=box.querySelector('select'); var out=box.querySelector('.readout');
  var key = sel && sel.value || box.getAttribute('data-fn') || 'cubic';
  var hx=null;
  function rng(k){ if(k==='sin'||k==='cos') return {xr:[-6.5,6.5], yr:[-2.2,2.2]};
    if(k==='cube') return {xr:[-2.2,2.2], yr:[-4,4]};
    if(k==='bump') return {xr:[-3,3], yr:[-1.2,1.4]};
    return {xr:[-3,3], yr:[-3.2,3.6]}; }
  var P=new Plot(cv,{xr:rng(key).xr, yr:rng(key).yr, pad:{l:34,r:12,t:12,b:24}});
  function draw(){
    if(!P.fit()) return;
    var F=FUNCS[key]; var r=rng(key); P.setXR(r.xr); P.setYR(r.yr);
    P.clear(); P.axes({});
    P.curve(F.df, COL.tangent, 1.8);       // derivative underneath (thin)
    P.curve(F.f, COL.curve, 2.8);          // function on top
    if(hx!=null){
      var m=F.df(hx), fx=F.f(hx);
      var xL=r.xr[0], xR=r.xr[1];
      P.seg(xL, fx+m*(xL-hx), xR, fx+m*(xR-hx), COL.ghost,1.4,[]);   // tangent
      P.dot(hx,fx,COL.indigo,5);
      P.dot(hx,m,COL.tangent,4);            // the slope, plotted as height on f'
      P.seg(hx, fx, hx, m, COL.gold, 1, [3,3]);
    }
    if(out){ out.innerHTML = hx==null
      ? 'hover the graph — <span class="g">green</span> is f, <b>red</b> is its slope f′'
      : 'x = <b>'+hx.toFixed(2)+'</b> &nbsp; f(x) = <span class="g">'+FUNCS[key].f(hx).toFixed(2)+'</span> &nbsp; slope f′(x) = <b>'+FUNCS[key].df(hx).toFixed(2)+'</b>'; }
  }
  if(sel) sel.addEventListener('change', function(){ key=sel.value; hx=null; draw(); });
  cv.addEventListener('pointermove', function(e){ var rr=cv.getBoundingClientRect(); hx=P.ix(e.clientX-rr.left); draw(); });
  cv.addEventListener('pointerleave', function(){ hx=null; draw(); });
  onRelayout(draw); draw();
}

/* ============================================================
   WIDGET 4 — Riemann sums: area under f with n rectangles.
   Slider for n; toggle left / right / midpoint. The sum
   converges to the exact integral (shown when known).
   ============================================================ */
function riemannWidget(box){
  var cv=box.querySelector('canvas'); if(!cv) return;
  var key=box.getAttribute('data-fn')||'half';
  var A=parseFloat(box.getAttribute('data-a')||'0'), B=parseFloat(box.getAttribute('data-b')||'3');
  var F=FUNCS[key];
  var yrTop = Math.max(F.f(A),F.f(B),0.1)*1.15;
  var P=new Plot(cv,{xr:[A-0.2,B+0.2], yr:[0,yrTop], pad:{l:34,r:12,t:12,b:24}});
  var nsl=box.querySelector('input.n'); var out=box.querySelector('.readout');
  var mode='left';
  var n=parseInt(nsl && nsl.value || '6',10);
  function sum(){ var dx=(B-A)/n, s=0,i,x; for(i=0;i<n;i++){ x=A+i*dx; var xx = mode==='left'?x : mode==='right'?x+dx : x+dx/2; s+=F.f(xx)*dx; } return s; }
  function draw(){
    if(!P.fit()) return;
    P.clear(); P.axes({labels:true});
    // rectangles
    var dx=(B-A)/n, i, x;
    for(i=0;i<n;i++){
      x=A+i*dx; var xx = mode==='left'?x : mode==='right'?x+dx : x+dx/2; var hgt=F.f(xx);
      var x1=P.px(x), x2=P.px(x+dx), y0=P.py(0), y1=P.py(hgt);
      P.ctx.fillStyle='rgba(56,89,143,.22)'; P.ctx.fillRect(x1, y1, x2-x1, y0-y1);
      P.ctx.strokeStyle=COL.area; P.ctx.lineWidth=1; P.ctx.strokeRect(x1, y1, x2-x1, y0-y1);
      P.dot(xx, hgt, COL.tangent, 2.4);
    }
    P.curve(F.f, COL.curve, 2.8);
    if(out){
      var s=sum(); var exact = F.F ? (F.F(B)-F.F(A)) : null;
      out.innerHTML = 'n = <b>'+n+'</b> rectangles ('+mode+') &nbsp; sum = <span class="g">'+s.toFixed(4)+'</span>'
        + (exact!=null ? ' &nbsp;→&nbsp; exact area = <b>'+exact.toFixed(4)+'</b>' : '');
    }
  }
  if(nsl) nsl.addEventListener('input', function(){ n=parseInt(nsl.value,10); draw(); });
  box.querySelectorAll('.btn.mode').forEach(function(b){
    b.addEventListener('click', function(){
      mode=b.getAttribute('data-mode'); box.querySelectorAll('.btn.mode').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); draw();
    });
  });
  onRelayout(draw); draw();
}

/* ============================================================
   WIDGET 5 — the Fundamental Theorem: accumulation function.
   Top panel: f with area shaded up to a moving x.
   Bottom panel: A(x)=∫ f traced out; its slope A′(x)=f(x).
   ============================================================ */
function ftcWidget(box){
  var cv=box.querySelector('canvas'); if(!cv) return;
  var key=box.getAttribute('data-fn')||'sin';
  var F=FUNCS[key]; var A0=0, B=6.283;
  var out=box.querySelector('.readout');
  var cx=1.4;
  var ctx=cv.getContext('2d'); var W=0,H=0,dpr=1;
  function fit(){ var r=cv.getBoundingClientRect(); if(!r.width) return false; dpr=Math.min(window.devicePixelRatio||1,2);
    W=r.width; H=r.height; cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); return true; }
  function Acc(x){ // numeric ∫_{A0}^{x} f
    var N=120, s=0, dx=(x-A0)/N, i; for(i=0;i<N;i++){ s+=F.f(A0+(i+0.5)*dx)*dx; } return s; }
  function draw(){
    if(!fit()) return;
    ctx.clearRect(0,0,W,H);
    var midY=H*0.5;
    // shared x mapping
    var pl=36, pr=12; var pxu=function(x){ return pl+(x-A0)/(B-A0)*(W-pl-pr); };
    // ---- top: f(x) ----
    var yr1=[-1.4,1.4]; var t0=10, t1=midY-14;
    var py1=function(y){ return t1-(y-yr1[0])/(yr1[1]-yr1[0])*(t1-t0); };
    // shaded area up to cx
    ctx.beginPath(); ctx.moveTo(pxu(A0),py1(0));
    var i,x; for(i=0;i<=100;i++){ x=A0+(cx-A0)*i/100; ctx.lineTo(pxu(x),py1(F.f(x))); }
    ctx.lineTo(pxu(cx),py1(0)); ctx.closePath();
    ctx.fillStyle='rgba(56,89,143,.22)'; ctx.fill();
    // zero axis + curve
    ctx.strokeStyle=COL.axis; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(pl,py1(0)); ctx.lineTo(W-pr,py1(0)); ctx.stroke();
    ctx.strokeStyle=COL.curve; ctx.lineWidth=2.6; ctx.beginPath();
    for(i=0;i<=200;i++){ x=A0+(B-A0)*i/200; var sy=py1(F.f(x)); if(i===0)ctx.moveTo(pxu(x),sy); else ctx.lineTo(pxu(x),sy); }
    ctx.stroke();
    // moving x line + height dot
    ctx.strokeStyle=COL.tangent; ctx.lineWidth=1.4; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(pxu(cx),t0); ctx.lineTo(pxu(cx),H-8); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle=COL.tangent; ctx.beginPath(); ctx.arc(pxu(cx),py1(F.f(cx)),4,0,7); ctx.fill();
    ctx.fillStyle=COL.soft; ctx.font='10px "SF Mono",Menlo,monospace'; ctx.textAlign='left';
    ctx.fillText('f(x) — the rate', pl+2, t0+2);
    // ---- bottom: A(x) ----
    var yr2=[-2.4,2.4]; var b0=midY+12, b1=H-20;
    var py2=function(y){ return b1-(y-yr2[0])/(yr2[1]-yr2[0])*(b1-b0); };
    ctx.strokeStyle=COL.axis; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(pl,py2(0)); ctx.lineTo(W-pr,py2(0)); ctx.stroke();
    ctx.strokeStyle=COL.area; ctx.lineWidth=2.6; ctx.beginPath();
    for(i=0;i<=200;i++){ x=A0+(cx-A0)*i/200; var yy=py2(Acc(x)); if(i===0)ctx.moveTo(pxu(x),yy); else ctx.lineTo(pxu(x),yy); }
    ctx.stroke();
    // tangent to A at cx has slope f(cx)
    var Ac=Acc(cx), slope=F.f(cx);
    // draw tangent in screen space: convert slope (world dA/dx) to px
    var sx=pxu(cx), sy=py2(Ac);
    var dxw=1.0; var x2=cx+dxw; var y2s=py2(Ac+slope*dxw); var x1=cx-dxw; var y1s=py2(Ac-slope*dxw);
    ctx.strokeStyle=COL.tangent; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(pxu(x1),y1s); ctx.lineTo(pxu(x2),y2s); ctx.stroke();
    ctx.fillStyle=COL.area; ctx.beginPath(); ctx.arc(sx,sy,4,0,7); ctx.fill();
    ctx.fillStyle=COL.soft; ctx.fillText('A(x)=∫f — the total; its slope is f(x)', pl+2, b0+2);
    if(out){ out.innerHTML='x = <b>'+cx.toFixed(2)+'</b> &nbsp; area so far A(x) = <span class="g">'+Ac.toFixed(3)+'</span> &nbsp; slope of A = <b>'+slope.toFixed(3)+'</b> = f(x) ✓'; }
  }
  var dir=1;
  var eng=animate(box, function(){ cx+=dir*0.02; if(cx>=B){cx=B;dir=-1;} if(cx<=0.2){cx=0.2;dir=1;} draw(); });
  var sl=box.querySelector('input.x');
  if(sl){ sl.addEventListener('input', function(){ eng.stop(); var btn=box.querySelector('.btn.play'); if(btn)btn.textContent='▶ Sweep'; cx=parseFloat(sl.value); draw(); }); }
  var btn=box.querySelector('.btn.play');
  if(btn) btn.addEventListener('click', function(){ if(eng.isRunning()){ eng.stop(); btn.textContent='▶ Sweep'; } else { eng.start(); btn.textContent='❚❚ Pause'; } });
  onRelayout(draw); draw();
  if(!REDUCE){ eng.start(); if(btn) btn.textContent='❚❚ Pause'; }
}

/* ============================================================
   WIDGET 6 — Taylor / Maclaurin approximation.
   Approximate sin x (or e^x) by a growing polynomial; slider
   for the number of terms shows the fit spreading out.
   ============================================================ */
function taylorWidget(box){
  var cv=box.querySelector('canvas'); if(!cv) return;
  var key=box.getAttribute('data-fn')||'sin';
  var P=new Plot(cv,{xr:[-7,7], yr:[-2.4,2.4], pad:{l:34,r:12,t:12,b:24}});
  var ksl=box.querySelector('input.terms'); var out=box.querySelector('.readout');
  var terms=parseInt(ksl && ksl.value || '2',10);
  function fact(n){ var f=1,i; for(i=2;i<=n;i++) f*=i; return f; }
  function taylor(x){
    var s=0,i;
    if(key==='exp'){ for(i=0;i<terms;i++) s+=Math.pow(x,i)/fact(i); return s; }
    // sin: x - x^3/3! + x^5/5! ...
    for(i=0;i<terms;i++){ var p=2*i+1; s+=(i%2?-1:1)*Math.pow(x,p)/fact(p); }
    return s;
  }
  var truef = key==='exp'? Math.exp : Math.sin;
  function draw(){
    if(!P.fit()) return;
    if(key==='exp'){ P.setYR([-1,7]); } else { P.setYR([-2.4,2.4]); }
    P.clear(); P.axes({});
    P.curve(truef, COL.curve, 2.8);
    P.curve(taylor, COL.tangent, 2.2);
    if(out){ var eq = key==='exp'
        ? '1 + x + x²/2! + x³/3! + …'
        : 'x − x³/3! + x⁵/5! − …';
      out.innerHTML='<b>'+terms+'</b> term'+(terms>1?'s':'')+' &nbsp; <span class="g">'+eq+'</span> &nbsp; the red polynomial hugs the true curve farther out with every term'; }
  }
  if(ksl) ksl.addEventListener('input', function(){ terms=parseInt(ksl.value,10); draw(); });
  onRelayout(draw); draw();
}

/* ============================================================
   WIDGET 7 — gradient descent: roll downhill by −f′(x)·rate.
   The heart of how machines learn. Step, or run; slider for
   the learning rate; watch it converge (or overshoot).
   ============================================================ */
function descentWidget(box){
  var cv=box.querySelector('canvas'); if(!cv) return;
  var F=FUNCS[box.getAttribute('data-fn')||'cubic'];
  var P=new Plot(cv,{xr:[-3,3], yr:[-1.6,3.2], pad:{l:34,r:12,t:12,b:24}});
  var lrsl=box.querySelector('input.lr'); var out=box.querySelector('.readout');
  var lr=parseFloat(lrsl && lrsl.value || '0.15'); var x=2.4, steps=0;
  function draw(){
    if(!P.fit()) return;
    P.clear(); P.axes({});
    P.curve(F.f, COL.curve, 2.8);
    var g=F.df(x), fx=F.f(x);
    // tangent arrow showing the downhill direction
    var xL=P.xr[0], xR=P.xr[1];
    P.seg(xL, fx+g*(xL-x), xR, fx+g*(xR-x), COL.ghost,1.4,[]);
    P.dot(x,fx,COL.tangent,6);
    // arrow toward next x
    var nx=x-lr*g;
    P.seg(x, fx, nx, F.f(nx), COL.gold, 2, []);
    P.dot(nx, F.f(nx), COL.gold, 3);
    if(out){ out.innerHTML='step <b>'+steps+'</b> &nbsp; x = <span class="g">'+x.toFixed(3)+'</span> &nbsp; slope f′ = <b>'+g.toFixed(3)+'</b> &nbsp; rule: x ← x − '+lr.toFixed(2)+'·f′(x)'; }
  }
  function step(){ var g=F.df(x); x=x-lr*g; x=Math.max(P.xr[0]+0.05,Math.min(P.xr[1]-0.05,x)); steps++; draw(); }
  var eng=animate(box, function(){ step(); if(Math.abs(F.df(x))<0.002){ eng.stop(); var b=box.querySelector('.btn.run'); if(b)b.textContent='▶ Run'; } });
  var sb=box.querySelector('.btn.step'); if(sb) sb.addEventListener('click', function(){ eng.stop(); step(); });
  var rb=box.querySelector('.btn.run'); if(rb) rb.addEventListener('click', function(){ if(eng.isRunning()){ eng.stop(); rb.textContent='▶ Run'; } else { eng.start(); rb.textContent='❚❚ Pause'; } });
  var xb=box.querySelector('.btn.reset'); if(xb) xb.addEventListener('click', function(){ eng.stop(); x=2.4; steps=0; var b=box.querySelector('.btn.run'); if(b)b.textContent='▶ Run'; draw(); });
  if(lrsl) lrsl.addEventListener('input', function(){ lr=parseFloat(lrsl.value); draw(); });
  onRelayout(draw); draw();
}

/* ---------------- image-slot "copy prompt" (plain-browser convenience) ---------------- */
function wireCopyButtons(){
  document.querySelectorAll('.img-copy').forEach(function(btn){
    btn.addEventListener('click', function(){
      var slot=btn.closest('.img-slot'); var p=slot && slot.querySelector('.img-prompt');
      if(p && navigator.clipboard){ navigator.clipboard.writeText(p.textContent.trim()); btn.textContent='Copied ✓'; setTimeout(function(){btn.textContent='Copy prompt';},1400); }
    });
  });
}

/* ---------------- boot ---------------- */
var MAP = { motion:motionWidget, secant:secantWidget, grapher:grapherWidget,
  riemann:riemannWidget, ftc:ftcWidget, taylor:taylorWidget, descent:descentWidget };
function boot(){
  document.querySelectorAll('.figbox[data-widget]').forEach(function(box){
    var w=MAP[box.getAttribute('data-widget')];
    if(w){ try{ w(box); }catch(e){ /* keep the book readable even if one widget fails */ } }
  });
  wireCopyButtons();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
