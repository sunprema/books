/* ============================================================
   three-figures.js — offline 3D figures for "Fun with Calculus".
   Requires window.THREE (vendored IIFE, no network). Builds a
   SOLID OF REVOLUTION: the region under a profile curve y=f(x),
   spun about the x-axis, sweeping out a volume V = π∫ f(x)² dx.
   Orbit with mouse-drag / wheel. Pauses offscreen; honours
   prefers-reduced-motion; disposes its GL context on teardown.
   ============================================================ */
(function(){
"use strict";
if(!window.THREE){ return; }
var THREE = window.THREE;
var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function build(fig){
  var canvas = fig.querySelector('canvas'); if(!canvas) return;

  // profile: radius r(t) = f(x) along the axis x in [x0,x1]
  var x0 = 0, x1 = 4;
  function prof(x){ return 1.05 + 0.55*Math.sin(x*1.15) + 0.06*x; }   // a turned "vase"

  var renderer = new THREE.WebGLRenderer({ canvas:canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101826);

  var camera = new THREE.PerspectiveCamera(42, 16/10, 0.1, 100);
  camera.position.set(3.2, 2.3, 6.2);

  // lights
  scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x20140a, 0.85));
  var key = new THREE.DirectionalLight(0xfff0d8, 1.15); key.position.set(4,6,5); scene.add(key);
  var rim = new THREE.DirectionalLight(0x6f9bd8, 0.5); rim.position.set(-5,-2,-4); scene.add(rim);

  // --- lathe profile: LatheGeometry spins points (radius, height) about the Y axis.
  // We treat "height" as x and "radius" as f(x), then lay the solid along X. ---
  var pts = [], N = 90, i;
  for(i=0;i<=N;i++){ var x = x0 + (x1-x0)*i/N; pts.push(new THREE.Vector2(Math.max(0.001,prof(x)), x)); }
  var geo = new THREE.LatheGeometry(pts, 96);
  var mat = new THREE.MeshStandardMaterial({ color:0x2f8f80, metalness:0.25, roughness:0.4, flatShading:false });
  var solid = new THREE.Mesh(geo, mat);

  var group = new THREE.Group();
  group.add(solid);
  // center it: lathe runs y in [x0,x1]; shift down by mid and lay horizontal
  solid.position.y = -(x0+x1)/2;
  group.rotation.z = Math.PI/2;        // lay the axis along world X
  scene.add(group);

  // the generating profile curve, drawn as a bright ribbon on the surface's top
  var curvePts=[];
  for(i=0;i<=N;i++){ var xx=x0+(x1-x0)*i/N; curvePts.push(new THREE.Vector3(xx-(x0+x1)/2, prof(xx), 0)); }
  var cg = new THREE.BufferGeometry().setFromPoints(curvePts);
  var cline = new THREE.Line(cg, new THREE.LineBasicMaterial({ color:0xf0c14a }));
  var curveGroup = new THREE.Group(); curveGroup.add(cline);
  // note: curve drawn in its own frame (x horizontal already), place it over the solid
  scene.add(curveGroup);

  // the axis of revolution
  var axisG = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-(x1-x0)/2-0.4,0,0), new THREE.Vector3((x1-x0)/2+0.4,0,0)]);
  scene.add(new THREE.Line(axisG, new THREE.LineDashedMaterial({ color:0xb23a1e, dashSize:0.16, gapSize:0.1 })).computeLineDistances());

  // grid floor for depth
  var grid = new THREE.GridHelper(12, 24, 0x33507a, 0x223247);
  grid.position.y = -1.9; scene.add(grid);

  var controls = null;
  if(THREE.OrbitControls){
    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.enablePan = false; controls.minDistance = 3.5; controls.maxDistance = 12;
    controls.autoRotate = !REDUCE; controls.autoRotateSpeed = 0.9;
  }
  // don't let canvas drags bubble to page-turn nav
  ['pointerdown','pointermove','wheel'].forEach(function(ev){
    canvas.addEventListener(ev, function(e){ e.stopPropagation(); }, {passive:true});
  });

  function fit(){
    var r = canvas.getBoundingClientRect();
    if(!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width/r.height; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  var running=false, id=null;
  function frame(){ if(controls) controls.update(); renderer.render(scene,camera); id=requestAnimationFrame(frame); }
  function start(){ if(running) return; running=true; if(REDUCE){ renderer.render(scene,camera); running=false; return; } frame(); }
  function stop(){ running=false; if(id) cancelAnimationFrame(id); id=null; }

  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ fit(); start(); } else stop(); });
  },{threshold:.12});
  io.observe(fig);

  window.addEventListener('bookbank:relayout', fit);
  window.addEventListener('resize', fit);
  fit();
}

function boot(){
  document.querySelectorAll('.three-figure[data-three="revolution"]').forEach(function(fig){
    try{ build(fig); }catch(e){ /* leave the page readable if WebGL is unavailable */ }
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
