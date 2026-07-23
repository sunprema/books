/* three-figures.js — offline-safe 3D figures for the OTP book.
   Loads window.THREE from the vendored IIFE bundle. <canvas data-three="tree">
   renders an interactive supervision tree that lives out "let it crash": a worker
   periodically dies (flashes crimson, shrinks) and the supervisor restarts it
   (a fresh teal process grows back). Rules: size to the figure (not window),
   pause offscreen, honor prefers-reduced-motion, OrbitControls drag/wheel only,
   one GL context per page, dispose on teardown. */
(function(){
  if(!window.THREE){ return; }
  var THREE = window.THREE;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var COL = {
    rootSup:  0x6b3fa0,   // grape — root supervisor
    sup:      0x8a5cc0,   // lighter grape — sub-supervisors
    worker:   0x167f6c,   // teal — healthy worker
    fresh:    0x27a58c,   // brighter teal — just restarted
    crash:    0xb23a48,   // crimson — crashing
    edge:     0x9a6fc7    // grape-lite — supervision links
  };

  function makeLabel(text, rgb){
    var cvs = document.createElement('canvas');
    var s = 256; cvs.width = s; cvs.height = 64;
    var g = cvs.getContext('2d');
    g.clearRect(0,0,s,64);
    g.font = 'bold 30px "SF Mono", Menlo, monospace';
    g.fillStyle = rgb; g.textAlign='center'; g.textBaseline='middle';
    g.fillText(text, s/2, 34);
    var tex = new THREE.CanvasTexture(cvs); tex.anisotropy = 4;
    var mat = new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false });
    var sp = new THREE.Sprite(mat);
    sp.scale.set(1.5, 0.375, 1);
    return sp;
  }

  function buildTree(scene){
    var group = new THREE.Group();

    // layout: root supervisor -> 2 sub-supervisors -> workers (spread in x & z)
    var boxGeo = new THREE.BoxGeometry(0.72, 0.46, 0.72);
    function node(x,y,z,color){
      var m = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
        color:color, roughness:0.45, metalness:0.08,
        emissive:color, emissiveIntensity:0.12 }));
      m.position.set(x,y,z);
      group.add(m);
      return m;
    }
    function edge(a,b){
      var g = new THREE.BufferGeometry().setFromPoints([a.position.clone(), b.position.clone()]);
      var l = new THREE.Line(g, new THREE.LineBasicMaterial({ color:0x9a6fc7, transparent:true, opacity:0.6 }));
      l.userData.a=a; l.userData.b=b;
      group.add(l);
      return l;
    }

    var root = node(0, 2.1, 0, COL.rootSup);
    root.scale.set(1.15,1.15,1.15);
    var supL = node(-1.7, 0.5, 0, COL.sup);
    var supR = node( 1.7, 0.5, 0, COL.sup);
    edge(root, supL); edge(root, supR);

    // label above the root so the structure reads at a glance
    var rootLbl = makeLabel('Supervisor', '#4a2a72'); rootLbl.position.set(0, 2.8, 0); group.add(rootLbl);

    // workers under each sub-supervisor, given z-depth so the tree reads in 3D
    var workers = [];
    var layout = [
      [supL, [[-2.6,-1.3, 0.5],[-1.7,-1.3,-0.6],[-0.9,-1.3, 0.4]]],
      [supR, [[ 0.9,-1.3,-0.5],[ 1.7,-1.3, 0.6],[ 2.6,-1.3,-0.4]]]
    ];
    layout.forEach(function(pair){
      var sup = pair[0];
      pair[1].forEach(function(p){
        var w = node(p[0],p[1],p[2], COL.worker);
        w.userData = { state:'ok', t:0, sup:sup, base:COL.worker };
        edge(sup, w);
        workers.push(w);
      });
    });

    group.userData = { workers:workers, root:root, sups:[supL,supR], nextCrash:1.5, crashing:null };
    scene.add(group);
    return group;
  }

  var _c = new THREE.Color();
  function stepTree(group, t, dt){
    var ud = group.userData;
    // trigger a new crash on a healthy worker
    if(!ud.crashing && t > ud.nextCrash){
      var pool = ud.workers.filter(function(w){ return w.userData.state==='ok'; });
      if(pool.length){
        var w = pool[(Math.floor(t*7.3)) % pool.length];
        w.userData.state='crash'; w.userData.t=0;
        ud.crashing = w;
      }
    }
    // animate whichever worker is mid-lifecycle
    ud.workers.forEach(function(w){
      var s = w.userData;
      if(s.state==='ok'){
        // gentle idle breathing
        var b = 1 + Math.sin(t*2 + w.position.x)*0.02;
        w.scale.setScalar(b);
        return;
      }
      s.t += dt;
      if(s.state==='crash'){
        // flash crimson, jitter, then shrink to nothing over ~0.5s
        var p = Math.min(1, s.t/0.5);
        _c.setHex(s.base).lerp(new THREE.Color(COL.crash), Math.min(1,p*2));
        w.material.color.copy(_c); w.material.emissive.copy(_c);
        w.material.emissiveIntensity = 0.12 + 0.5*(1-p);
        var sc = Math.max(0.001, 1-p);
        w.scale.setScalar(sc + Math.sin(s.t*60)*0.03*(1-p));  // jitter as it dies
        if(p>=1){ s.state='gone'; s.t=0; }
      } else if(s.state==='gone'){
        w.scale.setScalar(0.001);
        if(s.t>0.35){ s.state='restart'; s.t=0; w.material.color.setHex(COL.fresh); w.material.emissive.setHex(COL.fresh); }
      } else if(s.state==='restart'){
        // a fresh process grows back in bright teal, settling to healthy color
        var q = Math.min(1, s.t/0.5);
        w.scale.setScalar(q);
        w.material.emissiveIntensity = 0.4*(1-q)+0.12;
        _c.setHex(COL.fresh).lerp(new THREE.Color(COL.worker), q);
        w.material.color.copy(_c); w.material.emissive.copy(_c);
        if(q>=1){
          s.state='ok'; s.base=COL.worker; w.material.color.setHex(COL.worker);
          w.material.emissive.setHex(COL.worker); w.material.emissiveIntensity=0.12;
          ud.crashing=null; ud.nextCrash = t + 1.8 + Math.random()*1.4;
        }
      }
    });
    // slow auto-orbit of the whole tree for life
    if(!reduce) group.rotation.y = Math.sin(t*0.15)*0.5;
  }

  var BUILD = { tree: buildTree };
  var STEP  = { tree: stepTree };

  function mount(canvas){
    var name = canvas.getAttribute('data-three');
    var build = BUILD[name]; if(!build) return;

    var renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 16/10, 0.1, 100);
    camera.position.set(0, 0.7, 7.2);

    scene.add(new THREE.AmbientLight(0xfff3e3, 0.85));
    var key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3,5,4); scene.add(key);
    var rim = new THREE.DirectionalLight(0xc9a6ff, 0.45); rim.position.set(-4,-1,-3); scene.add(rim);

    var group = build(scene);
    var step = STEP[name];

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 4.5; controls.maxDistance = 12;
    controls.autoRotate = false;
    controls.target.set(0, 0.3, 0);

    ['wheel','pointerdown','touchstart'].forEach(function(ev){
      canvas.addEventListener(ev, function(e){ e.stopPropagation(); }, {passive:true});
    });

    function fit(){
      var rect = canvas.getBoundingClientRect();
      if(rect.width < 2) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width/rect.height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    var running=false, tprev=0, t0=0;
    function frame(ts){
      if(!running) return;
      if(!t0){ t0=ts; tprev=ts; }
      var t=(ts-t0)/1000, dt=Math.min(0.05,(ts-tprev)/1000); tprev=ts;
      if(step) step(group, t, dt);
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    function play(){ if(running||reduce) return; running=true; t0=0; requestAnimationFrame(frame); }
    function stop(){ running=false; t0=0; }

    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        var vis = e.isIntersecting && e.intersectionRatio>0.15;
        if(vis){ fit(); play(); } else stop();
      });
    }, {threshold:[0,0.15,0.5]});
    io.observe(canvas);

    window.addEventListener('resize', fit);
    window.addEventListener('bookbank:relayout', function(){ setTimeout(fit,30); });

    fit();
    if(reduce){ renderer.render(scene,camera); }
  }

  function init(){
    Array.prototype.forEach.call(document.querySelectorAll('canvas[data-three]'), mount);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
