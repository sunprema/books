/* ============================================================
   three-figures.js — offline three.js scenes for SpaceTime.
   Loads window.THREE from ../assets/vendor/three.iife.js.
   Each figure: sized to its box, paused offscreen, honors
   reduced-motion, disposes its GL context on pagehide, and
   confines interaction to mouse-drag/wheel (never arrow keys,
   which the pager owns).
   ============================================================ */
(function(){
  "use strict";
  var THREE = window.THREE;
  if(!THREE){ return; }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scenes = [];

  function mount(host, aspect, build){
    var canvas = document.createElement('canvas');
    host.appendChild(canvas);
    var renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true, alpha:false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    var camera = new THREE.PerspectiveCamera(50, 16/9, 0.1, 200);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 40;
    // keep arrow keys for the pager, not the camera
    controls.enableKeys = false; if(controls.keys) controls.keys = {};
    // don't let canvas gestures bubble to nav
    ['wheel','pointerdown','touchstart'].forEach(function(ev){
      canvas.addEventListener(ev, function(e){ e.stopPropagation(); }, {passive:true});
    });

    function size(){
      var w = host.clientWidth || 480, h = Math.round(w/ (16/9));
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    size();
    window.addEventListener('resize', size);
    window.addEventListener('bookbank:relayout', size);

    var api = build(scene, camera, renderer, controls);
    if(api && api.camera) camera.copy(api.camera);

    var visible = true, alive = true;
    if('IntersectionObserver' in window){
      new IntersectionObserver(function(es){
        es.forEach(function(e){ visible = e.isIntersecting && e.intersectionRatio>0; });
      }, {threshold:[0,0.01]}).observe(host);
    }
    var t0 = 0;
    function frame(t){
      if(!alive) return;
      requestAnimationFrame(frame);
      if(!visible) return;
      var dt = t0 ? Math.min(0.05,(t-t0)/1000) : 0; t0 = t;
      controls.update();
      if(api && api.tick && !reduce) api.tick(dt, t/1000);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    // one static frame for reduced-motion users
    controls.update(); renderer.render(scene,camera);

    var rec = { host:host, dispose:function(){
      alive=false; if(api&&api.dispose) api.dispose();
      controls.dispose(); renderer.dispose();
      renderer.forceContextLoss && renderer.forceContextLoss();
    }};
    scenes.push(rec);
    return rec;
  }
  window.addEventListener('pagehide', function(){ scenes.forEach(function(s){ try{s.dispose();}catch(e){} }); });

  // ---- shared: a field of stars -------------------------------
  function addStars(scene, n){
    var g = new THREE.BufferGeometry(), pos = new Float32Array(n*3), seed=99;
    for(var i=0;i<n;i++){
      seed=(seed*9301+49297)%233280; var u=seed/233280;
      seed=(seed*9301+49297)%233280; var v=seed/233280;
      var th=u*Math.PI*2, ph=Math.acos(2*v-1), R=60+((seed%1000)/1000)*40;
      pos[i*3]=R*Math.sin(ph)*Math.cos(th); pos[i*3+1]=R*Math.cos(ph); pos[i*3+2]=R*Math.sin(ph)*Math.sin(th);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos,3));
    var m = new THREE.PointsMaterial({ color:0xcfe0ff, size:0.35, sizeAttenuation:true });
    scene.add(new THREE.Points(g,m));
  }

  // =============================================================
  // A) SPACETIME WELL — a curved grid sheet + orbiting test mass
  // =============================================================
  function well(scene, camera, renderer, controls){
    addStars(scene, 400);
    scene.add(new THREE.AmbientLight(0x334466, 1.2));
    var key = new THREE.PointLight(0x9ecbff, 1.4, 0, 2); key.position.set(6,10,6); scene.add(key);

    // warped plane: y = -k / (r + s)   (a smooth gravity well)
    var N = 60, size = 24, k = 26, s = 1.3;
    var geo = new THREE.PlaneGeometry(size, size, N, N);
    geo.rotateX(-Math.PI/2);
    var p = geo.attributes.position;
    for(var i=0;i<p.count;i++){
      var x=p.getX(i), z=p.getZ(i), r=Math.sqrt(x*x+z*z);
      p.setY(i, -k/(r+s));
    }
    geo.computeVertexNormals();
    var mat = new THREE.MeshBasicMaterial({ color:0x7cc4ff, wireframe:true, transparent:true, opacity:0.5 });
    var sheet = new THREE.Mesh(geo, mat); scene.add(sheet);

    // the central mass (a star sitting in its own dimple)
    var star = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32),
      new THREE.MeshStandardMaterial({ color:0xffd479, emissive:0xff9d3c, emissiveIntensity:0.9, roughness:.5 }));
    star.position.y = -k/s; scene.add(star);
    var glow = new THREE.Mesh(new THREE.SphereGeometry(1.7,24,24),
      new THREE.MeshBasicMaterial({ color:0xffb04a, transparent:true, opacity:0.18 }));
    glow.position.copy(star.position); scene.add(glow);

    // an orbiting test particle riding the sheet
    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.32,20,20),
      new THREE.MeshStandardMaterial({ color:0x7cc4ff, emissive:0x2b6fbf, emissiveIntensity:0.6 }));
    scene.add(ball);
    var trailGeo = new THREE.BufferGeometry();
    var trail = new Float32Array(200*3); trailGeo.setAttribute('position', new THREE.BufferAttribute(trail,3));
    var trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color:0x7cc4ff, transparent:true, opacity:.5 }));
    scene.add(trailLine); var ti=0, tc=0;

    camera.position.set(0, 12, 20);
    controls.target.set(0,-4,0);
    var ang=0;
    function heightAt(r){ return -k/(r+s); }
    return {
      tick:function(dt,t){
        ang += dt*0.6;
        var orbitR = 6.2 + Math.sin(t*0.5)*0.6;
        var x=Math.cos(ang)*orbitR, z=Math.sin(ang)*orbitR;
        ball.position.set(x, heightAt(orbitR)+0.3, z);
        // push trail
        trail.copyWithin(0, 3);
        trail[ (Math.min(tc,199))*3 ] = ball.position.x;
        trail[ (Math.min(tc,199))*3+1 ] = ball.position.y;
        trail[ (Math.min(tc,199))*3+2 ] = ball.position.z;
        tc=Math.min(tc+1,199); trailGeo.setDrawRange(0,tc); trailGeo.attributes.position.needsUpdate=true;
        star.rotation.y += dt*0.2;
      },
      dispose:function(){ geo.dispose(); mat.dispose(); }
    };
  }

  // =============================================================
  // B) BLACK HOLE — shadow, glowing photon ring, accretion disk
  // =============================================================
  function blackhole(scene, camera, renderer, controls){
    addStars(scene, 600);
    // the shadow: a pure black sphere
    var hole = new THREE.Mesh(new THREE.SphereGeometry(2.0, 48, 48),
      new THREE.MeshBasicMaterial({ color:0x000000 }));
    scene.add(hole);
    // the photon ring — a bright thin torus hugging the shadow
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.05, 16, 120),
      new THREE.MeshBasicMaterial({ color:0xfff3d0 }));
    scene.add(ring);
    // accretion disk: a flat annulus with a hot inner edge
    var diskGeo = new THREE.RingGeometry(2.6, 7.2, 128, 1);
    // vertex colors: hot (inner) → cool (outer)
    var pos=diskGeo.attributes.position, col=new Float32Array(pos.count*3);
    for(var i=0;i<pos.count;i++){
      var x=pos.getX(i), y=pos.getY(i), r=Math.sqrt(x*x+y*y);
      var f=(r-2.6)/(7.2-2.6);                       // 0 inner .. 1 outer
      var cH=new THREE.Color(0xfff2c4), cM=new THREE.Color(0xff9d3c), cC=new THREE.Color(0x5b3aa0);
      var c = f<0.5 ? cH.clone().lerp(cM, f/0.5) : cM.clone().lerp(cC,(f-0.5)/0.5);
      col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b;
    }
    diskGeo.setAttribute('color', new THREE.BufferAttribute(col,3));
    var disk = new THREE.Mesh(diskGeo, new THREE.MeshBasicMaterial({ vertexColors:true, side:THREE.DoubleSide,
      transparent:true, opacity:0.9 }));
    disk.rotation.x = -Math.PI/2 + 0.42;             // tilt toward viewer
    scene.add(disk);
    // a faint second disk arc lifted above to hint at lensed far side
    var arc = new THREE.Mesh(new THREE.TorusGeometry(4.4,0.5,8,80, Math.PI),
      new THREE.MeshBasicMaterial({ color:0xff9d3c, transparent:true, opacity:0.22 }));
    arc.rotation.x = Math.PI/2; arc.position.y=2.4; scene.add(arc);

    camera.position.set(0, 3.2, 12);
    controls.target.set(0,0,0);
    return {
      tick:function(dt,t){ disk.rotation.z += dt*0.35; arc.rotation.z -= dt*0.1; ring.rotation.z += dt*0.05; },
      dispose:function(){ diskGeo.dispose(); }
    };
  }

  var reg = { '.js-3d-well':well, '.js-3d-blackhole':blackhole };
  Object.keys(reg).forEach(function(sel){
    document.querySelectorAll(sel).forEach(function(el){ try{ mount(el, 16/9, reg[sel]); }catch(e){} });
  });
})();
