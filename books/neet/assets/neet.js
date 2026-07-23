/* ============================================================
   neet.js — small, self-contained 2D interactive figures.
   Each widget is a <canvas data-demo="..."> scanned on load.
   Loops are gated by IntersectionObserver (pause offscreen)
   and honour prefers-reduced-motion (one static frame).
   No external dependencies; renders from file://.
   ============================================================ */
(function(){
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INK='#2b2114', SOFT='#6f5c3e', ACCENT='#8a2f22', GREEN='#3f6d3a',
      GOLD='#a5561a', RULE='#d8c49c', PAPER='#fbf5e6', EDGE='#cdb98d';

  function fit(cv){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth, h = cv.clientHeight;
    if(!w || !h) return null;
    cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
    var ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
    return {ctx:ctx, w:w, h:h};
  }

  // Run a widget with an animation gated on visibility.
  function mount(cv, draw, animated){
    var visible = false, raf = 0, t0 = null;
    function frame(ts){
      if(t0===null) t0=ts;
      var g = fit(cv); if(g){ draw(g.ctx, g.w, g.h, (ts-t0)/1000); }
      if(visible && animated && !REDUCED) raf = requestAnimationFrame(frame);
    }
    function once(){ var g = fit(cv); if(g) draw(g.ctx, g.w, g.h, 0); }
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        visible = e.isIntersecting;
        if(visible){ if(animated && !REDUCED){ if(!raf) raf = requestAnimationFrame(frame); } else once(); }
        else if(raf){ cancelAnimationFrame(raf); raf=0; t0=null; }
      });
    }, {threshold:0.15});
    io.observe(cv);
    window.addEventListener('resize', function(){ if(visible && (!animated||REDUCED)) once(); });
    once();
    return { redraw: once };
  }

  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  /* ---------------- Atwood machine ---------------- */
  function atwood(cv){
    var m1 = 4, m2 = 6;
    var wrap = cv.closest('.demo');
    var s1 = wrap && wrap.querySelector('[data-atwood="m1"]');
    var s2 = wrap && wrap.querySelector('[data-atwood="m2"]');
    var out = wrap && wrap.querySelector('[data-atwood="readout"]');
    var y = 0, v = 0, dir = 1, tPrev = 0;
    function accel(){ return (m2-m1)*9.8/(m1+m2); } // heavier side (m2) accelerates down
    function report(){
      var a = accel();
      if(out) out.textContent = 'a = (m₂−m₁)g / (m₁+m₂) = '+a.toFixed(2)+' m/s²   ( = g/'+ (a? (9.8/a).toFixed(1):'∞') +' )';
    }
    function draw(ctx,w,h,t){
      ctx.clearRect(0,0,w,h);
      var dt = t - tPrev; tPrev = t; if(dt>0.05) dt=0.016;
      var a = accel()/9.8; // scale down for gentle on-screen motion
      if(!REDUCED){ v += dir*a*40*dt; y += v*dt; if(Math.abs(y)>h*0.16){ dir*=-1; } }
      var cx=w/2, top=h*0.13, R=Math.min(w,h)*0.07;
      // pulley
      ctx.strokeStyle=EDGE; ctx.lineWidth=2;
      ctx.fillStyle='#e7d9b6'; ctx.beginPath(); ctx.arc(cx,top,R,0,7); ctx.fill(); ctx.stroke();
      ctx.fillStyle=SOFT; ctx.beginPath(); ctx.arc(cx,top,3,0,7); ctx.fill();
      // support
      ctx.strokeStyle=SOFT; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(cx-R-8,10); ctx.lineTo(cx+R+8,10); ctx.stroke();
      ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(cx,10); ctx.lineTo(cx,top-R); ctx.stroke();
      var lx=cx-R, rx=cx+R;
      var baseL=h*0.42 + y, baseR=h*0.42 - y;
      // ropes
      ctx.strokeStyle=INK; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(lx,top); ctx.lineTo(lx,baseL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx,top); ctx.lineTo(rx,baseR); ctx.stroke();
      function box(x,base,m,label,col){
        var s=18+m*3.2; ctx.fillStyle=col; ctx.strokeStyle=INK; ctx.lineWidth=1.4;
        roundRect(ctx,x-s/2,base,s,s,4); ctx.fill(); ctx.stroke();
        ctx.fillStyle='#fff'; ctx.font='600 12px "Iowan Old Style",Georgia,serif'; ctx.textAlign='center';
        ctx.fillText(label, x, base+s/2+4);
      }
      box(lx,baseL,m1,m1+' kg', '#7a5a1e');
      box(rx,baseR,m2,m2+' kg', ACCENT);
      // arrow on heavier side
      ctx.fillStyle=GREEN; ctx.font='11px Georgia';
      ctx.fillText(m2>m1?'↓ a':(m2<m1?'↑':''), rx+26, baseR+18);
    }
    var api = mount(cv, draw, true);
    function upd(){ m1=+s1.value; m2=+s2.value;
      wrap.querySelectorAll('[data-atwood-val]').forEach(function(el){
        var k=el.getAttribute('data-atwood-val'); el.textContent=(k==='m1'?m1:m2)+' kg'; });
      report(); }
    if(s1&&s2){ s1.addEventListener('input',upd); s2.addEventListener('input',upd); upd(); }
    report();
  }

  /* ---------------- Free fall / thrown-down ball (Q6) ---------------- */
  function freefall(cv){
    var wrap = cv.closest('.demo');
    var out = wrap && wrap.querySelector('[data-fall="readout"]');
    var u=20, g=10, H=300; // Q6 numbers
    var vf=Math.sqrt(u*u+2*g*H), T=(vf-u)/g;
    function draw(ctx,w,h,t){
      ctx.clearRect(0,0,w,h);
      var padL=44, padB=30, padT=16, padR=14;
      var gx=w-padL-padR, gy=h-padB-padT;
      // tower
      var towerX=padL+8, groundY=padT+gy;
      ctx.fillStyle='#e7d9b6'; ctx.strokeStyle=EDGE; ctx.lineWidth=1.5;
      ctx.fillRect(towerX-14,padT,20,gy); ctx.strokeRect(towerX-14,padT,20,gy);
      ctx.strokeStyle=SOFT; ctx.beginPath(); ctx.moveTo(padL-4,groundY); ctx.lineTo(w-padR,groundY); ctx.stroke();
      // animate the fall, loop
      var cycle=T+0.7; var tt=REDUCED? T*0.6 : (t % cycle);
      if(tt>T) tt=T;
      var s=u*tt+0.5*g*tt*tt; var frac=s/H;
      var by=padT+frac*gy;
      // trail
      ctx.strokeStyle='rgba(138,47,34,.25)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(towerX+16,padT); ctx.lineTo(towerX+16,by); ctx.stroke();
      // ball
      ctx.fillStyle=ACCENT; ctx.beginPath(); ctx.arc(towerX+16,by,7,0,7); ctx.fill();
      // velocity vector
      var vv=u+g*tt;
      ctx.strokeStyle=GREEN; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(towerX+16,by); ctx.lineTo(towerX+16,by+Math.min(vv*0.55,60)); ctx.stroke();
      // labels
      ctx.fillStyle=SOFT; ctx.font='11px Georgia'; ctx.textAlign='left';
      ctx.fillText('u = 20 m/s', towerX+26, padT+12);
      ctx.fillText('v = '+vv.toFixed(0)+' m/s', towerX+26, by+4);
      ctx.textAlign='right'; ctx.fillText('80 m/s', w-padR-2, groundY-4);
      ctx.textAlign='left'; ctx.fillText('h = 300 m', w-padR-92, padT+gy*0.5);
    }
    mount(cv, draw, true);
    if(out) out.textContent = 'v² = u² + 2gh → 80² = 20² + 2·10·h → h = 300 m';
  }

  /* ---------------- Double-slit interference (Q18) ---------------- */
  function interference(cv){
    var wrap = cv.closest('.demo');
    var sd = wrap && wrap.querySelector('[data-dsl="d"]');
    var sD = wrap && wrap.querySelector('[data-dsl="D"]');
    var out = wrap && wrap.querySelector('[data-dsl="readout"]');
    var d=1, D=1, lam=1; // relative units; fringe width β ∝ λD/d
    function draw(ctx,w,h){
      ctx.clearRect(0,0,w,h);
      var beta = 26*lam*D/d; // px per fringe, relative
      // intensity pattern as vertical bands on the right
      var sx=w*0.34, sw=w-sx-8, cy=h/2;
      for(var x=0;x<sw;x+=1){
        // integrate over screen height using cos^2 of position
      }
      for(var y=0;y<h;y+=1){
        var I=Math.pow(Math.cos(Math.PI*(y-cy)/beta),2);
        var shade=Math.round(30+I*180);
        ctx.fillStyle='rgb('+(shade)+','+(Math.round(shade*0.82))+','+(Math.round(shade*0.5))+')';
        ctx.fillRect(sx,y,sw,1);
      }
      // slit plate
      ctx.fillStyle='#e7d9b6'; ctx.fillRect(sx-14,0,8,h);
      ctx.fillStyle=INK;
      var gap=Math.max(4,d*4);
      ctx.clearRect(sx-14,cy-gap-3,8,3); // approximate slits (visual)
      // source rays
      ctx.strokeStyle='rgba(122,90,30,.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(10,cy); ctx.lineTo(sx-10,cy-gap); ctx.moveTo(10,cy); ctx.lineTo(sx-10,cy+gap); ctx.stroke();
      ctx.fillStyle=ACCENT; ctx.beginPath(); ctx.arc(10,cy,4,0,7); ctx.fill();
      // fringe-width bracket
      ctx.strokeStyle=GREEN; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(sx+sw-14,cy); ctx.lineTo(sx+sw-14,cy-beta); ctx.stroke();
      ctx.fillStyle=GREEN; ctx.font='11px Georgia'; ctx.textAlign='right';
      ctx.fillText('β', sx+sw-18, cy-beta/2+4);
      ctx.fillStyle=SOFT; ctx.textAlign='left';
      ctx.fillText('screen', sx+4, 14);
    }
    var api = mount(cv, draw, false);
    function upd(){ if(sd) d=+sd.value; if(sD) D=+sD.value;
      wrap.querySelectorAll('[data-dsl-val]').forEach(function(el){
        var k=el.getAttribute('data-dsl-val'); el.textContent=(k==='d'?d.toFixed(1):D.toFixed(1)); });
      var beta=(lam*D/d);
      if(out) out.textContent='β = λD/d  →  relative fringe width = '+beta.toFixed(2)+'×  (halve d & double D ⇒ ×4)';
      api.redraw(); }
    if(sd) sd.addEventListener('input',upd);
    if(sD) sD.addEventListener('input',upd);
    upd();
  }

  /* ---------------- Resistor colour-code decoder (Q7) ---------------- */
  var COLORS = [
    ['black','#1a1a1a',0],['brown','#7a3b1e',1],['red','#b02318',2],['orange','#c9631a',3],
    ['yellow','#d9a521',4],['green','#3f6d3a',5],['blue','#2b4d7a',6],['violet','#6b3b8a',7],
    ['grey','#7a7a72',8],['white','#efe7d4',9]
  ];
  var MULT = COLORS.concat([['gold','#c9a227',-1],['silver','#b9b9b9',-2]]);
  var TOL = [['brown','#7a3b1e','±1%'],['red','#b02318','±2%'],['gold','#c9a227','±5%'],['silver','#b9b9b9','±10%'],['none','#e7d9b6','±20%']];
  function resistor(root){
    var cv = root.querySelector('canvas');
    var selD1=root.querySelector('[data-rcc="d1"]'), selD2=root.querySelector('[data-rcc="d2"]'),
        selM=root.querySelector('[data-rcc="mult"]'), selT=root.querySelector('[data-rcc="tol"]');
    var out=root.querySelector('[data-rcc="readout"]');
    function fillSel(sel,arr,def){ arr.forEach(function(c,ix){ var o=document.createElement('option'); o.value=ix; o.textContent=c[0]; sel.appendChild(o); }); sel.value=def; }
    fillSel(selD1,COLORS,4); fillSel(selD2,COLORS,7); fillSel(selM,MULT,1); fillSel(selT,TOL,2);
    function draw(){
      var g=fit(cv); if(!g) return; var ctx=g.ctx,w=g.w,h=g.h; ctx.clearRect(0,0,w,h);
      var bx=w*0.16, bw=w*0.68, by=h*0.34, bh=h*0.32;
      // leads
      ctx.strokeStyle=SOFT; ctx.lineWidth=3; ctx.beginPath();
      ctx.moveTo(6,by+bh/2); ctx.lineTo(bx,by+bh/2); ctx.moveTo(bx+bw,by+bh/2); ctx.lineTo(w-6,by+bh/2); ctx.stroke();
      // body
      ctx.fillStyle='#d8c9a0'; ctx.strokeStyle=EDGE; ctx.lineWidth=1.5;
      roundRect(ctx,bx,by,bw,bh,10); ctx.fill(); ctx.stroke();
      var bands=[COLORS[+selD1.value], COLORS[+selD2.value], MULT[+selM.value], TOL[+selT.value]];
      var pos=[0.16,0.32,0.48,0.78];
      bands.forEach(function(c,ix){ ctx.fillStyle=c[1]; var x=bx+bw*pos[ix]; ctx.fillRect(x,by,bw*0.06,bh); });
    }
    function compute(){
      var d1=COLORS[+selD1.value][2], d2=COLORS[+selD2.value][2], m=MULT[+selM.value][2], tol=TOL[+selT.value][2];
      var val=(d1*10+d2)*Math.pow(10,m);
      var disp = val>=1e6? (val/1e6)+' MΩ' : val>=1e3? (val/1e3)+' kΩ' : val+' Ω';
      out.textContent = disp+', '+tol;
      draw();
    }
    [selD1,selD2,selM,selT].forEach(function(s){ s.addEventListener('change',compute); });
    var io=new IntersectionObserver(function(es){ es.forEach(function(e){ if(e.isIntersecting) draw(); }); },{threshold:0.1});
    io.observe(cv); window.addEventListener('resize',draw);
    compute();
  }

  function boot(){
    document.querySelectorAll('canvas[data-demo="atwood"]').forEach(atwood);
    document.querySelectorAll('canvas[data-demo="freefall"]').forEach(freefall);
    document.querySelectorAll('canvas[data-demo="interference"]').forEach(interference);
    document.querySelectorAll('[data-rcc-root]').forEach(resistor);
    // copy-prompt buttons on image slots
    document.querySelectorAll('.img-copy').forEach(function(b){
      b.addEventListener('click', function(){
        var p=b.closest('.img-slot').querySelector('.img-prompt');
        if(p&&navigator.clipboard){ navigator.clipboard.writeText(p.textContent.trim()); b.textContent='Copied ✓'; setTimeout(function(){b.textContent='Copy prompt';},1400); }
      });
    });
  }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
