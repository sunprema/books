/* otp-anim.js — offline 2D canvas figures for the OTP book.
   <canvas data-anim="actors"> draws the actor model: isolated processes, each
   with a private mailbox, exchanging asynchronous messages. Rules mirror the
   3D figures: size to the figure (not window), pause offscreen via
   IntersectionObserver, honor prefers-reduced-motion (one static frame),
   re-fit on the pager's relayout. No external assets. */
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var C = {
    paper:'#f7f2e9', node:'#f1e9da', edge:'#cdbb9c',
    grape:'#6b3fa0', grapeDeep:'#4a2a72', grapeLite:'#9a6fc7',
    amber:'#c8781f', teal:'#167f6c', ink:'#2b2330', soft:'#5c5164'
  };

  function mountActors(canvas){
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio||1, 2);
    var W=0, H=0;

    // processes around a ring, each with a private mailbox (queue of pending msgs)
    var NAMES = ['#PID<0.42>','#PID<0.71>','#PID<0.93>','#PID<0.108>','#PID<0.155>'];
    var procs = NAMES.map(function(n,i){ return { name:n, i:i, mailbox:[], pulse:0 }; });
    var flying = [];   // messages in transit
    var running=false, visible=false, t0=0, lastSpawn=0;

    function fit(){
      var r = canvas.getBoundingClientRect();
      if(r.width < 2) return;
      W = r.width; H = r.height;
      canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      if(!running) draw(0);
    }

    function nodePos(i){
      var cx=W*0.5, cy=H*0.52, rx=Math.min(W*0.34, 320), ry=Math.min(H*0.34, 190);
      var a = -Math.PI/2 + i*(2*Math.PI/procs.length);
      return { x:cx+Math.cos(a)*rx, y:cy+Math.sin(a)*ry };
    }

    function roundRect(x,y,w,h,r){
      ctx.beginPath();
      ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
    }

    function spawnMsg(t){
      var a = Math.floor(Math.random()*procs.length);
      var b = a; while(b===a){ b = Math.floor(Math.random()*procs.length); }
      var kind = Math.random()<0.34 ? 'call' : 'cast';
      flying.push({ from:a, to:b, t0:t, dur:0.9+Math.random()*0.5, kind:kind });
    }

    function draw(t){
      ctx.clearRect(0,0,W,H);

      // title
      ctx.fillStyle=C.soft; ctx.font='600 12px -apple-system,Segoe UI,sans-serif';
      ctx.textAlign='left'; ctx.textBaseline='top';
      ctx.fillText('The BEAM · isolated processes passing messages', 14, 12);

      // faint links between all nodes (the "everyone can send to anyone")
      ctx.strokeStyle='rgba(154,111,199,.12)'; ctx.lineWidth=1;
      for(var p=0;p<procs.length;p++){
        for(var q=p+1;q<procs.length;q++){
          var A=nodePos(p), B=nodePos(q);
          ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
        }
      }

      // flying messages
      for(var m=flying.length-1;m>=0;m--){
        var msg=flying[m];
        var pr=(t-msg.t0)/msg.dur;
        if(pr>=1){
          procs[msg.to].mailbox.push({ born:t, kind:msg.kind });
          if(procs[msg.to].mailbox.length>6) procs[msg.to].mailbox.shift();
          flying.splice(m,1); continue;
        }
        var A=nodePos(msg.from), B=nodePos(msg.to);
        // gentle arc via a control point offset from the midpoint
        var mx=(A.x+B.x)/2, my=(A.y+B.y)/2;
        var nx=-(B.y-A.y), ny=(B.x-A.x), nl=Math.hypot(nx,ny)||1;
        var bow=28; mx+=nx/nl*bow; my+=ny/nl*bow;
        var u=1-pr;
        var x=u*u*A.x+2*u*pr*mx+pr*pr*B.x;
        var y=u*u*A.y+2*u*pr*my+pr*pr*B.y;
        var col = msg.kind==='call'?C.grape:C.amber;
        ctx.fillStyle=col;
        ctx.beginPath(); ctx.arc(x,y,5,0,7); ctx.fill();
        // little trailing tail
        ctx.strokeStyle=col; ctx.globalAlpha=.35; ctx.lineWidth=2;
        var pr2=Math.max(0,pr-0.06), u2=1-pr2;
        var x2=u2*u2*A.x+2*u2*pr2*mx+pr2*pr2*B.x, y2=u2*u2*A.y+2*u2*pr2*my+pr2*pr2*B.y;
        ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x,y); ctx.stroke();
        ctx.globalAlpha=1;
      }

      // nodes + mailboxes
      for(var i=0;i<procs.length;i++){
        var P=procs[i], pos=nodePos(i);
        // process the head of the mailbox after a beat (fade + pulse)
        if(P.mailbox.length && (t - P.mailbox[0].born) > 0.85){
          P.mailbox.shift(); P.pulse=1;
        }
        P.pulse=Math.max(0,P.pulse-0.03);

        // bubble
        var rw=104, rh=42;
        ctx.save();
        ctx.shadowColor='rgba(70,45,95,.18)'; ctx.shadowBlur=10; ctx.shadowOffsetY=3;
        ctx.fillStyle=C.node; ctx.strokeStyle=C.edge; ctx.lineWidth=1.5;
        roundRect(pos.x-rw/2,pos.y-rh/2,rw,rh,10); ctx.fill();
        ctx.restore();
        // pulse ring when it handles a message
        if(P.pulse>0){
          ctx.strokeStyle='rgba(22,127,108,'+(P.pulse*0.9)+')'; ctx.lineWidth=2+P.pulse*3;
          roundRect(pos.x-rw/2,pos.y-rh/2,rw,rh,10); ctx.stroke();
        }
        ctx.strokeStyle=C.grapeLite; ctx.lineWidth=1.2;
        roundRect(pos.x-rw/2,pos.y-rh/2,rw,rh,10); ctx.stroke();
        // pid label
        ctx.fillStyle=C.grapeDeep; ctx.font='600 12px "SF Mono",Menlo,monospace';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(P.name, pos.x, pos.y-4);
        // mailbox slots under the pid
        var slots=6, sw=11, gap=3, tot=slots*(sw+gap)-gap, sx=pos.x-tot/2, sy=pos.y+8;
        for(var s=0;s<slots;s++){
          var filled=s<P.mailbox.length;
          ctx.fillStyle = filled ? (P.mailbox[s].kind==='call'?C.grape:C.amber) : 'rgba(0,0,0,.06)';
          roundRect(sx+s*(sw+gap), sy, sw, 7, 2); ctx.fill();
        }
      }

      // legend
      ctx.textAlign='left'; ctx.textBaseline='middle';
      ctx.font='11px -apple-system,Segoe UI,sans-serif';
      ctx.fillStyle=C.grape; roundRect(14,H-24,11,7,2); ctx.fill();
      ctx.fillStyle=C.soft; ctx.fillText('call (awaits reply)', 32, H-20);
      ctx.fillStyle=C.amber; roundRect(150,H-24,11,7,2); ctx.fill();
      ctx.fillStyle=C.soft; ctx.fillText('cast (fire & forget)', 168, H-20);
      ctx.textBaseline='top'; ctx.textAlign='left';
    }

    function frame(ts){
      if(!running) return;
      if(!t0){ t0=ts; lastSpawn=0; }
      var t=(ts-t0)/1000;
      if(t-lastSpawn > 0.55 && flying.length<7){ spawnMsg(t); lastSpawn=t; }
      draw(t);
      requestAnimationFrame(frame);
    }
    function play(){ if(running||reduce) return; running=true; t0=0; requestAnimationFrame(frame); }
    function stop(){ running=false; t0=0; }

    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){
        visible=e.isIntersecting && e.intersectionRatio>0.12;
        if(visible){ fit(); play(); } else stop();
      });
    },{threshold:[0,0.12,0.5]});
    io.observe(canvas);

    window.addEventListener('resize', fit);
    window.addEventListener('bookbank:relayout', function(){ setTimeout(fit,30); });

    fit();
    if(reduce){ // seed a couple of mailbox items for a meaningful static frame
      procs[1].mailbox.push({born:-1,kind:'call'}); procs[3].mailbox.push({born:-1,kind:'cast'});
      draw(0);
    }
  }

  var MOUNT={ actors:mountActors };
  function init(){
    Array.prototype.forEach.call(document.querySelectorAll('canvas[data-anim]'), function(c){
      var fn=MOUNT[c.getAttribute('data-anim')]; if(fn) fn(c);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
