/* widgets.js — the book's one interactive widget: a shared sticky metronome.
   Built on the vendored BookWidgets runtime (assets/vendor/book-widgets.js):
   the runtime handles DOM-scan boot and per-widget failure isolation (a thrown
   init flags the box widget-failed and never breaks the page). Timing itself
   uses the Web Audio clock with a look-ahead scheduler (not rAF), so clicks
   stay rock-steady. The metronome is position:fixed bottom-left, so it stays
   put while you flip spreads within a file; BPM + beats-per-bar persist in
   localStorage so it behaves as ONE metronome across the whole book. Audio
   can't auto-start across a file navigation (browser autoplay policy), so it
   parks paused at the same BPM, one tap from resuming.

   Markup (once per page):
     <figure class="metronome figbox" data-widget="metronome"> ... </figure>
*/
(function(){
  "use strict";
  var LS_BPM="bb-guitar-metro-bpm", LS_BEATS="bb-guitar-metro-beats";

  function clampBpm(v){ v=Math.round(v); return Math.max(40, Math.min(240, v)); }
  function readNum(key, dflt){
    try{ var v=parseInt(localStorage.getItem(key),10); return isFinite(v)?v:dflt; }
    catch(e){ return dflt; }
  }
  function save(key,v){ try{ localStorage.setItem(key,String(v)); }catch(e){} }

  if(!window.BookWidgets){ return; }

  BookWidgets.register("metronome", function(box, W){
    var bpm   = clampBpm(readNum(LS_BPM, 100));
    var beats = readNum(LS_BEATS, 4); if([2,3,4,6].indexOf(beats)<0) beats=4;

    var elToggle = box.querySelector(".met-toggle");
    var elBpm    = box.querySelector(".met-bpmval");
    var elSlider = box.querySelector(".met-slider");
    var elDec    = box.querySelector(".met-dec");
    var elInc    = box.querySelector(".met-inc");
    var elTap    = box.querySelector(".met-tap");
    var elBeats  = box.querySelector(".met-beatsval");
    var elBeatsBtn=box.querySelector(".met-beatsbtn");
    var dotsWrap = box.querySelector(".met-dots");

    var ctx=null, running=false;
    var lookahead=25, scheduleAhead=0.10;   // ms / s
    var nextNoteTime=0, beatInBar=0, timer=null;
    var queue=[];                            // {beat, time}
    var rafId=null;

    function ac(){
      if(!ctx){
        var AC=window.AudioContext||window.webkitAudioContext;
        if(!AC) throw new Error("no WebAudio");
        ctx=new AC();
      }
      if(ctx.state==="suspended") ctx.resume();
      return ctx;
    }

    function buildDots(){
      if(!dotsWrap) return;
      dotsWrap.innerHTML="";
      for(var i=0;i<beats;i++){
        var d=document.createElement("span");
        d.className="met-dot"+(i===0?" accent":"");
        dotsWrap.appendChild(d);
      }
    }
    function lightDot(i){
      if(!dotsWrap) return;
      var kids=dotsWrap.children;
      for(var k=0;k<kids.length;k++) kids[k].classList.toggle("on", k===i);
    }

    function clickAt(time, accent){
      var c=ctx;
      var osc=c.createOscillator(), g=c.createGain();
      osc.frequency.value = accent? 1600 : 920;
      osc.type = "square";
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(accent?0.55:0.32, time+0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, time+0.045);
      osc.connect(g); g.connect(c.destination);
      osc.start(time); osc.stop(time+0.05);
    }

    function scheduler(){
      var secPerBeat = 60.0/bpm;
      while(nextNoteTime < ctx.currentTime + scheduleAhead){
        clickAt(nextNoteTime, beatInBar===0);
        queue.push({beat:beatInBar, time:nextNoteTime});
        nextNoteTime += secPerBeat;
        beatInBar = (beatInBar+1) % beats;
      }
    }
    function drawLoop(){
      if(!running){ return; }
      var t=ctx.currentTime, cur=-1;
      while(queue.length && queue[0].time <= t){ cur=queue[0].beat; queue.shift(); }
      if(cur>=0) lightDot(cur);
      rafId=requestAnimationFrame(drawLoop);
    }

    function start(){
      try{ ac(); }catch(e){ if(elToggle){ elToggle.textContent="—"; elToggle.title="Web Audio unavailable"; } return; }
      running=true;
      beatInBar=0; queue=[];
      nextNoteTime=ctx.currentTime+0.06;
      timer=setInterval(scheduler, lookahead);
      rafId=requestAnimationFrame(drawLoop);
      box.classList.add("playing");
      if(elToggle){ elToggle.textContent="■"; elToggle.setAttribute("aria-label","Stop metronome"); }
    }
    function stop(){
      running=false;
      if(timer){ clearInterval(timer); timer=null; }
      if(rafId){ cancelAnimationFrame(rafId); rafId=null; }
      lightDot(-1);
      box.classList.remove("playing");
      if(elToggle){ elToggle.textContent="▶"; elToggle.setAttribute("aria-label","Start metronome"); }
    }
    function toggle(){ running? stop() : start(); }

    function setBpm(v){
      bpm=clampBpm(v);
      if(elBpm) elBpm.textContent=bpm;
      if(elSlider && +elSlider.value!==bpm) elSlider.value=bpm;
      save(LS_BPM, bpm);
    }
    function setBeats(v){
      beats=v; save(LS_BEATS, beats);
      if(elBeats) elBeats.textContent=beats;
      buildDots();
      if(running){ beatInBar=0; }
    }

    // --- wire controls ---
    if(elToggle) elToggle.addEventListener("click", toggle);
    if(elDec) elDec.addEventListener("click", function(){ setBpm(bpm-1); });
    if(elInc) elInc.addEventListener("click", function(){ setBpm(bpm+1); });
    if(elSlider){
      elSlider.min=40; elSlider.max=240; elSlider.step=1; elSlider.value=bpm;
      elSlider.addEventListener("input", function(){ setBpm(+elSlider.value); });
    }
    if(elBeatsBtn) elBeatsBtn.addEventListener("click", function(){
      var order=[2,3,4,6], idx=order.indexOf(beats);
      setBeats(order[(idx+1)%order.length]);
    });

    // tap tempo
    var taps=[];
    if(elTap) elTap.addEventListener("click", function(){
      var now=performance.now();
      taps=taps.filter(function(t){ return now-t < 2500; });
      taps.push(now);
      if(taps.length>=2){
        var diffs=[], i;
        for(i=1;i<taps.length;i++) diffs.push(taps[i]-taps[i-1]);
        var avg=diffs.reduce(function(a,b){return a+b;},0)/diffs.length;
        setBpm(60000/avg);
      }
    });

    // pause when the tab/app is hidden so it doesn't click into a pocket
    document.addEventListener("visibilitychange", function(){
      if(document.hidden && running) stop();
    });

    // init display
    setBpm(bpm); setBeats(beats);
    stop(); // parked paused; one tap to resume at the shared BPM
  });
})();
