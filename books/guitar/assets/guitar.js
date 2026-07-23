/* ============================================================
   guitar.js — offline interactive engine for the Guitar! book.
   Web Audio (Karplus–Strong pluck) + declarative SVG widgets.
   No network, no CDN. Scans the DOM on load and wires everything.
   ============================================================ */
(function(){
"use strict";

/* ---------------- music constants ---------------- */
var NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var OPEN  = [40,45,50,55,59,64];               // MIDI of open strings, 6th(lowE)->1st(highE)
var SLABEL= ['E','A','D','G','B','e'];          // string names, 6th->1st
var SGAUGE= [3.0,2.5,2.1,1.6,1.25,1.0];         // draw thickness, 6th->1st

function pc(m){ return ((m%12)+12)%12; }
function noteName(m){ return NOTES[pc(m)]; }
function octaveOf(m){ return Math.floor(m/12)-1; }
function fullName(m){ return noteName(m)+octaveOf(m); }
function midiToFreq(m){ return 440*Math.pow(2,(m-69)/12); }
function noteIndex(name){ return NOTES.indexOf(name.replace('b','').toUpperCase().length===2 && name.length===2 && name[1]==='b'
  ? flatToSharp(name) : name); }
function flatToSharp(n){
  var map={'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#','Cb':'B','Fb':'E'};
  return map[n]||n;
}
function pcOfName(name){
  name = name.charAt(0).toUpperCase()+name.slice(1);
  if(name.length===2 && name[1]==='b') name=flatToSharp(name);
  var i = NOTES.indexOf(name);
  return i<0 ? 0 : i;
}

var SCALES = {
  'major':            [0,2,4,5,7,9,11,12],
  'natural-minor':    [0,2,3,5,7,8,10,12],
  'major-pentatonic': [0,2,4,7,9,12],
  'minor-pentatonic': [0,3,5,7,10,12],
  'blues':            [0,3,5,6,7,10,12]
};

/* Chords: frets 6th->1st, -1 = muted; fingers 0=open/none, 1..4 fingers */
var CHORDS = {
  'Em': { f:[0,2,2,0,0,0],   d:[0,2,3,0,0,0] },
  'Am': { f:[-1,0,2,2,1,0],  d:[0,0,3,2,1,0] },
  'Dm': { f:[-1,-1,0,2,3,1], d:[0,0,0,2,3,1] },
  'C':  { f:[-1,3,2,0,1,0],  d:[0,3,2,0,1,0] },
  'G':  { f:[3,2,0,0,0,3],   d:[2,1,0,0,0,3] },
  'D':  { f:[-1,-1,0,2,3,2], d:[0,0,0,1,3,2] },
  'E':  { f:[0,2,2,1,0,0],   d:[0,2,3,1,0,0] },
  'A':  { f:[-1,0,2,2,2,0],  d:[0,0,1,2,3,0] },
  'A7': { f:[-1,0,2,0,2,0],  d:[0,0,2,0,3,0] },
  'E7': { f:[0,2,0,1,0,0],   d:[0,2,0,1,0,0] },
  'D7': { f:[-1,-1,0,2,1,2], d:[0,0,0,2,1,3] }
};

/* ---------------- audio ---------------- */
var actx=null, master=null, kcache={};
function ctx(){
  if(!actx){
    var AC = window.AudioContext||window.webkitAudioContext;
    actx = new AC();
    master = actx.createGain(); master.gain.value = 0.85;
    var comp = actx.createDynamicsCompressor();
    master.connect(comp); comp.connect(actx.destination);
  }
  if(actx.state==='suspended') actx.resume();
  return actx;
}
/* Karplus–Strong plucked-string buffer, cached by integer Hz */
function pluckBuffer(freq){
  var key = Math.round(freq);
  if(kcache[key]) return kcache[key];
  var c = ctx(), sr = c.sampleRate, dur = 2.4;
  var N = Math.max(2, Math.round(sr/freq));
  var len = Math.floor(sr*dur);
  var buf = new Float32Array(N), i;
  // noise burst, lightly low-passed for a warmer pick
  var prev=0;
  for(i=0;i<N;i++){ var w=Math.random()*2-1; prev=(w+prev)*0.5; buf[i]=prev; }
  var out = c.createBuffer(1, len, sr), data = out.getChannelData(0);
  var idx=0, rho=0.9955;
  for(i=0;i<len;i++){
    var cur=buf[idx], nxt=buf[(idx+1)%N];
    var v=(cur+nxt)*0.5*rho;
    buf[idx]=v; data[i]=cur; idx=(idx+1)%N;
  }
  // gentle fade tail to avoid clicks
  var fade=Math.min(1200,len);
  for(i=0;i<fade;i++) data[len-1-i]*=i/fade;
  kcache[key]=out; return out;
}
function playFreq(freq, when, gain){
  var c=ctx();
  var src=c.createBufferSource(); src.buffer=pluckBuffer(freq);
  var g=c.createGain(); g.gain.value=(gain==null?0.7:gain);
  src.connect(g); g.connect(master);
  src.start(when||c.currentTime);
  return src;
}
function playMidi(m, when, gain){ return playFreq(midiToFreq(m), when, gain); }
function click(when, accent){
  var c=ctx();
  var o=c.createOscillator(), g=c.createGain();
  o.frequency.value=accent?1600:1050; o.type='square';
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(accent?0.28:0.16, when+0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, when+0.05);
  o.connect(g); g.connect(master); o.start(when); o.stop(when+0.06);
}
/* strum a chord (array of midi, low->high); dir 'down' low->high, 'up' high->low */
function strum(midis, dir, t0, spread){
  var c=ctx(); t0=t0||c.currentTime; spread=spread==null?0.028:spread;
  var order=midis.slice(); if(dir==='up') order.reverse();
  for(var i=0;i<order.length;i++) playMidi(order[i], t0+i*spread, 0.55);
}
function chordMidis(name){
  var ch=CHORDS[name]; if(!ch) return [];
  var out=[];
  for(var s=0;s<6;s++){ if(ch.f[s]>=0) out.push(OPEN[s]+ch.f[s]); }
  return out;
}

/* ---------------- tiny SVG helper ---------------- */
var SVGNS='http://www.w3.org/2000/svg';
function el(tag, attrs, txt){
  var e=document.createElementNS(SVGNS, tag);
  for(var k in attrs) if(attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
  if(txt!=null) e.textContent=txt;
  return e;
}

/* ---------------- chord diagram ---------------- */
function renderChord(host, name){
  var ch=CHORDS[name]; if(!ch){ host.textContent='?'; return; }
  var W=120,H=150, L=20,R=14, top=30, nStr=6, nFret=4;
  var sp=(W-L-R)/(nStr-1), fh=(H-top-16)/nFret;
  var svg=el('svg',{viewBox:'0 0 '+W+' '+H, class:'chord-diagram', role:'img', 'aria-label':name+' chord'});
  // nut
  svg.appendChild(el('rect',{x:L, y:top-4, width:W-L-R, height:4, fill:'#3d2b1f'}));
  // frets
  for(var fr=1;fr<=nFret;fr++) svg.appendChild(el('line',{x1:L,y1:top+fr*fh,x2:W-R,y2:top+fr*fh,stroke:'#caa96f','stroke-width':1}));
  // strings
  for(var s=0;s<nStr;s++){ var x=L+s*sp; svg.appendChild(el('line',{x1:x,y1:top,x2:x,y2:top+nFret*fh,stroke:'#8a7350','stroke-width':1})); }
  // markers
  for(s=0;s<nStr;s++){
    var xx=L+s*sp, fret=ch.f[s], fing=ch.d[s];
    if(fret<0){ // mute X
      var g=el('g',{}); g.appendChild(el('line',{x1:xx-4,y1:top-14,x2:xx+4,y2:top-6,stroke:'#a5641a','stroke-width':1.6}));
      g.appendChild(el('line',{x1:xx-4,y1:top-6,x2:xx+4,y2:top-14,stroke:'#a5641a','stroke-width':1.6})); svg.appendChild(g);
    } else if(fret===0){ // open O
      svg.appendChild(el('circle',{cx:xx,cy:top-10,r:4,fill:'none',stroke:'#6d3b23','stroke-width':1.4}));
    } else {
      var cy=top+(fret-0.5)*fh;
      svg.appendChild(el('circle',{cx:xx,cy:cy,r:8,fill:'#6d3b23'}));
      if(fing>0) svg.appendChild(el('text',{x:xx,y:cy+3.5,'text-anchor':'middle','font-size':9,fill:'#fff','font-family':'monospace'},fing));
    }
  }
  // string letters under
  for(s=0;s<nStr;s++) svg.appendChild(el('text',{x:L+s*sp,y:H-3,'text-anchor':'middle','font-size':8,fill:'#8a7350','font-family':'monospace'},SLABEL[s]));
  host.appendChild(svg);
  host.style.cursor='pointer';
  host.setAttribute('title','Play '+name);
  host.addEventListener('click', function(){ strum(chordMidis(name),'down'); flash(host); });
}
function flash(node){ node.style.transition='filter .12s'; node.style.filter='brightness(1.12)'; setTimeout(function(){node.style.filter='';},140); }

/* ---------------- fretboard ---------------- */
function buildFretboard(host){
  var nFret=parseInt(host.getAttribute('data-frets')||'12',10);
  var rootName=host.getAttribute('data-root');
  var scaleName=host.getAttribute('data-scale');
  var pcSet=null, rootPc=null;
  if(rootName && scaleName && SCALES[scaleName]){
    rootPc=pcOfName(rootName);
    pcSet={};
    SCALES[scaleName].forEach(function(iv){ pcSet[(rootPc+iv)%12]=true; });
  }
  var padL=8, head=26, nutX=padL+head, fw=40, padR=10;
  var topY=22, rowGap=24;
  var W=nutX+nFret*fw+padR, H=topY+5*rowGap+22;
  var svg=el('svg',{viewBox:'0 0 '+W+' '+H, class:'fretboard', role:'img','aria-label':'guitar fretboard'});
  // board
  svg.appendChild(el('rect',{x:nutX,y:topY-10,width:nFret*fw,height:5*rowGap+20,rx:4,fill:'#5a3620'}));
  // inlays
  [3,5,7,9].forEach(function(fr){ svg.appendChild(el('circle',{cx:nutX+(fr-0.5)*fw,cy:topY+2.5*rowGap,r:4,fill:'#d9c4a0',opacity:.6})); });
  svg.appendChild(el('circle',{cx:nutX+11.5*fw,cy:topY+1.5*rowGap,r:4,fill:'#d9c4a0',opacity:.6}));
  svg.appendChild(el('circle',{cx:nutX+11.5*fw,cy:topY+3.5*rowGap,r:4,fill:'#d9c4a0',opacity:.6}));
  // nut
  svg.appendChild(el('rect',{x:nutX-3,y:topY-10,width:3,height:5*rowGap+20,fill:'#efe4cd'}));
  // fret wires + numbers
  for(var fr=1;fr<=nFret;fr++){
    svg.appendChild(el('line',{x1:nutX+fr*fw,y1:topY-10,x2:nutX+fr*fw,y2:topY+5*rowGap+10,stroke:'#b7a07c','stroke-width':1.4}));
    svg.appendChild(el('text',{x:nutX+(fr-0.5)*fw,y:H-6,'text-anchor':'middle','font-size':9,fill:'#8a7350','font-family':'monospace'},fr));
  }
  // rows: top = high e (string index 5) ... bottom = low E (index 0)
  var readout=host.parentNode.querySelector('.readout');
  function cell(strIdx, fret){
    var midi=OPEN[strIdx]+fret;
    var rowFromTop=5-strIdx;
    var y=topY+rowFromTop*rowGap;
    var x=fret===0?nutX-13:nutX+(fret-0.5)*fw;
    var inScale = pcSet ? !!pcSet[pc(midi)] : true;
    var isRoot  = pcSet ? (pc(midi)===rootPc) : false;
    var showDot = pcSet ? inScale : (fret===0);
    if(showDot){
      var fill = isRoot?'#b5451f':(pcSet?'#2f6f6a':'#6d3b23');
      svg.appendChild(el('circle',{cx:x,cy:y,r:9,fill:fill,stroke:'#fff','stroke-width':1}));
      svg.appendChild(el('text',{x:x,y:y+3,'text-anchor':'middle','font-size':8.5,fill:'#fff','font-family':'monospace','pointer-events':'none'},noteName(midi)));
    }
    // transparent click target (always)
    var hit=el('circle',{cx:x,cy:y,r:11,fill:'transparent',style:'cursor:pointer'});
    hit.addEventListener('click', function(){
      playMidi(midi); flashDot(x,y);
      if(readout) readout.textContent=fullName(midi)+'  ·  '+SLABEL[strIdx]+' string, fret '+fret+'  ·  '+midiToFreq(midi).toFixed(1)+' Hz';
    });
    svg.appendChild(hit);
  }
  function flashDot(x,y){
    var c=el('circle',{cx:x,cy:y,r:9,fill:'none',stroke:'#c17d1f','stroke-width':2});
    svg.appendChild(c); var r=9;
    var iv=setInterval(function(){ r+=2; c.setAttribute('r',r); c.setAttribute('opacity',Math.max(0,1-(r-9)/16));
      if(r>24){ clearInterval(iv); if(c.parentNode)c.parentNode.removeChild(c);} },16);
  }
  // strings drawn over board
  for(var s=5;s>=0;s--){
    var rowFromTop=5-s, y=topY+rowFromTop*rowGap;
    svg.appendChild(el('line',{x1:nutX,y1:y,x2:nutX+nFret*fw,y2:y,stroke:'#d9cbb0','stroke-width':SGAUGE[s]}));
    svg.appendChild(el('text',{x:6,y:y+3,'text-anchor':'start','font-size':10,fill:'#6d3b23','font-family':'monospace','font-weight':'bold'},SLABEL[s]));
  }
  // dots + click targets last so they sit on top
  for(s=0;s<6;s++) for(fr=0;fr<=nFret;fr++) cell(s,fr);
  host.appendChild(svg);
}

/* play an abstract scale (root+intervals) ascending then descending */
function playScale(rootName, scaleName){
  var ivs=SCALES[scaleName]||SCALES['major-pentatonic'];
  var rootMidi=48+pcOfName(rootName); // around C3..B3 region
  if(rootMidi<52) rootMidi+=12;
  var seq=ivs.map(function(iv){return rootMidi+iv;});
  var down=seq.slice(0,-1).reverse();
  var all=seq.concat(down);
  var t=ctx().currentTime+0.05, step=0.34;
  all.forEach(function(m,i){ playMidi(m,t+i*step,0.6); });
}

/* ---------------- note wheel ---------------- */
function buildNoteWheel(host){
  var mode=host.getAttribute('data-mode')||'plain'; // plain | triad
  var size=240, cx=size/2, cy=size/2, R=92;
  var svg=el('svg',{viewBox:'0 0 '+size+' '+size, class:'note-wheel', role:'img','aria-label':'chromatic note wheel'});
  svg.appendChild(el('circle',{cx:cx,cy:cy,r:R+16,fill:'#fbf4e6',stroke:'#d8c39f','stroke-width':1}));
  var rootPc=0, quality='major';
  var nodes=[];
  function angle(i){ return (-90 + i*30)*Math.PI/180; }
  function refresh(){
    var set={};
    if(mode==='triad'){ var t=quality==='major'?[0,4,7]:[0,3,7]; t.forEach(function(iv){set[(rootPc+iv)%12]=iv;}); }
    nodes.forEach(function(n,i){
      var iv=set[i];
      var isMember=iv!==undefined;
      n.c.setAttribute('fill', isMember?(iv===0?'#b5451f':(iv===7?'#2f6f6a':'#c17d1f')):'#f3ead7');
      n.t.setAttribute('fill', isMember?'#fff':'#6d3b23');
    });
  }
  for(var i=0;i<12;i++){
    var a=angle(i), x=cx+R*Math.cos(a), y=cy+R*Math.sin(a);
    var c=el('circle',{cx:x,cy:y,r:17,fill:'#f3ead7',stroke:'#c9b083','stroke-width':1,style:'cursor:pointer'});
    var t=el('text',{x:x,y:y+4,'text-anchor':'middle','font-size':11,fill:'#6d3b23','font-family':'monospace','font-weight':'bold','pointer-events':'none'},NOTES[i]);
    (function(idx,cc){
      cc.addEventListener('click',function(){
        if(mode==='triad'){ rootPc=idx; refresh();
          var base=60+idx; var t3=quality==='major'?4:3;
          [0,t3,7].forEach(function(iv,k){ playMidi(base+iv, ctx().currentTime+k*0.16, 0.6); });
          setTimeout(function(){ strum([base,base+t3,base+7],'down'); }, 620);
          var ro=host.parentNode.querySelector('.readout');
          if(ro) ro.textContent=NOTES[idx]+' '+quality+'  =  '+NOTES[idx]+' + '+NOTES[(idx+t3)%12]+' + '+NOTES[(idx+7)%12];
        } else { playMidi(60+idx); }
      });
    })(i,c);
    svg.appendChild(c); svg.appendChild(t); nodes.push({c:c,t:t});
  }
  host.appendChild(svg);
  if(mode==='triad'){
    var row=document.createElement('div'); row.className='btnrow';
    var bMaj=mkbtn('Major',function(){quality='major';refresh();});
    var bMin=mkbtn('Minor',function(){quality='minor';refresh();});
    bMaj.classList.add('primary');
    row.appendChild(document.createTextNode('Quality: ')); row.appendChild(bMaj); row.appendChild(bMin);
    host.parentNode.insertBefore(row, host.nextSibling);
    refresh();
  }
}

/* ---------------- interval explorer ---------------- */
var INTERVALS=[
  ['P1',0,'Unison'],['m2',1,'Minor 2nd'],['M2',2,'Major 2nd'],['m3',3,'Minor 3rd'],
  ['M3',4,'Major 3rd'],['P4',5,'Perfect 4th'],['TT',6,'Tritone'],['P5',7,'Perfect 5th'],
  ['m6',8,'Minor 6th'],['M6',9,'Major 6th'],['m7',10,'Minor 7th'],['M7',11,'Major 7th'],['P8',12,'Octave']
];
function buildInterval(host){
  var rootMidi=60; // C4
  var W=360,H=70, L=16,R=16, y=40, n=13, sp=(W-L-R)/(n-1);
  var svg=el('svg',{viewBox:'0 0 '+W+' '+H, class:'interval-line'});
  var dots=[];
  svg.appendChild(el('line',{x1:L,y1:y,x2:W-R,y2:y,stroke:'#c9b083','stroke-width':2}));
  for(var i=0;i<n;i++){
    var x=L+i*sp;
    svg.appendChild(el('line',{x1:x,y1:y-6,x2:x,y2:y+6,stroke:'#c9b083','stroke-width':1}));
    var c=el('circle',{cx:x,cy:y,r:6,fill:i===0?'#b5451f':'#f3ead7',stroke:'#a5641a','stroke-width':1});
    svg.appendChild(c); dots.push(c);
    svg.appendChild(el('text',{x:x,y:y+22,'text-anchor':'middle','font-size':8,fill:'#8a7350','font-family':'monospace'},i));
  }
  host.appendChild(svg);
  var row=document.createElement('div'); row.className='btnrow';
  var ro=host.parentNode.querySelector('.readout');
  INTERVALS.forEach(function(iv){
    var b=mkbtn(iv[0], function(){
      dots.forEach(function(d,k){ d.setAttribute('fill', k===0?'#b5451f':(k===iv[1]?'#2f6f6a':'#f3ead7')); });
      playMidi(rootMidi, ctx().currentTime, 0.6);
      playMidi(rootMidi+iv[1], ctx().currentTime+0.4, 0.6);
      setTimeout(function(){ playMidi(rootMidi,undefined,0.5); playMidi(rootMidi+iv[1],undefined,0.5); }, 850);
      if(ro) ro.textContent=iv[2]+'  ·  '+iv[1]+' semitone'+(iv[1]===1?'':'s')+'  ·  '+noteName(rootMidi)+' → '+noteName(rootMidi+iv[1]);
    });
    row.appendChild(b);
  });
  host.parentNode.insertBefore(row, host.nextSibling);
}

/* ---------------- strum / metronome player ---------------- */
function buildStrum(host){
  var pattern=(host.getAttribute('data-pattern')||'D-DU-UDU').split('');
  while(pattern.length<8) pattern.push('-');
  var chords=(host.getAttribute('data-chords')||host.getAttribute('data-chord')||'G').split(',');
  var bpm=parseInt(host.getAttribute('data-bpm')||'80',10);
  var slots=pattern.length; // 8 eighth-notes = 2 bars of... one bar of 4/4 (8 eighths)
  // visual lane
  var lane=document.createElement('div'); lane.className='strum-lane-html';
  lane.style.cssText='display:flex;gap:4px;margin:.4rem 0;flex-wrap:wrap;';
  var cells=[];
  for(var i=0;i<slots;i++){
    var d=document.createElement('div');
    var sym=pattern[i]==='D'?'↓':(pattern[i]==='U'?'↑':'·');
    d.textContent=sym;
    d.style.cssText='width:30px;height:38px;display:flex;align-items:center;justify-content:center;'+
      'font-size:18px;border-radius:6px;border:1px solid #d8c39f;background:#fbf4e6;color:'+
      (pattern[i]==='-'?'#b7a07c':'#6d3b23')+';font-family:monospace;transition:background .05s;';
    lane.appendChild(d); cells.push(d);
  }
  host.appendChild(lane);
  var ci=0; // chord index for cycling
  var chordLbl=document.createElement('div'); chordLbl.className='readout';
  chordLbl.textContent='Chord: '+chords[0];
  host.appendChild(chordLbl);
  // controls
  var row=document.createElement('div'); row.className='btnrow';
  var playing=false, timer=null, step=0, nextT=0;
  var playBtn=mkbtn('▶ Play', function(){ playing?stop():start(); });
  playBtn.classList.add('primary');
  row.appendChild(playBtn);
  var bpmLabel=document.createElement('label'); bpmLabel.className='ctl';
  var slider=document.createElement('input'); slider.type='range'; slider.min=50; slider.max=140; slider.value=bpm;
  var bpmOut=document.createElement('span'); bpmOut.textContent=bpm+' BPM'; bpmOut.style.fontFamily='monospace';
  slider.addEventListener('input',function(){ bpm=parseInt(slider.value,10); bpmOut.textContent=bpm+' BPM'; });
  bpmLabel.appendChild(document.createTextNode('Tempo ')); bpmLabel.appendChild(slider); bpmLabel.appendChild(bpmOut);
  row.appendChild(bpmLabel);
  host.appendChild(row);

  function tick(){
    var c=ctx(), ahead=0.12;
    while(nextT < c.currentTime+ahead){
      var slot=step%slots;
      // metronome on the quarter notes (every 2 eighth slots)
      if(slot%2===0) click(nextT, slot===0);
      var sym=pattern[slot];
      if(sym!=='-'){
        var name=chords[ci%chords.length];
        strum(chordMidis(name), sym==='D'?'down':'up', nextT, 0.02);
      }
      lightCell(slot, nextT, c.currentTime);
      // advance; change chord at the top of each bar
      step++;
      if(step%slots===0) { ci++; setTimeout(function(){ chordLbl.textContent='Chord: '+chords[ci%chords.length]; },0); }
      nextT += (60/bpm)/2; // eighth-note duration
    }
    timer=setTimeout(tick,25);
  }
  function lightCell(slot, when, now){
    var delay=Math.max(0,(when-now)*1000);
    setTimeout(function(){
      cells.forEach(function(x){ x.style.background='#fbf4e6'; });
      cells[slot].style.background=pattern[slot]==='-'?'#efe1c6':'#c8e0dc';
    }, delay);
  }
  function start(){ playing=true; playBtn.textContent='■ Stop'; step=0; ci=0; nextT=ctx().currentTime+0.08; tick(); }
  function stop(){ playing=false; playBtn.textContent='▶ Play'; clearTimeout(timer);
    cells.forEach(function(x){ x.style.background='#fbf4e6'; }); }
  host._stop=stop;
}

/* ---------------- tuner ---------------- */
function buildTuner(host){
  var freqs=[82.41,110.00,146.83,196.00,246.94,329.63];
  var names=['E2','A2','D3','G3','B3','E4'];
  var wrap=document.createElement('div'); wrap.className='btnrow';
  for(var s=0;s<6;s++){
    (function(idx){
      var b=document.createElement('button'); b.className='btn';
      b.innerHTML='<b style="font-family:serif;font-size:1.05em">'+SLABEL[idx]+'</b> <span style="font-family:monospace;font-size:.72rem;color:#8a7350">'+names[idx]+' · '+freqs[idx].toFixed(1)+'Hz</span>';
      b.addEventListener('click',function(){ playMidi(OPEN[idx]); flash(b); });
      wrap.appendChild(b);
    })(s);
  }
  host.appendChild(wrap);
  var all=mkbtn('▶ Play all, low → high', function(){
    var t=ctx().currentTime+0.05;
    for(var s=0;s<6;s++) playMidi(OPEN[s], t+s*0.55, 0.6);
  });
  all.classList.add('primary');
  var r=document.createElement('div'); r.className='btnrow'; r.appendChild(all);
  host.appendChild(r);
}

/* ---------------- helpers ---------------- */
function mkbtn(label, fn){ var b=document.createElement('button'); b.className='btn'; b.textContent=label; b.addEventListener('click',fn); return b; }

/* ---------------- boot ---------------- */
function boot(){
  // chord single diagrams
  Array.prototype.forEach.call(document.querySelectorAll('.js-chord'), function(h){ renderChord(h, h.getAttribute('data-chord')); });
  // chord chip rows
  Array.prototype.forEach.call(document.querySelectorAll('.js-chord-chips'), function(h){
    (h.getAttribute('data-chords')||'').split(',').forEach(function(nm){
      nm=nm.trim(); if(!nm) return;
      var chip=document.createElement('div'); chip.className='chord-chip';
      var box=document.createElement('div'); box.className='js-chord'; renderChord(box, nm);
      chip.appendChild(box);
      var lab=document.createElement('div'); lab.className='nm'; lab.textContent=nm;
      chip.appendChild(lab);
      chip.addEventListener('click', function(){ strum(chordMidis(nm),'down'); });
      h.appendChild(chip);
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.js-fretboard'), buildFretboard);
  Array.prototype.forEach.call(document.querySelectorAll('.js-notewheel'), buildNoteWheel);
  Array.prototype.forEach.call(document.querySelectorAll('.js-interval'), buildInterval);
  Array.prototype.forEach.call(document.querySelectorAll('.js-strum'), buildStrum);
  Array.prototype.forEach.call(document.querySelectorAll('.js-tuner'), buildTuner);
  // play-scale buttons: data-root, data-scale
  Array.prototype.forEach.call(document.querySelectorAll('.js-play-scale'), function(b){
    b.addEventListener('click', function(){ playScale(b.getAttribute('data-root')||'A', b.getAttribute('data-scale')||'minor-pentatonic'); });
  });
  // generic single-note buttons: data-midi or data-note
  Array.prototype.forEach.call(document.querySelectorAll('.js-note'), function(b){
    b.addEventListener('click', function(){
      var m=b.getAttribute('data-midi'); if(m!=null) playMidi(parseInt(m,10));
      else playMidi(60+pcOfName(b.getAttribute('data-note')||'C'));
    });
  });
  // stop all strum players when leaving the page/spread
  window.addEventListener('pagehide', function(){
    Array.prototype.forEach.call(document.querySelectorAll('.js-strum'), function(h){ if(h._stop) h._stop(); });
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
