/* three-figures.js — offline-safe 3D figures for the book.
   Loads window.THREE from the vendored IIFE bundle. Each <canvas data-three="name">
   gets a scene. Rules: size to the figure (not window), pause offscreen,
   honor prefers-reduced-motion (one static frame), OrbitControls drag/wheel only,
   one GL context per page, dispose on teardown. */
(function(){
  if(!window.THREE){ return; }
  var THREE = window.THREE;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildMitochondrion(scene){
    var group = new THREE.Group();
    var LEN = 2.15;   // long half-axis
    var RAD = 1.0;    // short half-axis
    var sphereGeo = new THREE.SphereGeometry(1, 64, 44);

    // OUTER membrane — smooth, translucent. A mitochondrion is a bag inside a bag;
    // this is the smooth outer bag.
    var outer = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
      color:0xe5643b, transparent:true, opacity:0.11, roughness:0.5, metalness:0.0,
      side:THREE.DoubleSide, depthWrite:false
    }));
    outer.scale.set(LEN, RAD, RAD);
    outer.renderOrder = 3;
    group.add(outer);

    // INNER membrane (boundary) — sits just inside the outer, leaving the thin
    // *intermembrane space* between the two. Its infoldings are the cristae.
    var inner = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
      color:0xd8552e, transparent:true, opacity:0.15, roughness:0.5, metalness:0.0,
      side:THREE.DoubleSide, depthWrite:false
    }));
    inner.scale.set(LEN*0.9, RAD*0.86, RAD*0.86);
    inner.renderOrder = 2;
    group.add(inner);

    // MATRIX — the gel filling the inner membrane (mtDNA, ribosomes, Krebs-cycle
    // enzymes). Kept semi-transparent so the cristae read as folds *within* it.
    var matrix = new THREE.Mesh(sphereGeo,
      new THREE.MeshStandardMaterial({ color:0xf4bf9a, transparent:true, opacity:0.34,
        roughness:0.9, metalness:0.0, depthWrite:false }));
    matrix.scale.set(LEN*0.85, RAD*0.79, RAD*0.79);
    matrix.renderOrder = 1;
    group.add(matrix);

    // CRISTAE — the shelf-like *lamellar* infoldings of the inner membrane. Real
    // cristae are stacked plates that reach deep across the matrix, joined to the
    // boundary membrane by narrow necks (crista junctions). Their vast folded
    // surface is where the energy machinery lives — more folds, more ATP. Here
    // each is a nearly-complete flattened shelf running across the tube, with a
    // small gap for the junction; consecutive shelves alternate that gap so the
    // stack interleaves the way real cristae do.
    var cristaeMat = new THREE.MeshStandardMaterial({
      color:0xc9502a, roughness:0.5, metalness:0.04, side:THREE.DoubleSide });
    // ATP synthase — the F1F0 "lollipops": a stubby F0 stalk anchored in the
    // crista membrane, topped by the round F1 head that pokes into the matrix and
    // spins to make ATP. Shared geometry, instanced by hand for a light scene.
    var headGeo  = new THREE.SphereGeometry(0.05, 12, 12);
    var stalkGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.1, 6);
    var synthHeadMat = new THREE.MeshStandardMaterial({
      color:0xffd05a, emissive:0xf0a020, emissiveIntensity:0.4, roughness:0.35 });
    var synthStalkMat = new THREE.MeshStandardMaterial({
      color:0xb5842f, roughness:0.6, metalness:0.1 });
    var UP = new THREE.Vector3(0,1,0), _q = new THREE.Quaternion(), _d = new THREE.Vector3();
    function addSynthase(x, y, z){
      // a lollipop planted on the crista at (x,y,z), pointing *inward* to the axis
      var g = new THREE.Group();
      var stalk = new THREE.Mesh(stalkGeo, synthStalkMat); stalk.position.y = 0.05;
      var head  = new THREE.Mesh(headGeo, synthHeadMat);   head.position.y  = 0.12;
      g.add(stalk); g.add(head);
      g.position.set(x, y, z);
      _d.set(0, -y, -z);                                   // toward the long axis
      if(_d.lengthSq() < 1e-6) _d.set(0,1,0);
      g.quaternion.copy(_q.setFromUnitVectors(UP, _d.normalize()));
      group.add(g);
    }

    var cristaeX = [];
    var N = 9;
    for(var k=0;k<N;k++){
      var f = (k/(N-1))*2 - 1;                       // -1..1 along long axis
      var x = f*1.6;
      cristaeX.push(x);
      // inner-membrane radius at this x (follow the inner ellipsoid profile)
      var prof = Math.sqrt(Math.max(0.03, 1 - (x/(LEN*0.9))*(x/(LEN*0.9))));
      var rInner = RAD*0.86*prof;
      var rFold = rInner*0.82;                        // shelf reaches most of the way in
      // a flattened near-complete torus = a lamellar shelf spanning the tube,
      // with a narrow gap standing in for the crista junction/neck
      var tor = new THREE.Mesh(
        new THREE.TorusGeometry(rFold, 0.055, 14, 60, Math.PI*1.82), cristaeMat.clone());
      tor.rotation.y = Math.PI/2;                     // shelf plane perpendicular to the axis
      tor.rotation.z = (k%2 ? 0.9 : -0.9) + 1.6;      // alternate where the junction gap sits
      tor.position.x = x;
      tor.scale.set(1, 0.62, 1);                      // flatten into a plate
      group.add(tor);
      // line ATP-synthase lollipops along the shelf rim, both faces
      var heads = 8;
      for(var h=0;h<heads;h++){
        var ang = (h/heads)*Math.PI*1.82 + 0.25;
        var yy = Math.sin(ang)*rFold*0.62, zz = Math.cos(ang)*rFold;
        addSynthase(x + (h%2?0.05:-0.05), yy, zz);
      }
    }

    // MATRIX CONTENTS — a couple of tangled mtDNA nucleoids and scattered
    // mitochondrial ribosomes, so the interior reads as a living compartment,
    // not an empty bag.
    var dnaMat = new THREE.MeshStandardMaterial({
      color:0x6c4bd0, emissive:0x3a208c, emissiveIntensity:0.25, roughness:0.5 });
    [[-0.7,0.18,0.1],[0.85,-0.15,-0.12]].forEach(function(p){
      var dna = new THREE.Mesh(new THREE.TorusKnotGeometry(0.13,0.03,64,8,2,3), dnaMat);
      dna.position.set(p[0],p[1],p[2]);
      dna.scale.set(1,0.7,0.7);
      group.add(dna);
    });
    var riboGeo = new THREE.SphereGeometry(0.03, 8, 8);
    var riboMat = new THREE.MeshStandardMaterial({ color:0x8a3b1f, roughness:0.85 });
    for(var r=0;r<22;r++){
      var rb = new THREE.Mesh(riboGeo, riboMat);
      var ra = r*2.39943, rx = (r/22)*3.0 - 1.5;
      var rr = 0.5*Math.sqrt(Math.max(0.02, 1-(rx/1.85)*(rx/1.85)));
      rb.position.set(rx, Math.cos(ra)*rr, Math.sin(ra)*rr);
      group.add(rb);
    }

    // ATP sparks — emissive motes that stream *out* of the cristae, the energy
    // output leaving the powerhouse.
    var sparks = new THREE.Group();
    for(var s=0;s<12;s++){
      var sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10),
        new THREE.MeshStandardMaterial({ color:0xffe08a, emissive:0xf0a020, emissiveIntensity:0.9, roughness:0.3 }));
      sp.userData.seed = s;
      sp.userData.cx = cristaeX[s % cristaeX.length];  // born at a crista
      sparks.add(sp);
    }
    group.add(sparks);
    group.userData.sparks = sparks;

    scene.add(group);
    return group;
  }

  var BUILD = { mitochondrion: buildMitochondrion };

  function mount(canvas){
    var name = canvas.getAttribute('data-three');
    var build = BUILD[name]; if(!build) return;

    var renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true, alpha:true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 16/10, 0.1, 100);
    camera.position.set(0, 1.4, 5.2);

    scene.add(new THREE.AmbientLight(0xfff0dd, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3,4,5); scene.add(key);
    var rim = new THREE.DirectionalLight(0xffd9a0, 0.5); rim.position.set(-4,-2,-3); scene.add(rim);

    var group = build(scene);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 3.5; controls.maxDistance = 8;
    controls.autoRotate = !reduce; controls.autoRotateSpeed = 0.9;

    // stop canvas gestures from bubbling to nav links / page
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

    var running=false, visible=false, t0=0;
    function frame(ts){
      if(!running) return;
      if(!t0) t0=ts;
      var t=(ts-t0)/1000;
      var sparks = group.userData.sparks;
      if(sparks){
        for(var i=0;i<sparks.children.length;i++){
          var sp=sparks.children[i];
          var ph=((t*0.5 + sp.userData.seed*0.37) % 1);   // 0..1 lifecycle, looping
          var rr=0.55 + ph*2.6;                            // grow outward from a crista
          var a=sp.userData.seed*2.4 + t*1.1;
          sp.position.set(sp.userData.cx*(1-ph*0.35), Math.cos(a)*rr*0.42, Math.sin(a)*rr*0.55);
          sp.material.emissiveIntensity = 1.0*(1-ph);      // fade as the ATP leaves
          var sc=1-ph*0.5; sp.scale.set(sc,sc,sc);
        }
      }
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    }
    function play(){ if(running||reduce) return; running=true; t0=0; requestAnimationFrame(frame); }
    function stop(){ running=false; t0=0; }

    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        visible = e.isIntersecting && e.intersectionRatio>0.15;
        if(visible){ fit(); play(); } else stop();
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
