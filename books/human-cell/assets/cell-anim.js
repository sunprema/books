/* cell-anim.js — tiny self-contained 2D canvas engine for the book's figures.
   Each <canvas data-anim="name"> gets a draw function below.
   Rules honored: size to the figure (not window), pause when offscreen,
   honor prefers-reduced-motion (one static frame), re-fit on pager relayout. */
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ANIM = {}; // name -> function(ctx, w, h, t)  (t in seconds)

  /* palette (mirrors book.css) */
  var C = {
    paper:'#fffdf7', ink:'#21303a', faint:'#7d8a91',
    membrane:'#0e9aa7', membraneD:'#0b7a85', head:'#e5a11f', tail:'#caa76a',
    mito:'#e5643b', o2:'#3f7fd4', co2:'#7ea63c', charged:'#c1497f', protein:'#6d5bd0',
    tubule:'#3f7fd4', tubuleD:'#2c62a8', cargo:'#e5643b', motor:'#6d5bd0'
  };

  /* ---------- 1) MEMBRANE: selective permeability ---------- */
  ANIM.membrane = function(ctx, w, h, t){
    ctx.clearRect(0,0,w,h);
    var midY = h*0.5, amp = h*0.014, headR = Math.max(4, w*0.011);
    var n = Math.max(14, Math.floor(w/26));
    var tailLen = h*0.12;
    // two leaflets of phospholipids, heads facing out, tails facing the middle
    for(var side=0; side<2; side++){
      var dir = side===0 ? -1 : 1;               // top leaflet up, bottom down
      var baseY = midY + dir*tailLen*0.5;
      for(var k=0;k<n;k++){
        var x = (k+0.5)*(w/n);
        var jig = Math.sin(t*1.6 + k*0.7 + side*1.3)*amp;
        var hy = baseY + dir*tailLen*0.5 + jig;   // head (outer)
        var ty = baseY - dir*tailLen*0.5 + jig;   // tail tip (inner)
        // tails (two wavy lines)
        ctx.strokeStyle = C.tail; ctx.lineWidth = Math.max(1.4, w*0.0016);
        for(var tw=-1; tw<=1; tw+=2){
          ctx.beginPath();
          ctx.moveTo(x, hy);
          ctx.quadraticCurveTo(x+tw*headR*0.6, (hy+ty)/2, x, ty);
          ctx.stroke();
        }
        // head
        ctx.beginPath(); ctx.arc(x, hy, headR, 0, Math.PI*2);
        ctx.fillStyle = C.head; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,80,20,.35)'; ctx.stroke();
      }
    }
    // a channel protein around x = 0.7w
    var px = w*0.72, pw = w*0.05;
    ctx.fillStyle = C.protein;
    roundRect(ctx, px-pw/2, midY-tailLen*0.85, pw, tailLen*1.7, 8); ctx.fill();
    ctx.fillStyle = C.paper;
    roundRect(ctx, px-pw*0.16, midY-tailLen*0.85, pw*0.32, tailLen*1.7, 4); ctx.fill();

    // particles: O2 (small, crosses freely), charged ion (bounces), glucose via channel
    drawParticle(ctx, C.o2, particleY(t,0.0,h,midY,true),  w*0.20, headR*0.9, 'O₂');
    drawParticle(ctx, C.co2,particleY(t,0.5,h,midY,true),  w*0.36, headR*0.9, 'CO₂');
    // charged ion: approaches from top, bounces back (never crosses)
    var by = bounceY(t, h, midY, tailLen);
    drawParticle(ctx, C.charged, by, w*0.50, headR*1.2, 'Na⁺');
    // glucose through the channel
    drawParticle(ctx, C.mito, particleY(t,0.25,h,midY,true), px, headR*1.15, 'glu');

    // labels
    ctx.fillStyle = C.faint; ctx.font = (Math.max(10,w*0.016))+'px -apple-system,sans-serif';
    ctx.textAlign='left';
    ctx.fillText('outside the cell', w*0.02, h*0.09);
    ctx.fillText('inside the cell',  w*0.02, h*0.95);
  };
  function particleY(t, phase, h, midY, cross){
    var p = ((t*0.28 + phase) % 1);             // 0..1 top->bottom
    return h*0.06 + p*(h*0.88);
  }
  function bounceY(t, h, midY, tailLen){
    var p = (t*0.5) % 2;                          // triangle wave 0..2
    var tri = p<1 ? p : 2-p;                      // 0..1..0
    var top = h*0.06, limit = midY - tailLen*0.95;
    return top + tri*(limit-top);
  }
  function drawParticle(ctx, col, y, x, r, label){
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold '+(r*0.9)+'px -apple-system,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, x, y);
    ctx.textBaseline='alphabetic';
  }

  /* ---------- 2) KINESIN: motor protein walking a microtubule ---------- */
  ANIM.kinesin = function(ctx, w, h, t){
    ctx.clearRect(0,0,w,h);
    var trackY = h*0.66;
    // microtubule as a row of tubulin beads (α/β dimers alternating)
    var bead = Math.max(7, w*0.016), gap = bead*2.05, n = Math.ceil(w/gap)+2;
    for(var k=0;k<n;k++){
      var x = k*gap + bead;
      ctx.beginPath(); ctx.arc(x, trackY, bead, 0, Math.PI*2);
      ctx.fillStyle = (k%2===0)? C.tubule : C.tubuleD; ctx.fill();
    }
    ctx.fillStyle=C.faint; ctx.font=(Math.max(10,w*0.015))+'px -apple-system,sans-serif';
    ctx.textAlign='left'; ctx.fillText('microtubule  (minus −)', w*0.02, trackY+bead*2.6);
    ctx.textAlign='right'; ctx.fillText('(+ plus)  →', w*0.98, trackY+bead*2.6);
    ctx.textAlign='left';

    // motor walks left->right, hand-over-hand; cargo vesicle bobs above
    var speed = w*0.075;                          // px/s
    var travel = (t*speed) % (w + w*0.3);
    var mx = -w*0.15 + travel;
    var step = gap;                               // one dimer per step
    var phase = (t*2.0) % 1;                       // gait cycle
    var stanceY = trackY - bead - Math.max(3,h*0.008);
    // two feet: one planted, one swinging forward
    var footBack = mx - step*0.5;
    var footFront = mx + step*0.5;
    var swing = Math.sin(phase*Math.PI)*step*0.5;
    var lift  = Math.sin(phase*Math.PI)*bead*1.4;
    // alternate which foot swings
    var evenStep = (Math.floor(t*2.0)%2)===0;
    var fA = evenStep ? footBack : footBack;
    // hub of the motor
    var hubX = mx, hubY = stanceY - bead*2.4;
    // legs (necks)
    ctx.strokeStyle=C.motor; ctx.lineWidth=Math.max(2.5,w*0.004); ctx.lineCap='round';
    var swingFootX = (evenStep? footBack : footFront) + (evenStep? swing : -swing);
    var swingFootY = stanceY - (evenStep?lift:lift);
    var plantFootX = evenStep? footFront : footBack;
    line(ctx, hubX, hubY, plantFootX, stanceY);
    line(ctx, hubX, hubY, swingFootX, swingFootY);
    // feet (motor domains)
    foot(ctx, plantFootX, stanceY, bead*0.9, C.motor);
    foot(ctx, swingFootX, swingFootY, bead*0.9, C.motor);
    // hub
    ctx.beginPath(); ctx.arc(hubX,hubY,bead*0.85,0,Math.PI*2); ctx.fillStyle=C.motor; ctx.fill();
    // stalk up to cargo
    var cargoX=hubX, cargoY=hubY - h*0.16 + Math.sin(t*3)*h*0.01, cr=Math.max(16,w*0.05);
    ctx.strokeStyle=C.motorD||C.motor; ctx.lineWidth=Math.max(2,w*0.003);
    line(ctx, hubX, hubY, cargoX, cargoY+cr*0.7);
    // cargo vesicle
    var g = ctx.createRadialGradient(cargoX-cr*0.3,cargoY-cr*0.3,cr*0.2,cargoX,cargoY,cr);
    g.addColorStop(0,'#f7b48f'); g.addColorStop(1,C.cargo);
    ctx.beginPath(); ctx.arc(cargoX,cargoY,cr,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
    ctx.strokeStyle='rgba(150,60,20,.35)'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='italic '+(cr*0.4)+'px Georgia,serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('cargo', cargoX, cargoY);
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  };
  function foot(ctx,x,y,r,col){ ctx.beginPath(); ctx.ellipse(x,y,r*1.3,r*0.8,0,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); }
  function line(ctx,x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }

  /* ---------- helpers ---------- */
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  /* ---------- engine ---------- */
  function mount(canvas){
    var name = canvas.getAttribute('data-anim');
    var fn = ANIM[name]; if(!fn) return;
    var ctx = canvas.getContext('2d');
    var visible = false, running = false, start = 0, paused = false;
    var toggle = canvas.parentElement.parentElement.querySelector('[data-anim-toggle]');

    function fit(){
      var rect = canvas.getBoundingClientRect();
      if(rect.width < 2) return;
      var dpr = Math.min(window.devicePixelRatio||1, 2);
      canvas.width = Math.round(rect.width*dpr);
      canvas.height = Math.round(rect.height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      draw(lastT);
    }
    var lastT = 0;
    function draw(t){ fn(ctx, canvas.width/(Math.min(window.devicePixelRatio||1,2)), canvas.height/(Math.min(window.devicePixelRatio||1,2)), t); lastT=t; }

    function frame(ts){
      if(!running) return;
      if(!start) start = ts;
      draw((ts-start)/1000);
      requestAnimationFrame(frame);
    }
    function play(){ if(running||paused||reduce) return; running=true; start=0; requestAnimationFrame(frame); }
    function stop(){ running=false; start=0; }

    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        visible = e.isIntersecting && e.intersectionRatio>0.15;
        if(visible) play(); else stop();
      });
    }, {threshold:[0,0.15,0.5]});
    io.observe(canvas);

    window.addEventListener('resize', fit);
    window.addEventListener('bookbank:relayout', function(){ setTimeout(fit,30); });

    if(toggle){
      toggle.addEventListener('click', function(){
        paused = !paused;
        toggle.textContent = paused ? '▶ Play' : '❚❚ Pause';
        if(paused) stop(); else if(visible) play();
      });
    }

    fit();
    if(reduce){ draw(0); if(toggle){ toggle.textContent='▶ Play'; toggle.disabled=true; } }
    else { play(); }
  }

  function init(){
    Array.prototype.forEach.call(document.querySelectorAll('canvas[data-anim]'), mount);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
