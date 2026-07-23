/* ============================================================
   em.js — self-contained 2D canvas widgets for the electromagnetism
   field guide. No dependencies, works from file://. Scans the DOM for
   widget placeholders and enhances them. A single rAF loop drives only
   the widgets on the currently-visible spread (IntersectionObserver),
   and honors prefers-reduced-motion.
   ============================================================ */
(function(){
  "use strict";
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var css = function(v, d){ var s = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return s || d; };
  var COL = {
    ink:  css('--ink','#2b2114'),
    soft: css('--ink-soft','#6f5c3e'),
    acc:  css('--accent','#8a2f22'),
    pos:  css('--pos','#b0362a'),
    neg:  css('--neg','#2f5c9e'),
    mag:  css('--mag','#7a3b8a'),
    good: css('--good','#3f6d3a'),
    warn: css('--warn','#a5561a'),
    wire: css('--wire','#6f5c3e'),
    grid: css('--gridline','rgba(138,47,34,.10)'),
    bg:   css('--canvas-bg','#fbf6e6'),
    edge: css('--edge-2','#c9b083')
  };

  // ---- animated-widget registry + shared loop ----------------
  var anim = [];
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
      var w = host.clientWidth || 460;
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
    // pointer position in CSS pixels within the canvas
    function ptr(ev){
      var r = cv.getBoundingClientRect();
      var e = (ev.touches && ev.touches[0]) || ev;
      return { x:(e.clientX-r.left), y:(e.clientY-r.top) };
    }
    return { cv:cv, ctx:ctx, fit:fit, ptr:ptr, W:function(){return cv.__w;}, H:function(){return cv.__h;} };
  }
  function fmt(n, d){ d = d==null?2:d; if(!isFinite(n)) return '∞';
    if(Math.abs(n)>=1e5||(Math.abs(n)>0&&Math.abs(n)<1e-3)) return n.toExponential(d);
    return n.toFixed(d); }
  function arrow(ctx,x1,y1,x2,y2,head){
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    var a=Math.atan2(y2-y1,x2-x1), h=head||5;
    ctx.beginPath(); ctx.moveTo(x2,y2);
    ctx.lineTo(x2-h*Math.cos(a-0.4), y2-h*Math.sin(a-0.4));
    ctx.lineTo(x2-h*Math.cos(a+0.4), y2-h*Math.sin(a+0.4));
    ctx.closePath(); ctx.fill();
  }
  function label(ctx,txt,x,y,col,align){
    ctx.fillStyle=col||COL.soft; ctx.font='11px ui-monospace,Menlo,monospace';
    ctx.textAlign=align||'center'; ctx.fillText(txt,x,y);
  }

  // =============================================================
  // 1) ELECTRIC FIELD — draggable charges paint the empty space
  // =============================================================
  function fieldWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.66);
    var row=document.createElement('div'); row.className='btnrow';
    row.innerHTML='<button class="btn" data-a="flip0">Flip left charge</button>'+
                  '<button class="btn" data-a="flip1">Flip right charge</button>'+
                  '<button class="btn primary" data-a="drop">Release a test charge</button>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(row); wrap.appendChild(read);
    // charges in fractional coords so they survive resize
    var Q=[{fx:0.34,fy:0.5,s:+1},{fx:0.66,fy:0.5,s:-1}];
    var testers=[]; // {x,y,vx,vy,life}
    var drag=-1;
    function px(q){ return {x:q.fx*c.W(), y:q.fy*c.H()}; }
    function fieldAt(x,y){
      var ex=0,ey=0;
      for(var i=0;i<Q.length;i++){ var p=px(Q[i]);
        var dx=x-p.x, dy=y-p.y, r2=dx*dx+dy*dy; if(r2<60) r2=60;
        var r=Math.sqrt(r2), k=Q[i].s*2600/r2;
        ex+=k*dx/r; ey+=k*dy/r;
      }
      return {ex:ex,ey:ey};
    }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      // sampled field arrows
      var step=Math.max(26,w/16);
      ctx.lineWidth=1.4;
      for(var x=step*0.6;x<w;x+=step){
        for(var y=step*0.6;y<h;y+=step){
          var f=fieldAt(x,y), m=Math.hypot(f.ex,f.ey); if(m<1e-3) continue;
          var len=Math.min(step*0.42, 6+m*3.0);
          var ux=f.ex/m, uy=f.ey/m;
          var t=Math.min(1,m/9);
          ctx.strokeStyle='rgba(111,92,62,'+(0.25+0.5*t)+')';
          ctx.fillStyle=ctx.strokeStyle;
          arrow(ctx, x-ux*len/2, y-uy*len/2, x+ux*len/2, y+uy*len/2, 4);
        }
      }
      // test charges tracing field lines
      for(var i=0;i<testers.length;i++){ var tp=testers[i];
        ctx.strokeStyle='rgba(63,109,58,.85)'; ctx.lineWidth=2;
        ctx.beginPath();
        for(var k=0;k<tp.tr.length;k++){ var s=tp.tr[k]; if(k)ctx.lineTo(s.x,s.y); else ctx.moveTo(s.x,s.y); }
        ctx.stroke();
        ctx.fillStyle=COL.good; ctx.beginPath(); ctx.arc(tp.x,tp.y,4,0,7); ctx.fill();
      }
      // the charges
      for(var j=0;j<Q.length;j++){ var p=px(Q[j]), col=Q[j].s>0?COL.pos:COL.neg;
        var g=ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,20);
        g.addColorStop(0,col); g.addColorStop(1, Q[j].s>0?'rgba(176,54,42,0)':'rgba(47,92,158,0)');
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,p.y,20,0,7); ctx.fill();
        ctx.fillStyle=col; ctx.beginPath(); ctx.arc(p.x,p.y,13,0,7); ctx.fill();
        ctx.fillStyle='#fff'; ctx.font='bold 16px Georgia,serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(Q[j].s>0?'+':'−', p.x, p.y+1); ctx.textBaseline='alphabetic';
      }
      read.innerHTML='Each little arrow is the force a <b>+1</b> test charge would feel there. '+
        'Drag either charge. Same signs&nbsp;→&nbsp;arrows flee each other; opposite&nbsp;→&nbsp;they stream across.';
    }
    function step(dt){
      for(var i=testers.length-1;i>=0;i--){ var tp=testers[i];
        var f=fieldAt(tp.x,tp.y);
        tp.vx+=f.ex*dt*8; tp.vy+=f.ey*dt*8;
        var sp=Math.hypot(tp.vx,tp.vy); if(sp>170){ tp.vx*=170/sp; tp.vy*=170/sp; }
        tp.x+=tp.vx*dt; tp.y+=tp.vy*dt;
        tp.tr.push({x:tp.x,y:tp.y}); if(tp.tr.length>90) tp.tr.shift();
        tp.life-=dt;
        // remove if it hits a charge or leaves
        var gone=tp.life<=0||tp.x<-20||tp.x>c.W()+20||tp.y<-20||tp.y>c.H()+20;
        for(var j=0;j<Q.length&&!gone;j++){ var p=px(Q[j]); if(Math.hypot(tp.x-p.x,tp.y-p.y)<14) gone=true; }
        if(gone) testers.splice(i,1);
      }
    }
    registerAnim(host,function(dt){ if(!reduce&&testers.length) step(dt); paint(); });
    // dragging
    c.cv.addEventListener('pointerdown',function(e){
      var m=c.ptr(e);
      for(var j=0;j<Q.length;j++){ var p=px(Q[j]); if(Math.hypot(m.x-p.x,m.y-p.y)<20){ drag=j; c.cv.setPointerCapture(e.pointerId); e.preventDefault(); return; } }
    });
    c.cv.addEventListener('pointermove',function(e){
      if(drag<0) return; var m=c.ptr(e);
      Q[drag].fx=Math.max(0.06,Math.min(0.94,m.x/c.W()));
      Q[drag].fy=Math.max(0.10,Math.min(0.90,m.y/c.H()));
      paint(); e.preventDefault();
    });
    c.cv.addEventListener('pointerup',function(e){ drag=-1; });
    row.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return;
      var a=b.dataset.a;
      if(a==='flip0'){ Q[0].s*=-1; }
      else if(a==='flip1'){ Q[1].s*=-1; }
      else if(a==='drop'){ for(var n=0;n<5;n++) testers.push({x:c.W()*0.06, y:c.H()*(0.2+0.15*n), vx:20, vy:0, tr:[], life:6}); }
      paint();
    });
    paint();
  }

  // =============================================================
  // 2) DRIFT VELOCITY — electrons crawl, the light is instant
  // =============================================================
  function driftWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.5);
    var row=document.createElement('div'); row.className='btnrow';
    row.innerHTML='<button class="btn primary" data-a="switch">Flip the switch</button>'+
                  '<button class="btn" data-a="reset">Reset</button>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(row); wrap.appendChild(read);
    var N=46, e=[], on=false, front=0, lit=0, tag=0, tagX0=0, elapsed=0;
    function reset(){
      e=[]; on=false; front=0; lit=0; elapsed=0;
      var w=c.W(),h=c.H();
      for(var i=0;i<N;i++){
        e.push({ x:0.08*w+Math.random()*0.84*w, y:0.30*h+Math.random()*0.44*h,
                 px:0, py:0 });
      }
      tag=0; tagX0=e[0].x;
    }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      var wireY0=0.26*h, wireY1=0.78*h;
      // the wire body
      ctx.fillStyle='rgba(120,90,40,.10)'; ctx.fillRect(0.06*w, wireY0, 0.88*w, wireY1-wireY0);
      ctx.strokeStyle=COL.edge; ctx.strokeRect(0.06*w, wireY0, 0.88*w, wireY1-wireY0);
      // lattice ions (+)
      ctx.fillStyle='rgba(165,86,26,.55)';
      var cols=10, rows=3;
      for(var ci=0;ci<cols;ci++) for(var ri=0;ri<rows;ri++){
        var ix=0.11*w+ci*(0.78*w/(cols-1)), iy=wireY0+(ri+0.5)*(wireY1-wireY0)/rows;
        ctx.beginPath(); ctx.arc(ix,iy,3,0,7); ctx.fill();
      }
      // battery on left, bulb on right
      label(ctx,'battery',0.03*w,0.5*h+4,COL.soft,'center');
      // signal front (sweeps the whole wire almost instantly)
      if(on && front<1){
        var fx=0.06*w+front*0.88*w;
        ctx.strokeStyle='rgba(138,47,34,.5)'; ctx.setLineDash([4,3]); ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(fx,wireY0-6); ctx.lineTo(fx,wireY1+6); ctx.stroke(); ctx.setLineDash([]);
        label(ctx,'field spreads → near light speed',fx,wireY0-10,COL.acc,'center');
      }
      // electrons
      for(var i=0;i<e.length;i++){
        ctx.fillStyle = (i===tag)? COL.acc : COL.neg;
        ctx.beginPath(); ctx.arc(e[i].x,e[i].y, i===tag?4:2.6, 0,7); ctx.fill();
      }
      // the tagged electron start marker
      ctx.strokeStyle='rgba(138,47,34,.4)'; ctx.setLineDash([2,3]);
      ctx.beginPath(); ctx.moveTo(tagX0,wireY0); ctx.lineTo(tagX0,wireY1); ctx.stroke(); ctx.setLineDash([]);
      // bulb
      var bx=0.965*w, by=0.5*h, glow=lit;
      var bg=ctx.createRadialGradient(bx,by,1,bx,by,26);
      bg.addColorStop(0,'rgba(255,214,90,'+(0.15+0.85*glow)+')'); bg.addColorStop(1,'rgba(255,214,90,0)');
      ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(bx,by,26,0,7); ctx.fill();
      ctx.fillStyle=glow>0.2?'#f4b41a':'rgba(120,90,40,.4)';
      ctx.beginPath(); ctx.arc(bx,by,7,0,7); ctx.fill();
      label(ctx,'lamp',bx,by+24,COL.soft,'center');
      var moved = (e[tag]? (e[tag].x-tagX0):0);
      read.innerHTML = on
        ? 'Lamp lit <b>the instant</b> you flipped the switch — yet the marked electron has drifted just '+
          '<b>'+Math.max(0,moved).toFixed(0)+' px</b>. Real copper: drift ≈ <b>1&nbsp;mm/s</b>, thermal jitter ≈ <b>10⁵&nbsp;m/s</b>, signal ≈ <b>c</b>.'
        : 'Off. Electrons still jitter <b>madly</b> in random directions (~10⁵ m/s) — but with no net drift, the lamp stays dark.';
    }
    function step(dt){
      var w=c.W(),h=c.H(), wireY0=0.27*h, wireY1=0.77*h;
      if(on){ front=Math.min(1, front + dt*2.2); lit=Math.min(1, lit+dt*4); }
      for(var i=0;i<e.length;i++){
        // fast random thermal jitter
        e[i].x += (Math.random()-0.5)*90*dt;
        e[i].y += (Math.random()-0.5)*90*dt;
        // slow steady drift once field has reached this electron
        if(on && (0.06*w+front*0.88*w) >= e[i].x) e[i].x += 7*dt; // small net drift
        // keep in the wire, wrap horizontally
        if(e[i].y<wireY0) e[i].y=wireY0; if(e[i].y>wireY1) e[i].y=wireY1;
        if(e[i].x>0.94*w){ e[i].x=0.08*w; if(i===tag){ tagX0=e[i].x; } }
        if(e[i].x<0.06*w) e[i].x=0.06*w;
      }
    }
    registerAnim(host,function(dt){ if(!reduce) step(dt); paint(); });
    row.addEventListener('click',function(ev){ var b=ev.target.closest('button'); if(!b) return;
      if(b.dataset.a==='switch'){ on=!on; if(!on){ front=0; lit=0; } tagX0=e[tag].x; }
      else { reset(); } paint(); });
    window.addEventListener('bookbank:relayout', function(){ reset(); });
    reset(); paint();
  }

  // =============================================================
  // 3) CYCLOTRON — magnetism curls a moving charge into a circle
  // =============================================================
  function cyclotronWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.62);
    var cB=document.createElement('label'); cB.className='ctl';
    cB.innerHTML='Field B <input type="range" min="20" max="100" value="55"> <span class="val"></span>';
    var cV=document.createElement('label'); cV.className='ctl';
    cV.innerHTML='Speed v <input type="range" min="20" max="100" value="60"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(cB); wrap.appendChild(cV); wrap.appendChild(read);
    var sB=cB.querySelector('input'), vB=cB.querySelector('.val');
    var sV=cV.querySelector('input'), vV=cV.querySelector('.val');
    var ang=0, trail=[];
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      // "B into the page" field of crosses
      ctx.strokeStyle='rgba(122,59,138,.45)'; ctx.lineWidth=1;
      var gs=Math.max(30,w/12);
      for(var x=gs/2;x<w;x+=gs) for(var y=gs/2;y<h;y+=gs){
        ctx.beginPath(); ctx.moveTo(x-3,y-3); ctx.lineTo(x+3,y+3); ctx.moveTo(x+3,y-3); ctx.lineTo(x-3,y+3); ctx.stroke();
      }
      label(ctx,'B into page ⊗', w*0.5, 16, COL.mag, 'center');
      var B=sB.value/100, v=sV.value/100;
      var R=Math.min(w,h)*0.42 * v / (0.3+B);   // r ∝ v / B
      R=Math.max(14, Math.min(R, Math.min(w,h)*0.46));
      var cx=w*0.5, cy=h*0.56;
      // the orbit circle
      ctx.strokeStyle='rgba(138,47,34,.28)'; ctx.setLineDash([4,4]); ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.stroke(); ctx.setLineDash([]);
      // particle
      var px=cx+Math.cos(ang)*R, py=cy+Math.sin(ang)*R;
      // trail
      trail.push({x:px,y:py}); if(trail.length>140) trail.shift();
      ctx.strokeStyle='rgba(176,54,42,.8)'; ctx.lineWidth=2; ctx.beginPath();
      for(var i=0;i<trail.length;i++){ var s=trail[i]; if(i)ctx.lineTo(s.x,s.y); else ctx.moveTo(s.x,s.y); }
      ctx.stroke();
      // velocity + force arrows
      var vx=-Math.sin(ang), vy=Math.cos(ang);           // tangential
      var fx=-Math.cos(ang), fy=-Math.sin(ang);          // centripetal (toward center)
      ctx.strokeStyle=COL.good; ctx.fillStyle=COL.good; ctx.lineWidth=2;
      arrow(ctx,px,py,px+vx*30,py+vy*30,5);
      ctx.strokeStyle=COL.acc; ctx.fillStyle=COL.acc;
      arrow(ctx,px,py,px+fx*24,py+fy*24,5);
      ctx.fillStyle=COL.neg; ctx.beginPath(); ctx.arc(px,py,6,0,7); ctx.fill();
      label(ctx,'v',px+vx*38,py+vy*38,COL.good,'center');
      label(ctx,'F',px+fx*32,py+fy*32,COL.acc,'center');
      vB.textContent=(sB.value*1|0)+'%'; vV.textContent=(sV.value*1|0)+'%';
      read.innerHTML='Radius <b>r = m&thinsp;v / q&thinsp;B</b> — grow v and the circle widens; grow B and it tightens. '+
        'But the <b>time per loop is fixed</b>: f = qB/2πm, independent of speed. That constancy is what makes a cyclotron work.';
    }
    function step(dt){
      var B=sB.value/100;
      ang += dt*(0.6+2.4*B);   // angular frequency ∝ B, independent of v
      if(ang>Math.PI*2) ang-=Math.PI*2;
    }
    registerAnim(host,function(dt){ if(!reduce) step(dt); paint(); });
    sB.addEventListener('input',function(){ trail=[]; paint(); });
    sV.addEventListener('input',function(){ trail=[]; paint(); });
    window.addEventListener('bookbank:relayout', paint);
    paint();
  }

  // =============================================================
  // 4) INDUCTION — move a magnet, make electricity (Faraday+Lenz)
  // =============================================================
  function inductionWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.56);
    var row=document.createElement('div'); row.className='btnrow';
    row.innerHTML='<button class="btn primary" data-a="osc">Auto-swing (a generator)</button>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(row); wrap.appendChild(read);
    var magFx=0.22, prevFx=0.22, vel=0, osc=false, phase=0, needle=0;
    var drag=false;
    function coilX(){ return c.W()*0.66; }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      var cyl=h*0.5, cxCoil=coilX();
      // coil (a stack of ellipse loops) + wires to galvanometer
      ctx.strokeStyle=COL.wire; ctx.lineWidth=2.4;
      for(var k=-4;k<=4;k++){
        ctx.beginPath(); ctx.ellipse(cxCoil+k*6, cyl, 12, h*0.22, 0, 0, 7); ctx.stroke();
      }
      // wires down to a galvanometer box
      var gx=w*0.9, gy=h*0.5;
      ctx.beginPath(); ctx.moveTo(cxCoil+24,cyl-h*0.19); ctx.lineTo(gx-24,gy-16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxCoil+24,cyl+h*0.19); ctx.lineTo(gx-24,gy+16); ctx.stroke();
      // galvanometer
      ctx.fillStyle='var'; ctx.strokeStyle=COL.edge; ctx.fillStyle='#fbf5e2';
      ctx.beginPath(); ctx.arc(gx,gy,20,0,7); ctx.fill(); ctx.stroke();
      var na=needle*0.9; // -1..1 → radians
      ctx.strokeStyle=(needle>0?COL.good:(needle<0?COL.acc:COL.soft)); ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(gx,gy+6); ctx.lineTo(gx+Math.sin(na)*15, gy+6-Math.cos(na)*22); ctx.stroke();
      label(ctx,'0',gx,gy+16,COL.soft,'center');
      label(ctx,'−',gx-16,gy-6,COL.acc,'center'); label(ctx,'+',gx+16,gy-6,COL.good,'center');
      // the bar magnet
      var mx=magFx*w, my=cyl, mw=w*0.13, mh=h*0.16;
      ctx.fillStyle=COL.acc; ctx.fillRect(mx-mw/2, my-mh/2, mw/2, mh);
      ctx.fillStyle=COL.neg; ctx.fillRect(mx, my-mh/2, mw/2, mh);
      ctx.fillStyle='#fff'; ctx.font='bold 12px Georgia'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('N', mx-mw/4, my); ctx.fillText('S', mx+mw/4, my); ctx.textBaseline='alphabetic';
      // motion hint
      if(Math.abs(vel)>0.02){ ctx.strokeStyle='rgba(111,92,62,.5)'; ctx.fillStyle='rgba(111,92,62,.5)'; ctx.lineWidth=1.5;
        var d=vel>0?1:-1; arrow(ctx, mx+d*mw*0.6, my-mh*0.6, mx+d*(mw*0.6+22), my-mh*0.6, 5); }
      // induced current glow around coil
      if(Math.abs(needle)>0.03){ ctx.strokeStyle=(needle>0?'rgba(63,109,58,':'rgba(138,47,34,')+(Math.min(0.7,Math.abs(needle)))+')';
        ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(cxCoil, cyl, 15, h*0.235, 0, 0, 7); ctx.stroke(); }
      label(ctx,'drag the magnet ↔', mx, my-mh*0.7-6, COL.soft,'center');
      var emf=Math.abs(needle);
      read.innerHTML = emf<0.04
        ? 'Magnet still → flux steady → <b>no emf</b>. A magnet just <i>sitting</i> in a coil does nothing.'
        : 'Moving! Changing flux induces emf: <b>&epsilon; = − dΦ/dt</b>. Faster or more turns → bigger deflection. '+
          'Reverse the motion and the needle flips — that’s <b>Lenz’s law</b>: the current opposes the change that made it.';
    }
    function step(dt){
      if(osc){ phase+=dt*1.6; magFx=0.30+0.16*Math.sin(phase); }
      vel=(magFx-prevFx)/Math.max(dt,1e-3);
      prevFx=magFx;
      // emf ∝ -dΦ/dt, peaked when magnet is near the coil
      var cxf=0.66, near=Math.exp(-Math.pow((magFx-cxf)/0.16,2));
      var target=-vel*near*3.2;
      needle += (Math.max(-1,Math.min(1,target))-needle)*Math.min(1,dt*10);
    }
    registerAnim(host,function(dt){ if(!reduce) step(dt); else { vel=0; } paint(); });
    c.cv.addEventListener('pointerdown',function(e){ var m=c.ptr(e);
      if(Math.abs(m.x-magFx*c.W())<c.W()*0.09){ drag=true; osc=false; c.cv.setPointerCapture(e.pointerId); e.preventDefault(); } });
    c.cv.addEventListener('pointermove',function(e){ if(!drag) return; var m=c.ptr(e);
      magFx=Math.max(0.08,Math.min(0.5, m.x/c.W())); e.preventDefault(); });
    c.cv.addEventListener('pointerup',function(){ drag=false; });
    row.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return;
      osc=!osc; b.classList.toggle('primary', !osc);
      b.textContent = osc? 'Stop swinging' : 'Auto-swing (a generator)'; });
    paint();
  }

  // =============================================================
  // 5) RESONANCE — tune an LCR circuit; a radio locks one station
  // =============================================================
  function resonanceWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.56);
    var cF=document.createElement('label'); cF.className='ctl';
    cF.innerHTML='Tune (drive frequency) <input type="range" min="0" max="100" value="30"> <span class="val"></span>';
    var cC=document.createElement('label'); cC.className='ctl';
    cC.innerHTML='Capacitor C <input type="range" min="20" max="100" value="55"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(cF); wrap.appendChild(cC); wrap.appendChild(read);
    var sF=cF.querySelector('input'), vF=cF.querySelector('.val');
    var sC=cC.querySelector('input'), vC=cC.querySelector('.val');
    var stations=[{f:0.22,n:'AM 720'},{f:0.5,n:'FM 88'},{f:0.78,n:'FM 102'}];
    var t=0;
    function f0(){ return 0.85 - (sC.value/100)*0.62; }   // resonant freq drops as C grows
    function amp(f){ var w0=f0(), Q=14; var x=(f-w0); return 1/Math.sqrt(1+Math.pow(Q*x/ (w0*0.5+0.15),2)); }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      var x0=w*0.08, x1=w*0.7, y0=h*0.14, y1=h*0.8;
      // axes
      ctx.strokeStyle=COL.edge; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x0,y1); ctx.lineTo(x1,y1); ctx.moveTo(x0,y0); ctx.lineTo(x0,y1); ctx.stroke();
      label(ctx,'current amplitude',x0-2,y0-4,COL.soft,'left');
      label(ctx,'drive frequency →',x1,y1+16,COL.soft,'right');
      // resonance curve
      ctx.strokeStyle=COL.acc; ctx.lineWidth=2.4; ctx.beginPath();
      for(var i=0;i<=120;i++){ var f=i/120; var a=amp(f); var X=x0+(x1-x0)*f, Y=y1-(y1-y0)*a; if(i)ctx.lineTo(X,Y); else ctx.moveTo(X,Y); }
      ctx.stroke();
      // f0 marker
      var fx=x0+(x1-x0)*f0(); ctx.strokeStyle='rgba(63,109,58,.6)'; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.moveTo(fx,y0); ctx.lineTo(fx,y1); ctx.stroke(); ctx.setLineDash([]);
      label(ctx,'f₀',fx,y0-2,COL.good,'center');
      // stations as ticks
      for(var s=0;s<stations.length;s++){ var sx=x0+(x1-x0)*stations[s].f;
        ctx.fillStyle=COL.soft; ctx.beginPath(); ctx.arc(sx,y1,3,0,7); ctx.fill();
        label(ctx,stations[s].n,sx,y1+14,COL.soft,'center');
      }
      // current tune position
      var f=sF.value/100, a=amp(f), X=x0+(x1-x0)*f, Y=y1-(y1-y0)*a;
      ctx.fillStyle=COL.neg; ctx.beginPath(); ctx.arc(X,Y,5,0,7); ctx.fill();
      ctx.strokeStyle='rgba(47,92,158,.4)'; ctx.beginPath(); ctx.moveTo(X,Y); ctx.lineTo(X,y1); ctx.stroke();
      // radio panel on right: signal bars whose height = amplitude
      var rx=w*0.78, rw=w*0.18, ry=h*0.2, rh=h*0.5;
      ctx.strokeStyle=COL.edge; ctx.strokeRect(rx,ry,rw,rh);
      var nb=7;
      for(var bnd=0;bnd<nb;bnd++){
        var bh=(rh-10)*a*(0.4+0.6*Math.abs(Math.sin(t*4+bnd)));
        ctx.fillStyle= a>0.7? COL.good : COL.warn;
        ctx.fillRect(rx+6+bnd*(rw-12)/nb, ry+rh-5-bh, (rw-12)/nb-3, bh);
      }
      // which station is nearest f0 & tuned?
      var best=null, bd=1;
      for(var s2=0;s2<stations.length;s2++){ var d=Math.abs(stations[s2].f-f); if(d<bd){ bd=d; best=stations[s2]; } }
      var locked = a>0.7 && Math.abs(f-f0())<0.04;
      label(ctx, locked? ('▶ '+best.n) : 'static…', rx+rw/2, ry-6, locked?COL.good:COL.soft,'center');
      vF.textContent=(sF.value*1|0)+'%'; vC.textContent=(sC.value*1|0)+'%';
      read.innerHTML = locked
        ? 'Locked on <b>'+best.n+'</b>! At <b>f = f₀ = 1/2π√(LC)</b> the circuit’s impedance is pure R — current peaks and one station comes through loud.'
        : 'Tune toward <b>f₀</b> (the dashed line). Off resonance the current is tiny and all you get is static. Change C to slide f₀ onto a different station.';
    }
    registerAnim(host,function(dt){ if(!reduce) t+=dt; paint(); });
    sF.addEventListener('input',paint); sC.addEventListener('input',paint);
    window.addEventListener('bookbank:relayout', paint);
    paint();
  }

  // =============================================================
  // 6) EM WAVE — E and B build each other, sailing off at c
  // =============================================================
  function emwaveWidget(host){
    var wrap=document.createElement('div'); host.appendChild(wrap);
    var c=makeCanvas(wrap,0.58);
    var cL=document.createElement('label'); cL.className='ctl';
    cL.innerHTML='Wavelength λ <input type="range" min="0" max="100" value="52"> <span class="val"></span>';
    var read=document.createElement('div'); read.className='readout';
    wrap.appendChild(cL); wrap.appendChild(read);
    var sL=cL.querySelector('input'), vL=cL.querySelector('.val');
    var phase=0;
    // spectrum bands: log10(wavelength m) from +4 (radio) to -12 (gamma)
    var bands=[
      {n:'Radio',   c:'#7a5a1e', lo:4,  hi:0.3},
      {n:'Microwave',c:'#a5561a',lo:0.3,hi:-3},
      {n:'Infrared',c:'#b0362a', lo:-3, hi:-6.2},
      {n:'Visible', c:'#3f6d3a', lo:-6.2,hi:-6.9},
      {n:'Ultraviolet',c:'#2f5c9e',lo:-6.9,hi:-8},
      {n:'X-ray',   c:'#7a3b8a', lo:-8, hi:-11},
      {n:'Gamma',   c:'#4a2a52', lo:-11,hi:-12}
    ];
    function logLam(){ return 4 - (sL.value/100)*16; }  // +4 → -12
    function bandFor(L){ for(var i=0;i<bands.length;i++){ if(L<=bands[i].lo && L>bands[i].hi) return bands[i]; } return bands[bands.length-1]; }
    function paint(){
      var ctx=c.ctx,w=c.W(),h=c.H(); ctx.clearRect(0,0,w,h);
      ctx.fillStyle=COL.bg; ctx.fillRect(0,0,w,h);
      var axisY=h*0.44, amp=h*0.22;
      // propagation axis
      ctx.strokeStyle=COL.edge; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,axisY); ctx.lineTo(w,axisY); ctx.stroke();
      ctx.strokeStyle=COL.soft; ctx.fillStyle=COL.soft; ctx.lineWidth=1.4;
      arrow(ctx, w-40, axisY, w-6, axisY, 6);
      label(ctx,'travels at c →', w-70, axisY-8, COL.soft,'right');
      // wavelength → screen wavelength
      var lp = 40 + (sL.value/100)*(w*0.5); // px per wave, visual
      var k = 2*Math.PI/lp;
      // E (electric) — vertical sine above/below the axis, red
      ctx.lineWidth=2; ctx.strokeStyle=COL.pos; ctx.beginPath();
      for(var x=0;x<=w;x+=3){ var y=axisY - Math.sin(k*x - phase)*amp; if(x)ctx.lineTo(x,y); else ctx.moveTo(x,y); }
      ctx.stroke();
      // B (magnetic) — in phase, perpendicular plane, drawn mirrored & foreshortened, blue
      ctx.strokeStyle=COL.neg; ctx.globalAlpha=0.85; ctx.beginPath();
      for(var x2=0;x2<=w;x2+=3){ var yb=axisY + Math.sin(k*x2 - phase)*amp*0.45; if(x2)ctx.lineTo(x2,yb); else ctx.moveTo(x2,yb); }
      ctx.stroke(); ctx.globalAlpha=1;
      // little E field bars
      ctx.strokeStyle='rgba(176,54,42,.5)'; ctx.fillStyle='rgba(176,54,42,.6)'; ctx.lineWidth=1;
      for(var xb=lp*0.25; xb<w; xb+=lp*0.5){ var yy=axisY - Math.sin(k*xb-phase)*amp; arrow(ctx,xb,axisY,xb,yy,4); }
      label(ctx,'E (electric)', 54, axisY-amp-4, COL.pos,'center');
      label(ctx,'B (magnetic)', 60, axisY+amp*0.6+14, COL.neg,'center');
      // spectrum bar along the bottom
      var by=h*0.86, bh=h*0.1, bx0=w*0.06, bx1=w*0.94;
      for(var i=0;i<bands.length;i++){
        var f0=(4-bands[i].lo)/16, f1=(4-bands[i].hi)/16;
        var X0=bx0+(bx1-bx0)*f0, X1=bx0+(bx1-bx0)*f1;
        ctx.fillStyle=bands[i].c; ctx.globalAlpha=0.8; ctx.fillRect(X0,by,X1-X0,bh); ctx.globalAlpha=1;
        if(X1-X0>34) label(ctx,bands[i].n,(X0+X1)/2,by+bh+11,COL.soft,'center');
      }
      var L=logLam(), band=bandFor(L);
      var mfrac=(4-L)/16, mx=bx0+(bx1-bx0)*mfrac;
      ctx.strokeStyle=COL.ink; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(mx,by-4); ctx.lineTo(mx,by+bh+2); ctx.stroke();
      // readouts
      var lamM=Math.pow(10,L), freq=3e8/lamM;
      vL.textContent=band.n;
      function human(m){ if(m>=1e3) return (m/1e3).toExponential(1)+' km'; if(m>=1) return m.toExponential(1)+' m';
        if(m>=1e-3) return (m*1e3).toExponential(1)+' mm'; if(m>=1e-9) return (m*1e9).toExponential(1)+' nm'; return m.toExponential(1)+' m'; }
      read.innerHTML='<b>'+band.n+'</b> — λ ≈ <b>'+human(lamM)+'</b>, f ≈ <b>'+freq.toExponential(1)+' Hz</b>. '+
        'Same wave, same speed <b>c = 1/√(μ₀ε₀) ≈ 3×10⁸ m/s</b> — only λ changes. Visible light is a sliver of the whole song.';
    }
    registerAnim(host,function(dt){ if(!reduce) phase+=dt*2.4; paint(); });
    sL.addEventListener('input',paint);
    window.addEventListener('bookbank:relayout', paint);
    paint();
  }

  // ---- wire up placeholders -----------------------------------
  var reg = { '.js-field':fieldWidget, '.js-drift':driftWidget, '.js-cyclotron':cyclotronWidget,
              '.js-induction':inductionWidget, '.js-resonance':resonanceWidget, '.js-emwave':emwaveWidget };
  Object.keys(reg).forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){ try{ reg[sel](el); }catch(e){ /* fail quiet */ } });
  });
})();
