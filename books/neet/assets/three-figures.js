/* ============================================================
   three-figures.js — one offline 3D figure per page.
   Body-centred cubic (bcc) unit cell for the crystal-radius
   question (Q159). Renders from file:// via the vendored
   window.THREE bundle. Paused offscreen; reduced-motion safe.
   ============================================================ */
(function(){
  if(!window.THREE){ return; }
  var THREE = window.THREE;
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function bcc(fig){
    var canvas = fig.querySelector('canvas');
    if(!canvas) return;
    var renderer;
    try{
      renderer = new THREE.WebGLRenderer({canvas:canvas, antialias:true, alpha:true});
    }catch(err){
      // No WebGL context available — degrade gracefully, leaving the reserved
      // 16:9 box and the figure caption in place.
      fig.classList.add('three-unavailable');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 16/9, 0.1, 100);
    camera.position.set(2.6, 2.0, 3.2);

    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.minDistance = 2.4; controls.maxDistance = 8;

    scene.add(new THREE.AmbientLight(0xfff2d8, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(4,6,5); scene.add(key);
    var fill = new THREE.DirectionalLight(0x8a2f22, 0.25); fill.position.set(-4,-2,-3); scene.add(fill);

    var group = new THREE.Group(); scene.add(group);
    var a = 2; // cube edge (screen units)
    var half = a/2;
    // touching atoms along body diagonal: 4r = √3 a → r = √3/4 a
    var r = Math.sqrt(3)/4 * a;

    // cube edges
    var edgeMat = new THREE.LineBasicMaterial({color:0x8a2f22});
    var geo = new THREE.BoxGeometry(a,a,a);
    var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    group.add(edges);

    // body diagonal (dashed)
    var diagGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half,-half,-half), new THREE.Vector3(half,half,half)
    ]);
    var diag = new THREE.Line(diagGeo, new THREE.LineDashedMaterial({color:0x3f6d3a, dashSize:0.18, gapSize:0.12}));
    diag.computeLineDistances(); group.add(diag);

    var cornerMat = new THREE.MeshStandardMaterial({color:0xb87333, roughness:0.45, metalness:0.35});
    var centerMat = new THREE.MeshStandardMaterial({color:0x8a2f22, roughness:0.35, metalness:0.4, emissive:0x2a0d08, emissiveIntensity:0.3});
    var sph = new THREE.SphereGeometry(r, 40, 32);
    var corners = [-half, half];
    corners.forEach(function(x){ corners.forEach(function(y){ corners.forEach(function(z){
      var m = new THREE.Mesh(sph, cornerMat); m.position.set(x,y,z); group.add(m);
    });});});
    var center = new THREE.Mesh(sph, centerMat); center.position.set(0,0,0); group.add(center);

    function size(){
      var w = fig.clientWidth, h = w*9/16;
      renderer.setSize(w, h, false);
      camera.aspect = 16/9; camera.updateProjectionMatrix();
    }
    size();
    window.addEventListener('resize', size);
    // re-fit after the spread relayout / fonts settle
    setTimeout(size, 300);

    var visible = false, raf = 0;
    function loop(){
      controls.update();
      if(!REDUCED) group.rotation.y += 0.0035;
      renderer.render(scene, camera);
      if(visible && !REDUCED) raf = requestAnimationFrame(loop);
    }
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        visible = e.isIntersecting;
        if(visible){ size(); if(!REDUCED){ if(!raf) raf = requestAnimationFrame(loop); } else renderer.render(scene,camera); }
        else if(raf){ cancelAnimationFrame(raf); raf=0; }
      });
    }, {threshold:0.15});
    io.observe(fig);
    // keep canvas gestures from turning the page
    canvas.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
    renderer.render(scene, camera);
  }

  function boot(){ document.querySelectorAll('.three-figure[data-scene="bcc"]').forEach(bcc); }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
