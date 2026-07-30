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

    // Deterministic jitter — real cristae are irregular, but a book figure must
    // look identical every time it is rendered or screenshotted.
    var seed = 20260727 >>> 0;
    function rnd(){
      seed += 0x6D2B79F5;
      var r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    }

    // OUTER membrane — the smooth outer bag.
    var outer = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
      color:0xe5643b, transparent:true, opacity:0.26, roughness:0.5, metalness:0.0,
      side:THREE.DoubleSide, depthWrite:false
    }));
    outer.scale.set(LEN, RAD, RAD);
    outer.renderOrder = 4;
    group.add(outer);

    // INNER BOUNDARY membrane — the second bag, leaving the thin intermembrane
    // space between the two. The cristae below are infoldings of THIS membrane.
    var inner = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({
      color:0xd8552e, transparent:true, opacity:0.30, roughness:0.45, metalness:0.0,
      side:THREE.DoubleSide, depthWrite:false
    }));
    inner.scale.set(LEN*0.88, RAD*0.80, RAD*0.80);   // gap to the outer bag = intermembrane space
    inner.renderOrder = 3;
    group.add(inner);

    // MATRIX — the gel the cristae project into.
    var matrix = new THREE.Mesh(sphereGeo,
      new THREE.MeshStandardMaterial({ color:0xf4bf9a, transparent:true, opacity:0.26,
        roughness:0.9, metalness:0.0, depthWrite:false }));
    matrix.scale.set(LEN*0.84, RAD*0.75, RAD*0.75);
    matrix.renderOrder = 1;
    group.add(matrix);

    // CRISTAE — lamellar PLATES, not hoops. Each is a flattened sac of inner
    // membrane attached to the boundary membrane along one edge (through a narrow
    // crista junction) and projecting across the matrix. Attachment side rotates
    // around the tube and depth varies, the way real cristae do.
    var cristaeMat = new THREE.MeshStandardMaterial({
      color:0xc9502a, roughness:0.5, metalness:0.04, side:THREE.DoubleSide });
    var junctionMat = new THREE.MeshStandardMaterial({
      color:0xbf4a26, roughness:0.6, side:THREE.DoubleSide });

    // ATP synthase — F1F0 "lollipops": an F0 stalk in the crista membrane and an
    // F1 head projecting INTO THE MATRIX. On a plate the matrix lies off both
    // faces, so heads point along the plate normal (±x), not toward the axis.
    var headGeo  = new THREE.SphereGeometry(0.058, 12, 12);
    var stalkGeo = new THREE.CylinderGeometry(0.011, 0.018, 0.085, 6);
    var synthHeadMat = new THREE.MeshStandardMaterial({
      color:0xffd05a, emissive:0xf0a020, emissiveIntensity:0.4, roughness:0.35 });
    var synthStalkMat = new THREE.MeshStandardMaterial({
      color:0xb5842f, roughness:0.6, metalness:0.1 });
    function addSynthase(px, py, pz, sign){
      var g = new THREE.Group();
      var stalk = new THREE.Mesh(stalkGeo, synthStalkMat); stalk.position.y = 0.042;
      var head  = new THREE.Mesh(headGeo,  synthHeadMat);  head.position.y  = 0.105;
      g.add(stalk); g.add(head);
      g.position.set(px, py, pz);
      g.rotation.z = sign > 0 ? -Math.PI/2 : Math.PI/2;   // +y local -> ±x world
      group.add(g);
    }

    var cristaeX = [];
    var N = 8;
    var plateGeo = new THREE.CylinderGeometry(1, 1, 1, 48, 1, false);  // unit disc, scaled per crista
    for(var k=0;k<N;k++){
      var f = (k/(N-1))*2 - 1;                       // -1..1 along the long axis
      var x = f*1.52 + (rnd()-0.5)*0.10;             // jittered spacing
      cristaeX.push(x);

      // local radius of the inner boundary membrane at this x
      var prof = Math.sqrt(Math.max(0.04, 1 - (x/(LEN*0.9))*(x/(LEN*0.9))));
      var rInner = RAD*0.80*prof;
      var rPlate = rInner*(0.58 + rnd()*0.14);       // depth varies crista to crista
      var off    = rInner - rPlate;                  // so the far edge meets the membrane
      var phi    = k*2.399 + rnd()*0.5;              // attachment rotates around the tube
      var cy = Math.cos(phi)*off, cz = Math.sin(phi)*off;

      var plate = new THREE.Mesh(plateGeo, cristaeMat);
      plate.scale.set(rPlate, 0.042, rPlate);        // thin sac, not a wire
      plate.rotation.z = Math.PI/2;                  // disc faces perpendicular to the axis
      plate.rotation.x = (rnd()-0.5)*0.22;           // slight natural tilt
      plate.position.set(x, cy, cz);
      group.add(plate);

      // CRISTA JUNCTION — the narrow neck where the sac opens to the
      // intermembrane space. Small, and that smallness is the point.
      var jn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10), junctionMat);
      jn.position.set(x, Math.cos(phi)*(rInner+0.02), Math.sin(phi)*(rInner+0.02));
      jn.rotation.z = Math.PI/2;
      group.add(jn);

      // ATP synthase rows on BOTH faces of the plate, heads into the matrix.
      var heads = 5;
      for(var h=0;h<heads;h++){
        var a  = (h/heads)*Math.PI*2 + k*0.7;
        var rr = rPlate*(0.42 + 0.42*((h%3)/2));
        var yy = cy + Math.cos(a)*rr, zz = cz + Math.sin(a)*rr;
        addSynthase(x + 0.03, yy, zz, +1);
        if(h%2===0) addSynthase(x - 0.03, yy, zz, -1);
      }
    }

    // MATRIX CONTENTS — mtDNA nucleoids and mitochondrial ribosomes, so the
    // interior reads as a living compartment rather than an empty bag.
    var dnaMat = new THREE.MeshStandardMaterial({
      color:0x6c4bd0, emissive:0x3a208c, emissiveIntensity:0.25, roughness:0.5 });
    [[-0.72,0.20,0.12],[0.88,-0.16,-0.14]].forEach(function(p){
      var dna = new THREE.Mesh(new THREE.TorusKnotGeometry(0.13,0.028,64,8,2,3), dnaMat);
      dna.position.set(p[0],p[1],p[2]);
      dna.scale.set(1,0.7,0.7);
      group.add(dna);
    });
    var riboGeo = new THREE.SphereGeometry(0.028, 8, 8);
    var riboMat = new THREE.MeshStandardMaterial({ color:0x8a3b1f, roughness:0.85 });
    for(var r=0;r<14;r++){
      var rb = new THREE.Mesh(riboGeo, riboMat);
      var ra = r*2.39943, rx = (r/14)*2.9 - 1.45;
      var rr2 = 0.46*Math.sqrt(Math.max(0.02, 1-(rx/1.85)*(rx/1.85)));
      rb.position.set(rx, Math.cos(ra)*rr2, Math.sin(ra)*rr2);
      group.add(rb);
    }

    // ATP sparks — emissive motes leaving the cristae.
    var sparks = new THREE.Group();
    for(var s=0;s<12;s++){
      var sp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10),
        new THREE.MeshStandardMaterial({ color:0xffe08a, emissive:0xf0a020, emissiveIntensity:0.9, roughness:0.3 }));
      sp.userData.seed = s;
      sp.userData.cx = cristaeX[s % cristaeX.length];
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
    camera.position.set(2.35, 1.95, 4.35);   // 3/4 view: see the crista faces, not only their edges

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
