/* ============================================================
   spacetime.js — self-contained 2D canvas widgets for the book.
   No dependencies, works from file://. Scans the DOM for widget
   placeholders and enhances them. A single rAF loop drives only
   the animated widgets that are on the currently-visible spread
   (IntersectionObserver), and honors prefers-reduced-motion.
   ============================================================ */
(function(){
  "use strict";
  var C = 299792458;                              // speed of light, m/s
  var G = 6.674e-11;                              // gravitational constant
  var Msun = 1.989e30;                            // kg
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = function(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || v; };
  var COL = {
    ink:  css('--ink')  || '#e8ecf5',
    soft: css('--ink-soft') || '#9aa6c4',
    acc:  css('--accent') || '#7cc4ff',
    star: css('--star') || '#cfe0ff',
    grid: 'rgba(124,196,255,.16)',
    warn: css('--warn') || '#f78c6c',
    mass: css('--mass') || '#ffd479',
    good: css('--str') || '#c3e88d',
    void: css('--void') || '#05070f',
    edge: css('--edge-2') || '#2c3d63'
  };

  // ---- animated-widget registry + shared loop ----------------
  var anim = [];   // {el, tick(dt), visible}
  function loop(t){
    loop.last = loop.last || t;
    var dt = Math.min(0.05, (t - loop.last)/1000); loop.last = t;
    for(var i=0;i<anim.length;i++){ if(anim[i].visible) anim[i].tick(dt); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function(es){
    es.forEach(function(e){
      for(var i=0;i<anim.length;i++) if(anim[i].el===e.target) anim[i].visible = e.isIntersecting && e.intersectionRatio>0;
    });
  }, { threshold:[0,0.01] }) : null;
  function registerAnim(el, tick){
    var rec = { el:el, tick:tick, visible:true };
    anim.push(rec);
    if(io) io.observe(el);
    return rec;
  }

  // ---- canvas helper: DPR-correct, sized to container --------
  function makeCanvas(host, aspect){
    var cv = document.createElement('canvas');
    host.appendChild(cv);
    var ctx = cv.getContext('2d');
    function fit(){
      var w = host.clientWidth || 480;
      var h = Math.round(w * (aspect || 0.5));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.style.width = w+'px'; cv.style.height = h+'px';
      cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      cv.__w = w; cv.__h = h;
    }
    fit();
    window.addEventListener('bookbank:relayout', fit);
    window.addEventListener('resize', fit);
    return { cv:cv, ctx:ctx, fit:fit, W:function(){return cv.__w;}, H:function(){return cv.__h;} };
  }
  function fmt(n, d){ d = d==null?2:d; if(!isFinite(n)) return '∞';
    if(Math.abs(n)>=1e5||(Math.abs(n)>0&&Math.abs(n)<1e-3)) return n.toExponential(d);
    return n.toFixed(d); }
  function starfield(ctx,w,h,seed){
    // deterministic faint stars (no Math.random reliance for repeatable look)
    var s = seed||7;
    for(var i=0;i<70;i++){
      s=(s*9301+49297)%233280; var x=(s/233280)*w;
      s=(s*9301+49297)%233280; var y=(s/233280)*h;
      s=(s*9301+49297)%233280; var a=0.15+(s/233280)*0.5;
      ctx.fillStyle='rgba(207,224,255,'+a.toFixed(2)+')';
      ctx.fillRect(x,y,1,1);
    }
  }

  // =============================================================
  // 1) MOVING LIGHT CLOCK — special-relativity time dilation
  // =============================================================
  function lightClock(host){
    var wrap = document.createElement('div');
    host.appendChild(wrap);
    var c = makeCanvas(wrap, 0.52);
    var ctrl = document.createElement('label'); ctrl.className='ctl';
    ctrl.innerHTML = 'Speed <input type="range" min="0" max="99" value="80"> <span class="val"></span>';
    var read = document.createElement('div'); read.className='readout';
    wrap.appendChild(ctrl); wrap.appendChild(read);
    var slider = ctrl.querySelector('input'), val = ctrl.querySelector('.val');
    var restBounce = 1.6;     // seconds per one up-down at rest (visual)
    var stationPhase=0, moverPhase=0, moverX=0, ticksS=0, ticksM=0;
    function beta(){ return slider.value/100; }
    function gamma(){ var b=beta(); return 1/Math.sqrt(1-b*b); }
    function paint(){
      var ctx=c.ctx, w=c.W(), h=c.H();
      ctx.clearRect(0,0,w,h); ctx.fillStyle=COL.void; ctx.fillRect(0,0,w,h); starfield(ctx,w,h,11);
      var b=beta(), g=gamma();
      val.textContent = (b*100|0)+'% c';
      // two clocks: left = your (rest) clock, moving band across = the flyer
      var clockW=Math.min(120,w*0.24), clockH=h*0.62, topPad=h*0.14;
      // -- rest clock (left, fixed) --
      drawClock(ctx, w*0.14, topPad, clockW, clockH, stationPhase, COL.acc, 'YOUR CLOCK', ticksS);
      // -- moving clock (slides L→R) --
      var laneL=w*0.42, laneR=w*0.92-clockW, mx=laneL+(laneR-laneL)*moverX;
      drawClock(ctx, mx, topPad, clockW, clockH, moverPhase, COL.mass, 'FLYER →', ticksM);
      // motion streaks
      ctx.strokeStyle='rgba(255,212,121,'+(0.05+0.25*b)+')';
      for(var s=0;s<6;s++){ var yy=topPad+clockH*(s+.5)/6; ctx.beginPath(); ctx.moveTo(mx-8-30*b,yy); ctx.lineTo(mx-8,yy); ctx.stroke(); }
      read.innerHTML='For every <b>1.00 s</b> on your clock, the flyer ticks <b>'+fmt(1/g,3)+' s</b> &nbsp;·&nbsp; γ = <b>'+fmt(g,3)+'</b>';
    }
    function drawClock(ctx,x,y,w,h,phase,col,label,ticks){
      // mirrors top & bottom, photon bouncing; phase 0..1 vertical position
      ctx.strokeStyle=col; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+w,y); ctx.stroke();            // top mirror
      ctx.beginPath(); ctx.moveTo(x,y+h); ctx.lineTo(x+w,y+h); ctx.stroke();        // bottom mirror
      ctx.strokeStyle='rgba(124,196,255,.14)'; ctx.lineWidth=1;
      ctx.strokeRect(x,y,w,h);
      var py = y + h*phase, px = x+w/2;
      // photon glow
      var grd=ctx.createRadialGradient(px,py,0,px,py,10);
      grd.addColorStop(0,'#fff'); grd.addColorStop(.4,col); grd.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(px,py,10,0,7); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(px,py,2.5,0,7); ctx.fill();
      ctx.fillStyle=COL.soft; ctx.font='10px ui-monospace,Menlo,monospace'; ctx.textAlign='center';
      ctx.fillText(label, x+w/2, y-8);
      ctx.fillStyle=col; ctx.fillText(ticks+' ticks', x+w/2, y+h+16);
    }
    var rec=registerAnim(host, function(dt){
      if(reduce){ paint(); return; }
      var g=gamma(), b=beta();
      stationPhase += dt/restBounce; if(stationPhase>=1){ stationPhase-=1; ticksS++; }
      moverPhase   += dt/(restBounce*g); if(moverPhase>=1){ moverPhase-=1; ticksM++; }  // slower by gamma
      moverX += dt*0.10*(0.3+b); if(moverX>1) moverX=0;
      paint();
    });
    slider.addEventListener('input', function(){ ticksS=ticksM=0; stationPhase=moverPhase=0; paint(); });
    paint();
  }

  // =============================================================
  // 2) LIGHT DEFLECTION — a ray bends past a mass (geodesic)
  // =============================================================
  function deflect(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.56);
    var ctrl=document.createElement('label'); ctrl.className='ctl';
    ctrl.innerHTML='Aim (impact parameter) <input type="range" min="6" max="90" value="26"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(ctrl); wrap.appendChild(read);
    var slider=ctrl.querySelector('input'), val=ctrl.querySelector('.val');
    function paint(){
      var ctx=c.ctx, w=c.W(), h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.void; ctx.fillRect(0,0,w,h); starfield(ctx,w,h,23);
      var cx=w*0.62, cy=h*0.52, Rmass=Math.max(10,w*0.03);
      // warped grid (denser lines near the mass — a cheap curvature cue)
      ctx.strokeStyle=COL.grid; ctx.lineWidth=1;
      var gs=Math.max(26,w/16);
      for(var gx=gs/2; gx<w; gx+=gs){
        ctx.beginPath();
        for(var y=0;y<=h;y+=6){ var dx=warp(gx,y,cx,cy); ctx.lineTo(gx+dx.x, y+dx.y); }
        ctx.stroke();
      }
      for(var gy=gs/2; gy<h; gy+=gs){
        ctx.beginPath();
        for(var x=0;x<=w;x+=6){ var dy=warp(x,gy,cx,cy); ctx.lineTo(x+dy.x, gy+dy.y); }
        ctx.stroke();
      }
      // the mass
      var grd=ctx.createRadialGradient(cx,cy,0,cx,cy,Rmass*2.4);
      grd.addColorStop(0,'#fff'); grd.addColorStop(.35,COL.mass); grd.addColorStop(1,'rgba(255,212,121,0)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,Rmass*2.4,0,7); ctx.fill();
      ctx.fillStyle=COL.mass; ctx.beginPath(); ctx.arc(cx,cy,Rmass,0,7); ctx.fill();
      // integrate a photon from the left, deflected by 1/r^2 toward the mass
      var b=+slider.value;
      var startY=cy-b;
      var px=0, py=startY, vx=1, vy=0, strength=Rmass*Rmass*6.0;
      ctx.strokeStyle=COL.acc; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(px,py);
      var minr=1e9, hit=false;
      for(var s=0;s<1400 && px<w+40;s++){
        var rx=px-cx, ry=py-cy, r2=rx*rx+ry*ry, r=Math.sqrt(r2);
        minr=Math.min(minr,r);
        if(r<Rmass){ hit=true; break; }
        var a=strength/r2; vx-=a*rx/r*0.02; vy-=a*ry/r*0.02;
        var m=Math.hypot(vx,vy); vx/=m; vy/=m;
        px+=vx*3; py+=vy*3; ctx.lineTo(px,py);
      }
      ctx.stroke();
      // straight reference (where it WOULD have gone)
      ctx.strokeStyle='rgba(154,166,196,.35)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,startY); ctx.lineTo(w,startY); ctx.stroke(); ctx.setLineDash([]);
      val.textContent = (hit?'captured':'grazes');
      read.innerHTML = hit
        ? 'The ray passed inside the mass and was <b>captured</b> — aim wider.'
        : 'Closest approach bends the ray by a visible angle. The dashed line is where flat space would have sent it — gravity is the difference.';
    }
    function warp(x,y,cx,cy){
      var dx=x-cx, dy=y-cy, r=Math.hypot(dx,dy)+1; var pull=Math.min(24, 2600/r);
      return { x:-dx/r*pull, y:-dy/r*pull };
    }
    slider.addEventListener('input', paint);
    // gentle idle so the grid feels alive is unnecessary; static repaint on demand
    window.addEventListener('bookbank:relayout', paint);
    paint();
  }

  // =============================================================
  // 3) NEWTON'S CANNONBALL — orbit is falling that keeps missing
  // =============================================================
  function cannon(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.72);
    var row=document.createElement('div'); row.className='btnrow';
    row.innerHTML='<button class="btn primary" data-a="fire">Fire</button>'+
                  '<button class="btn" data-a="clear">Clear trails</button>';
    var ctrl=document.createElement('label'); ctrl.className='ctl';
    ctrl.innerHTML='Muzzle speed <input type="range" min="20" max="100" value="55"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(ctrl); wrap.appendChild(row); wrap.appendChild(read);
    var slider=ctrl.querySelector('input'), val=ctrl.querySelector('.val');
    var balls=[], trails=[];
    function planet(){ var w=c.W(),h=c.H(); return { x:w/2, y:h*0.56, R:Math.min(w,h)*0.16, mu: (Math.min(w,h)*0.16)*(Math.min(w,h)*0.16)*0.9 }; }
    function fire(){
      var p=planet();
      var r0=p.R*1.15;                        // launch a little above the surface, clear of impact
      var vcirc=Math.sqrt(p.mu/r0);           // circular-orbit speed HERE — muzzle is a fraction of it
      // Muzzle slider (20..100%) → a fraction of circular speed, so the widget behaves
      // the same at any canvas size. Below ~0.96·vcirc the perigee dips into the planet
      // (it falls back); ~1·vcirc closes into an orbit; past √2·vcirc it escapes. Tuned so
      // slider ≲37 crashes, ~45–70 orbits (default 55 = a gentle ellipse), ≳86 escapes.
      var f=0.62+0.92*(slider.value/100);
      var sp=vcirc*f;
      // launch from the top of the planet, horizontally
      balls.push({ x:p.x, y:p.y-r0, vx:sp, vy:0, life:4200, tr:[] });
      if(balls.length>6) balls.shift();
    }
    function paint(){
      var ctx=c.ctx, w=c.W(), h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.void; ctx.fillRect(0,0,w,h); starfield(ctx,w,h,31);
      var p=planet();
      // faint influence rings
      ctx.strokeStyle='rgba(124,196,255,.06)';
      for(var rr=1;rr<=4;rr++){ ctx.beginPath(); ctx.arc(p.x,p.y,p.R*(1+rr*0.6),0,7); ctx.stroke(); }
      // planet
      var grd=ctx.createRadialGradient(p.x-p.R*0.3,p.y-p.R*0.3,p.R*0.1,p.x,p.y,p.R);
      grd.addColorStop(0,'#3a6ea5'); grd.addColorStop(1,'#0b1830');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(p.x,p.y,p.R,0,7); ctx.fill();
      ctx.strokeStyle='rgba(124,196,255,.35)'; ctx.lineWidth=1; ctx.stroke();
      // mountain + cannon
      ctx.fillStyle=COL.soft; ctx.beginPath();
      ctx.moveTo(p.x-10,p.y-p.R+8); ctx.lineTo(p.x,p.y-p.R-14); ctx.lineTo(p.x+10,p.y-p.R+8); ctx.fill();
      // trails
      for(var b=0;b<balls.length;b++){
        var ba=balls[b];
        ctx.strokeStyle='rgba(124,196,255,.5)'; ctx.lineWidth=1.4; ctx.beginPath();
        for(var i=0;i<ba.tr.length;i++){ var q=ba.tr[i]; if(i)ctx.lineTo(q.x,q.y); else ctx.moveTo(q.x,q.y); }
        ctx.stroke();
        // ball head
        ctx.fillStyle=COL.acc; ctx.beginPath(); ctx.arc(ba.x,ba.y,3,0,7); ctx.fill();
      }
      val.textContent=(+slider.value)+'%';
      read.innerHTML='Too slow → it falls back. Just right → it <b>orbits</b> — falling forever, forever missing the ground. Too fast → it escapes.';
    }
    function step(dt){
      var p=planet(); var sub=6, DT=0.16;                  // more, smaller steps → smooth orbits that close
      for(var k=0;k<sub;k++){
        for(var b=balls.length-1;b>=0;b--){
          var ba=balls[b];
          var dx=p.x-ba.x, dy=p.y-ba.y, r2=dx*dx+dy*dy, r=Math.sqrt(r2);
          if(r<p.R){ balls.splice(b,1); continue; }        // impact
          var a=p.mu/r2;
          ba.vx+=a*dx/r*DT; ba.vy+=a*dy/r*DT;              // kick
          ba.x+=ba.vx*DT; ba.y+=ba.vy*DT;                  // drift with the updated v → symplectic (energy-stable)
          if(k===0){ ba.tr.push({x:ba.x,y:ba.y}); if(ba.tr.length>1400) ba.tr.shift(); }
          if(--ba.life<=0 || ba.x<-80||ba.x>c.W()+80||ba.y<-80||ba.y>c.H()+80){ balls.splice(b,1); }
        }
      }
    }
    registerAnim(host, function(dt){ if(!reduce) step(dt); paint(); });
    row.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b)return;
      if(b.dataset.a==='fire') fire(); else balls.length=0; });
    slider.addEventListener('input', paint);
    fire(); paint();
  }

  // =============================================================
  // 4) ESCAPE VELOCITY & THE HORIZON — squeeze a mass to c
  // =============================================================
  function horizon(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.6);
    var ctrl=document.createElement('label'); ctrl.className='ctl';
    ctrl.innerHTML='Squeeze the Sun’s mass into radius <input type="range" min="0" max="100" value="30"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(ctrl); wrap.appendChild(read);
    var slider=ctrl.querySelector('input'), val=ctrl.querySelector('.val');
    // map slider 0..100 to a radius from Sun's real radius (6.957e8 m) down to 1 km, log
    var rMax=Math.log(6.957e8), rMin=Math.log(1000);
    function radius(){ var t=slider.value/100; return Math.exp(rMax-(rMax-rMin)*t); }
    function paint(){
      var ctx=c.ctx, w=c.W(), h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.void; ctx.fillRect(0,0,w,h); starfield(ctx,w,h,41);
      var r=radius();
      var vesc=Math.sqrt(2*G*Msun/r);
      var rs=2*G*Msun/(C*C);                     // 2953 m
      var ratio=Math.min(1, vesc/C);
      var cx=w*0.32, cy=h*0.5;
      // draw the compact object (visual radius shrinks as ratio grows)
      var vis=Math.max(6, (w*0.16)*(1-0.6*ratio));
      var isBH = vesc>=C;
      var grd=ctx.createRadialGradient(cx,cy,0,cx,cy,vis*1.6);
      if(isBH){ grd.addColorStop(0,'#000'); grd.addColorStop(.7,'#000'); grd.addColorStop(1,'rgba(124,196,255,.5)'); }
      else { grd.addColorStop(0,'#fff5da'); grd.addColorStop(.5,COL.mass); grd.addColorStop(1,'rgba(255,180,90,0)'); }
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(cx,cy,vis*1.6,0,7); ctx.fill();
      if(isBH){
        // photon ring
        ctx.strokeStyle=COL.acc; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(cx,cy,vis*1.05,0,7); ctx.stroke();
        ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(cx,cy,vis,0,7); ctx.fill();
      }
      // escape-velocity gauge (right side)
      var gx=w*0.6, gy0=h*0.2, gy1=h*0.8, gh=gy1-gy0;
      ctx.strokeStyle=COL.edge; ctx.strokeRect(gx,gy0,26,gh);
      var fill=Math.min(1,vesc/C);
      ctx.fillStyle=isBH?COL.warn:COL.acc; ctx.fillRect(gx,gy1-gh*fill,26,gh*fill);
      // c line
      ctx.strokeStyle=COL.warn; ctx.setLineDash([5,4]); ctx.beginPath(); ctx.moveTo(gx-6,gy0); ctx.lineTo(gx+32,gy0); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle=COL.warn; ctx.font='11px ui-monospace,Menlo,monospace'; ctx.textAlign='left';
      ctx.fillText('speed of light c', gx+34, gy0+4);
      ctx.fillStyle=COL.soft; ctx.fillText('escape', gx+34, gy1-gh*fill+4);
      val.textContent = fmtRadius(r);
      read.innerHTML = isBH
        ? 'Escape speed has reached <b>c</b>. Not even light gets out — you’ve made a <b>black hole</b>. Its horizon: r<sub>s</sub> = <b>'+fmtRadius(rs)+'</b>.'
        : 'Escape speed = <b>'+fmt(vesc/1000,0)+' km/s</b> ('+fmt(vesc/C*100,2)+'% of c). Keep squeezing — at r = '+fmtRadius(rs)+' it hits c.';
    }
    function fmtRadius(m){
      if(m>=1e6) return fmt(m/1e3,0)+' km';
      if(m>=1e3) return fmt(m/1e3,2)+' km';
      if(m>=1)   return fmt(m,0)+' m';
      return fmt(m*1000,1)+' mm';
    }
    slider.addEventListener('input', paint);
    window.addEventListener('bookbank:relayout', paint);
    paint();
  }

  // =============================================================
  // 5) GRAVITATIONAL TIME DILATION — a clock deep in a well
  // =============================================================
  function wellClock(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.6);
    var ctrl=document.createElement('label'); ctrl.className='ctl';
    ctrl.innerHTML='Lower the clock toward the horizon <input type="range" min="0" max="97" value="50"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(ctrl); wrap.appendChild(read);
    var slider=ctrl.querySelector('input'), val=ctrl.querySelector('.val');
    var farPhase=0, nearPhase=0, farT=0, nearT=0;
    function frac(){ // slider 0..97 → r from 6 r_s down to ~1.03 r_s
      var t=slider.value/100; var r_over_rs = 6 - (6-1.03)*t;
      return { rr:r_over_rs, factor:Math.sqrt(1 - 1/r_over_rs) };
    }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.void; ctx.fillRect(0,0,w,h); starfield(ctx,w,h,53);
      var f=frac();
      // the massive body + horizon at the left
      var bx=w*0.12, by=h*0.5, R=h*0.42;
      var grd=ctx.createRadialGradient(bx,by,0,bx,by,R*1.5);
      grd.addColorStop(0,'#000'); grd.addColorStop(.6,'#05070f'); grd.addColorStop(1,'rgba(124,196,255,.35)');
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(bx,by,R*1.5,0,7); ctx.fill();
      ctx.fillStyle='#000'; ctx.beginPath(); ctx.arc(bx,by,R*0.7,0,7); ctx.fill();
      ctx.strokeStyle=COL.acc; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(bx,by,R*0.7,0,7); ctx.stroke();
      ctx.fillStyle=COL.soft; ctx.font='10px ui-monospace,Menlo,monospace'; ctx.textAlign='center';
      ctx.fillText('horizon', bx, by+R*0.7+14);
      // far clock (top-right, safe)
      dial(ctx, w*0.72, h*0.28, 30, farPhase, COL.acc, 'FAR OBSERVER', farT);
      // near clock — position between body and far, per slider
      var nx = bx + R*0.7 + (w*0.72 - (bx+R*0.7))*(1-slider.value/100);
      dial(ctx, nx, h*0.66, 26, nearPhase, COL.mass, 'DEEP CLOCK', nearT);
      // redshifted light beam from near to far
      ctx.strokeStyle='rgba(247,140,108,'+(0.25+0.5*(1-f.factor))+')'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(nx,h*0.66); ctx.lineTo(w*0.72,h*0.28); ctx.stroke();
      val.textContent = 'r = '+fmt(f.rr,2)+' rₛ';
      read.innerHTML='The deep clock ticks at <b>'+fmt(f.factor,3)+'×</b> the far clock’s rate. At the horizon the factor → 0: to us far away, a falling clock <b>freezes</b>.';
    }
    function dial(ctx,x,y,rad,phase,col,label,ticks){
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,rad,0,7); ctx.stroke();
      var a=phase*Math.PI*2 - Math.PI/2;
      ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x,y);
      ctx.lineTo(x+Math.cos(a)*rad*0.8, y+Math.sin(a)*rad*0.8); ctx.stroke();
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(x,y,2.5,0,7); ctx.fill();
      ctx.fillStyle=COL.soft; ctx.font='10px ui-monospace,Menlo,monospace'; ctx.textAlign='center';
      ctx.fillText(label, x, y-rad-8);
      ctx.fillStyle=col; ctx.fillText(fmt(ticks,1)+'s', x, y+rad+14);
    }
    registerAnim(host, function(dt){
      if(reduce){ paint(); return; }
      var f=frac();
      farPhase+=dt/2; if(farPhase>=1){farPhase-=1;} farT+=dt;
      nearPhase+=dt/2*f.factor; if(nearPhase>=1){nearPhase-=1;} nearT+=dt*f.factor;
      paint();
    });
    slider.addEventListener('input', function(){ farT=nearT=0; farPhase=nearPhase=0; paint(); });
    paint();
  }

  // ---- wire up placeholders -----------------------------------
  var reg = { '.js-lightclock':lightClock, '.js-deflect':deflect, '.js-cannon':cannon,
              '.js-horizon':horizon, '.js-wellclock':wellClock };
  Object.keys(reg).forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){ try{ reg[sel](el); }catch(e){ /* fail quiet */ } });
  });
})();
