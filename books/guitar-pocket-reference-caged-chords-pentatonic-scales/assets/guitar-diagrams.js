/* guitar-diagrams.js — renders chord boxes and pentatonic/scale fretboards as
   inline SVG from compact data attributes. Self-contained, no network, works
   from file://. Runs at DOMContentLoaded (before the pager's load handler) so
   the pager measures the final laid-out width. Colors come from the theme's
   CSS custom properties, so diagrams match the book skin.

   Chord box:  <figure class="chorddiag" data-frets="x,3,2,0,1,0"
                        data-fingers=",3,2,,1," data-name="C" data-barre="">
     data-frets  : 6 values low E(6) .. high e(1); integer fret or "x"
     data-fingers: 6 values, blank = none/open; 1=index 2=mid 3=ring 4=pinky
     data-barre  : optional "fret:startPos:endPos" (pos 0=lowE..5=high e),
                   multiple separated by ";"
   Scale board: <figure class="scalediag" data-low="5" data-high="8"
                        data-dots="0:5:r,0:8:n,..." data-label="Box 1">
     data-dots   : "pos:fret:role" ; role r=root n=note b=blueNote
*/
(function(){
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var STR_LETTERS = ["E","A","D","G","B","e"]; // pos 0..5 (low->high)

  /* ---- audio: self-contained Karplus–Strong pluck, no network ----
     Pitches are derived straight from each diagram's data attributes:
     a string at pos p (0=low E .. 5=high e) fretted at f sounds OPEN[p]+f. */
  var OPEN = [40,45,50,55,59,64]; // MIDI of open strings, low E .. high e
  var actx=null, master=null, kcache={};
  function audio(){
    if(!actx){
      var AC = window.AudioContext||window.webkitAudioContext;
      if(!AC) return null;
      actx = new AC();
      master = actx.createGain(); master.gain.value = 0.9;
      var comp = actx.createDynamicsCompressor();
      master.connect(comp); comp.connect(actx.destination);
    }
    if(actx.state==="suspended") actx.resume();
    return actx;
  }
  function midiToFreq(m){ return 440*Math.pow(2,(m-69)/12); }
  function pluck(freq){
    var key=Math.round(freq); if(kcache[key]) return kcache[key];
    var c=actx, sr=c.sampleRate, dur=2.4;
    var N=Math.max(2,Math.round(sr/freq)), len=Math.floor(sr*dur);
    var buf=new Float32Array(N), i, prev=0;
    for(i=0;i<N;i++){ var w=Math.random()*2-1; prev=(w+prev)*0.5; buf[i]=prev; }
    var out=c.createBuffer(1,len,sr), data=out.getChannelData(0), idx=0, rho=0.9955;
    for(i=0;i<len;i++){ var cur=buf[idx], nxt=buf[(idx+1)%N]; buf[idx]=(cur+nxt)*0.5*rho; data[i]=cur; idx=(idx+1)%N; }
    var fade=Math.min(1200,len); for(i=0;i<fade;i++) data[len-1-i]*=i/fade;
    kcache[key]=out; return out;
  }
  function playMidi(m, when, gain){
    var c=audio(); if(!c) return;
    var src=c.createBufferSource(); src.buffer=pluck(midiToFreq(m));
    var g=c.createGain(); g.gain.value=(gain==null?0.7:gain);
    src.connect(g); g.connect(master); src.start(when||c.currentTime);
  }
  function strumChord(midis){ // near-simultaneous, low->high
    var c=audio(); if(!c) return; var t=c.currentTime+0.02;
    for(var i=0;i<midis.length;i++) playMidi(midis[i], t+i*0.03, 0.6);
  }
  function playRun(midis){ // one note at a time, ascending
    var c=audio(); if(!c) return; var t=c.currentTime+0.04, step=0.32;
    for(var i=0;i<midis.length;i++) playMidi(midis[i], t+i*step, 0.62);
  }
  function addPlay(fig, label, playFn){
    var btn=document.createElement("button");
    btn.className="diag-play"; btn.type="button";
    btn.setAttribute("aria-label", label);
    btn.innerHTML='<span class="dp-ico" aria-hidden="true">&#9654;</span>'+
                  '<span class="dp-txt">'+label+'</span>';
    btn.addEventListener("click", function(e){
      e.preventDefault();
      playFn();
      btn.classList.add("is-playing");
      setTimeout(function(){ btn.classList.remove("is-playing"); }, 480);
    });
    fig.appendChild(btn);
  }

  function cvar(name, fb){
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = (v||"").trim(); return v || fb;
  }
  function el(tag, attrs, text){
    var n = document.createElementNS(SVGNS, tag), k;
    for(k in attrs) n.setAttribute(k, attrs[k]);
    if(text!=null) n.textContent = text;
    return n;
  }

  function palette(){
    return {
      ink:  cvar("--ink", "#232028"),
      soft: cvar("--ink-soft", "#6a6570"),
      line: cvar("--diagram-line", "#3a3640"),
      paper:cvar("--paper-2", "#ffffff"),
      dot:  cvar("--dot", "#1b1820"),
      root: cvar("--root", "#c02a3a"),
      blue: cvar("--blue", "#2f6bb0"),
      nut:  cvar("--ink", "#232028")
    };
  }

  function chordBox(fig){
    var C = palette();
    var frets = (fig.getAttribute("data-frets")||"").split(",").map(function(s){
      s=s.trim(); return s==="x"||s==="X"? "x" : parseInt(s,10);
    });
    var fingers = (fig.getAttribute("data-fingers")||"").split(",").map(function(s){return s.trim();});
    var barres = (fig.getAttribute("data-barre")||"").split(";").map(function(s){return s.trim();}).filter(Boolean);
    var fretted = frets.filter(function(f){return typeof f==="number" && f>0;});
    var maxF = fretted.length? Math.max.apply(null,fretted) : 0;
    var minF = fretted.length? Math.min.apply(null,fretted) : 1;
    var base, nF, showNut;
    if(maxF<=4){ base=1; showNut=true; nF=Math.max(4,maxF); }
    else { base=minF; showNut=false; nF=Math.max(4, maxF-minF+1); }

    var W=150, H=196, gl=24, gr=24, gt=44, gb=170;
    var innerW=W-gl-gr, innerH=gb-gt;
    var sGap=innerW/5, fGap=innerH/nF;
    var svg=el("svg",{viewBox:"0 0 "+W+" "+H, class:"cd-svg", role:"img"});

    function sx(pos){ return gl+pos*sGap; }
    function fy(f){ return gt+(f-base+0.5)*fGap; } // center of fret row

    // fret lines
    for(var k=0;k<=nF;k++){
      var y=gt+k*fGap;
      var thick = (k===0 && showNut);
      svg.appendChild(el("line",{x1:gl,y1:y,x2:gl+innerW,y2:y,
        stroke:C.line, "stroke-width":thick?4:1.4, "stroke-linecap":"round"}));
    }
    // strings
    for(var j=0;j<6;j++){
      svg.appendChild(el("line",{x1:sx(j),y1:gt,x2:sx(j),y2:gb,
        stroke:C.line, "stroke-width":1.4}));
    }
    // base-fret label
    if(!showNut){
      svg.appendChild(el("text",{x:gl-8,y:gt+fGap*0.5+4, "text-anchor":"end",
        class:"cd-fretlabel", fill:C.soft}, base+"fr"));
    }
    // barres (behind dots)
    barres.forEach(function(b){
      var p=b.split(":").map(Number); if(p.length<3) return;
      var f=p[0], a=p[1], c=p[2];
      var y=fy(f), x1=sx(a), x2=sx(c), r=sGap*0.30;
      svg.appendChild(el("rect",{x:x1-r, y:y-r, width:(x2-x1)+2*r, height:2*r,
        rx:r, ry:r, fill:C.dot, opacity:"0.92"}));
    });
    // open / muted markers above nut
    for(var m=0;m<6;m++){
      var mk=frets[m];
      if(mk==="x"){
        svg.appendChild(el("text",{x:sx(m),y:gt-12,"text-anchor":"middle",
          class:"cd-mark", fill:C.soft},"×"));
      } else if(mk===0){
        svg.appendChild(el("circle",{cx:sx(m),cy:gt-16,r:5.4,fill:"none",
          stroke:C.soft,"stroke-width":1.6}));
      }
    }
    // finger dots
    for(var n=0;n<6;n++){
      var f=frets[n];
      if(typeof f!=="number" || f<=0) continue;
      var cx=sx(n), cy=fy(f), rad=sGap*0.34;
      svg.appendChild(el("circle",{cx:cx,cy:cy,r:rad,fill:C.dot}));
      var fin=fingers[n];
      if(fin && fin!=="0"){
        svg.appendChild(el("text",{x:cx,y:cy+0.5,"text-anchor":"middle",
          "dominant-baseline":"central", class:"cd-fin", fill:C.paper}, fin));
      }
    }
    // string letters
    for(var s=0;s<6;s++){
      svg.appendChild(el("text",{x:sx(s),y:gb+16,"text-anchor":"middle",
        class:"cd-strlabel", fill:C.soft}, STR_LETTERS[s]));
    }
    fig.insertBefore(svg, fig.firstChild);

    // play button: strum every sounding string, low -> high
    var midis=[];
    for(var p=0;p<6;p++){ var fv=frets[p]; if(typeof fv==="number" && fv>=0) midis.push(OPEN[p]+fv); }
    if(midis.length) addPlay(fig, "Play chord", function(){ strumChord(midis); });
  }

  function scaleBoard(fig){
    var C = palette();
    var low=parseInt(fig.getAttribute("data-low"),10);
    var high=parseInt(fig.getAttribute("data-high"),10);
    var dots=(fig.getAttribute("data-dots")||"").split(",").map(function(s){return s.trim();}).filter(Boolean)
      .map(function(d){var p=d.split(":");return {pos:+p[0],fret:+p[1],role:(p[2]||"n")};});
    var nF=high-low+1;
    var W=470, H=168, gl=40, gr=16, gt=20, gb=120;
    var innerW=W-gl-gr, innerH=gb-gt;
    var cellW=innerW/nF, sGap=innerH/5;
    var svg=el("svg",{viewBox:"0 0 "+W+" "+H, class:"sd-svg", role:"img"});

    function rowY(pos){ return gt+(5-pos)*sGap; }        // pos5 (high e) at top
    function fx(f){ return gl+(f-low+0.5)*cellW; }        // center of fret cell

    // fret grid (vertical fret lines)
    for(var k=0;k<=nF;k++){
      var x=gl+k*cellW;
      var isNut=(low===1 && k===0);
      svg.appendChild(el("line",{x1:x,y1:gt,x2:x,y2:gb,
        stroke:C.line,"stroke-width":isNut?4:1.2,opacity:isNut?1:0.75}));
    }
    // strings (horizontal)
    for(var j=0;j<6;j++){
      var y=rowY(j);
      svg.appendChild(el("line",{x1:gl,y1:y,x2:gl+innerW,y2:y,
        stroke:C.line,"stroke-width":1.2}));
      svg.appendChild(el("text",{x:gl-10,y:y+0.5,"text-anchor":"end",
        "dominant-baseline":"central",class:"sd-strlabel",fill:C.soft},STR_LETTERS[j]));
    }
    // fret-number labels below
    for(var f=low; f<=high; f++){
      svg.appendChild(el("text",{x:fx(f),y:gb+18,"text-anchor":"middle",
        class:"sd-fretlabel",fill:C.soft}, String(f)));
    }
    // dots
    dots.forEach(function(d){
      var cx=fx(d.fret), cy=rowY(d.pos), rad=sGap*0.40;
      var fill = d.role==="r"? C.root : d.role==="b"? C.blue : C.paper;
      var stroke = d.role==="n"? C.dot : "none";
      svg.appendChild(el("circle",{cx:cx,cy:cy,r:rad,fill:fill,
        stroke:stroke,"stroke-width":stroke==="none"?0:2}));
      if(d.role==="r"){
        svg.appendChild(el("text",{x:cx,y:cy+0.5,"text-anchor":"middle",
          "dominant-baseline":"central",class:"sd-rootmark",fill:C.paper},"R"));
      } else if(d.role==="b"){
        svg.appendChild(el("text",{x:cx,y:cy+0.5,"text-anchor":"middle",
          "dominant-baseline":"central",class:"sd-rootmark",fill:"#fff"},"♭"));
      }
    });
    fig.insertBefore(svg, fig.firstChild);

    // play button: sound the box ascending (matches the ascending tab)
    var midis=dots.map(function(d){ return OPEN[d.pos]+d.fret; })
                  .sort(function(a,b){ return a-b; });
    if(midis.length) addPlay(fig, "Play scale", function(){ playRun(midis); });
  }

  function render(){
    var a=document.querySelectorAll(".chorddiag");
    for(var i=0;i<a.length;i++){ try{ chordBox(a[i]); }catch(e){ a[i].classList.add("diag-failed"); } }
    var b=document.querySelectorAll(".scalediag");
    for(var j=0;j<b.length;j++){ try{ scaleBoard(b[j]); }catch(e){ b[j].classList.add("diag-failed"); } }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
