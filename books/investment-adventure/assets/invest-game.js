/* ============================================================
   invest-game.js — the reusable "investment game" engine.
   A self-contained, offline-safe compound-growth simulator:
   slider/number inputs drive an animated SVG bar+line chart of
   a sample portfolio's value over time (growing OR shrinking).

   This is the ENGINE ONLY — it does not render its own title or
   the surrounding .widget card. A concept page drops a mount
   point where it wants the game and gives it per-page params:

     <div class="widget" data-anchor="why-invest-game">
       <div class="wtitle"><span class="dot"></span>Grow $1,000</div>
       <div class="js-invest-game" data-invest='{
         "modes":["lumpsum"], "initial":1000, "rate":7, "years":30
       }'></div>
     </div>

   For the recurring-contribution version (e.g. the dollar-cost-
   averaging chapter), pass modes:["contrib"] or modes:["lumpsum",
   "contrib"] to let the reader toggle between the two.

   Public API:
     InvestGame.mount(el, config) -> { update(partial), destroy() }
     InvestGame.init(root)        -> scans root (default document)
                                       for .js-invest-game[data-invest]
                                       and mounts each one once.
   Auto-runs InvestGame.init(document) on DOMContentLoaded.
   ============================================================ */
(function(){
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmtMoney(n, currency){
    var sign = n < 0 ? '-' : '';
    var v = Math.round(Math.abs(n));
    var s = String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + (currency || '$') + s;
  }
  function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }
  function fmtAxis(n, currency){
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    if(abs >= 1000){
      var k = abs / 1000;
      return sign + (currency || '$') + (Math.round(k * 10) / 10) + 'k';
    }
    return fmtMoney(n, currency);
  }
  function el(tag, attrs, parent){
    var n = document.createElement(tag);
    if(attrs) for(var k in attrs) n.setAttribute(k, attrs[k]);
    if(parent) parent.appendChild(n);
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent){
    var n = document.createElementNS(SVGNS, tag);
    if(attrs) for(var k in attrs) n.setAttribute(k, attrs[k]);
    if(parent) parent.appendChild(n);
    return n;
  }

  var DEFAULTS = {
    modes: ['lumpsum'],           // ['lumpsum'] | ['contrib'] | ['lumpsum','contrib']
    mode: null,                   // active mode; defaults to modes[0]
    currency: '$',
    initial: 1000, initialMin: 0, initialMax: 20000, initialStep: 100,
    contribution: 100, contributionMin: 0, contributionMax: 1000, contributionStep: 25,
    rate: 7, rateMin: -10, rateMax: 20, rateStep: 0.5,     // annual %, negative = a shrinking portfolio
    years: 30, yearsMin: 1, yearsMax: 40, yearsStep: 1,
    motif: 'tree'                 // 'tree' | 'piggy' | 'shield' | 'none'
  };

  // ---- the math: monthly-compounded growth, sampled once a year --------
  function computeSeries(cfg){
    var months = Math.round(cfg.years * 12);
    var i = (cfg.rate / 100) / 12;
    var bal = cfg.initial, contributed = cfg.initial;
    var monthly = cfg.mode === 'contrib' ? cfg.contribution : 0;
    var pts = [{ year: 0, value: bal, contributed: contributed }];
    for(var m = 1; m <= months; m++){
      bal = bal * (1 + i) + monthly;
      contributed += monthly;
      if(m % 12 === 0) pts.push({ year: m / 12, value: bal, contributed: contributed });
    }
    return pts;
  }

  // ---- motif icons (piggy bank / tree / shield), scale with growth -----
  function paintMotif(host, kind, growthRatio){
    host.innerHTML = '';
    if(kind === 'none') return;
    var scale = clamp(0.7 + growthRatio * 0.5, 0.7, 1.35);
    var svg = svgEl('svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' }, host);
    var g = svgEl('g', { transform: 'translate(24 40) scale(' + scale.toFixed(3) + ') translate(-24 -40)' }, svg);
    if(kind === 'tree'){
      svgEl('rect', { x: 21, y: 30, width: 6, height: 14, rx: 1.5, fill: '#9a6b3d' }, g);
      svgEl('circle', { cx: 24, cy: 20, r: 13, fill: 'currentColor' }, g);
      svgEl('circle', { cx: 15, cy: 26, r: 9, fill: 'currentColor', opacity: '.85' }, g);
      svgEl('circle', { cx: 33, cy: 26, r: 9, fill: 'currentColor', opacity: '.85' }, g);
    } else if(kind === 'piggy'){
      svgEl('ellipse', { cx: 24, cy: 26, rx: 16, ry: 12, fill: 'currentColor' }, g);
      svgEl('circle', { cx: 38, cy: 22, r: 3.4, fill: 'currentColor' }, g);
      svgEl('rect', { x: 22, y: 10, width: 5, height: 6, rx: 1.5, fill: 'currentColor' }, g);
      svgEl('circle', { cx: 30, cy: 24, r: 1.6, fill: '#3a362c' }, g);
      svgEl('rect', { x: 10, y: 34, width: 4, height: 6, rx: 1.5, fill: 'currentColor' }, g);
      svgEl('rect', { x: 32, y: 34, width: 4, height: 6, rx: 1.5, fill: 'currentColor' }, g);
    } else if(kind === 'shield'){
      svgEl('path', { d: 'M24 8 L38 13 V24 C38 33 32 39 24 42 C16 39 10 33 10 24 V13 Z', fill: 'currentColor' }, g);
      svgEl('path', { d: 'M18 24 L22.5 29 L31 19', fill: 'none', stroke: '#fffdf5', 'stroke-width': '3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    }
  }

  function Instance(host, config){
    var cfg = {};
    for(var k in DEFAULTS) cfg[k] = DEFAULTS[k];
    for(var k2 in (config || {})) cfg[k2] = config[k2];
    cfg.mode = cfg.mode || cfg.modes[0];
    var prevYears = null;

    host.classList.add('ig-widget');

    // ---- controls ----
    var modesRow = null;
    if(cfg.modes.length > 1){
      modesRow = el('div', { class: 'btnrow ig-modes' }, host);
      cfg.modes.forEach(function(m){
        var b = el('button', { type: 'button', class: 'btn', 'data-mode': m }, modesRow);
        b.textContent = m === 'contrib' ? 'Monthly Contributions' : 'Lump Sum';
        b.addEventListener('click', function(){ setMode(m); });
      });
    }

    var controls = el('div', { class: 'ig-controls' }, host);
    function slider(labelText, key, min, max, step, unit){
      var row = el('label', { class: 'ctl' }, controls);
      row.setAttribute('data-row', key);
      var span = el('span', {}, row); span.textContent = labelText;
      var range = el('input', { type: 'range', min: min, max: max, step: step, value: cfg[key] }, row);
      var num = el('input', { type: 'number', class: 'num', min: min, max: max, step: step, value: cfg[key] }, row);
      var u = el('span', { class: 'unit' }, row); u.textContent = unit || '';
      range.addEventListener('input', function(){ num.value = range.value; cfg[key] = parseFloat(range.value); redraw(true); });
      num.addEventListener('input', function(){
        var v = clamp(parseFloat(num.value || 0), min, max);
        range.value = v; cfg[key] = v; redraw(true);
      });
      return { row: row, range: range, num: num };
    }
    var initialCtl = slider('Starting amount', 'initial', cfg.initialMin, cfg.initialMax, cfg.initialStep, '');
    var contribCtl = slider('Monthly contribution', 'contribution', cfg.contributionMin, cfg.contributionMax, cfg.contributionStep, '/mo');
    var rateCtl = slider('Annual return', 'rate', cfg.rateMin, cfg.rateMax, cfg.rateStep, '%');
    var yearsCtl = slider('Years invested', 'years', cfg.yearsMin, cfg.yearsMax, cfg.yearsStep, 'yr');

    function setMode(m){
      cfg.mode = m;
      if(modesRow) Array.prototype.forEach.call(modesRow.children, function(b){
        b.classList.toggle('active', b.getAttribute('data-mode') === m);
      });
      contribCtl.row.style.display = (m === 'contrib') ? '' : 'none';
      redraw(true);
    }

    // ---- chart ----
    var chartWrap = el('div', { class: 'ig-chart-wrap' }, host);
    var W = 640, H = 360;
    var margin = { top: 14, right: 14, bottom: 26, left: 54 };
    var svg = svgEl('svg', { class: 'ig-chart', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none', role: 'img' }, chartWrap);
    var titleEl = svgEl('title', {}, svg);
    var gridG = svgEl('g', { class: 'ig-grid' }, svg);
    var axisG = svgEl('g', { class: 'ig-axis' }, svg);
    var barsG = svgEl('g', { class: 'ig-bars' }, svg);
    var line = svgEl('path', { class: 'ig-line' }, svg);
    var dotsG = svgEl('g', { class: 'ig-dots' }, svg);
    var motifHost = el('div', { class: 'ig-motif motif -' + cfg.motif }, chartWrap);

    var legend = el('div', { class: 'ig-legend' }, host);
    legend.innerHTML =
      '<span><span class="sw -base"></span>What you put in</span>' +
      '<span><span class="sw -growth"></span>What it grew</span>' +
      '<span class="ig-loss-legend" style="display:none"><span class="sw -loss"></span>Below what you put in</span>';

    var readout = el('div', { class: 'ig-readout readout' }, host);

    // Deferred until after the chart elements above exist — redraw() (called
    // via setMode) reads gridG/axisG/barsG/motifHost/etc.
    setMode(cfg.mode);

    function baseline(){ return H - margin.bottom; }
    function chartW(){ return W - margin.left - margin.right; }
    function chartH(){ return H - margin.top - margin.bottom; }

    function redraw(animate){
      var pts = computeSeries(cfg);
      var last = pts[pts.length - 1];
      var maxVal = 0;
      pts.forEach(function(p){ maxVal = Math.max(maxVal, p.value, p.contributed); });
      maxVal = maxVal * 1.12 || 1;
      var n = pts.length - 1;
      var structural = (prevYears !== null && prevYears !== cfg.years);
      var doAnim = animate && !reduceMotion && !structural;

      function x(idx){ return margin.left + (n === 0 ? 0 : idx * (chartW() / n)); }
      function y(v){ return baseline() - (v / maxVal) * chartH(); }

      // gridlines + y labels (4 bands)
      gridG.innerHTML = ''; axisG.innerHTML = '';
      var bands = 4;
      for(var b = 0; b <= bands; b++){
        var v = (maxVal / bands) * b;
        var gy = y(v);
        svgEl('line', { x1: margin.left, x2: W - margin.right, y1: gy, y2: gy }, gridG);
        var t = svgEl('text', { x: margin.left - 6, y: gy + 3, 'text-anchor': 'end' }, axisG);
        t.textContent = fmtAxis(v, cfg.currency);
      }
      // x labels (year ticks)
      var xStep = Math.max(1, Math.ceil(n / 6));
      pts.forEach(function(p, idx){
        if(idx % xStep !== 0 && idx !== n) return;
        var t = svgEl('text', { x: x(idx), y: H - 8, 'text-anchor': 'middle' }, axisG);
        t.textContent = 'Yr ' + p.year;
      });

      // bars
      var barW = Math.max(2, (chartW() / (n + 1)) * 0.55);
      var existing = barsG.children.length === (pts.length * 2);
      if(!existing){ barsG.innerHTML = ''; }
      var hasLoss = false;
      pts.forEach(function(p, idx){
        var cx = x(idx) - barW / 2;
        var baseVal = Math.min(p.value, p.contributed);
        var growth = p.value - p.contributed;
        var by0 = existing ? barsG.children[idx * 2] : svgEl('rect', { class: 'ig-bar-base' }, barsG);
        var by1 = existing ? barsG.children[idx * 2 + 1] : svgEl('rect', { class: growth >= 0 ? 'ig-bar-growth' : 'ig-bar-loss' }, barsG);
        by1.setAttribute('class', growth >= 0 ? 'ig-bar-growth' : 'ig-bar-loss');
        var setBars = function(){
          by0.setAttribute('x', cx); by0.setAttribute('width', barW);
          by0.setAttribute('y', y(baseVal)); by0.setAttribute('height', Math.max(0, baseline() - y(baseVal)));
          var topVal = Math.max(p.value, p.contributed);
          by1.setAttribute('x', cx); by1.setAttribute('width', barW);
          by1.setAttribute('y', y(topVal)); by1.setAttribute('height', Math.max(0, y(baseVal) - y(topVal)));
        };
        if(growth < 0) hasLoss = true;
        if(!existing && doAnim){
          by0.setAttribute('x', cx); by0.setAttribute('width', barW);
          by0.setAttribute('y', baseline()); by0.setAttribute('height', 0);
          by1.setAttribute('x', cx); by1.setAttribute('width', barW);
          by1.setAttribute('y', baseline()); by1.setAttribute('height', 0);
          requestAnimationFrame(function(){ requestAnimationFrame(setBars); });
        } else {
          setBars();
        }
      });
      var legendLoss = host.querySelector('.ig-loss-legend');
      if(legendLoss) legendLoss.style.display = hasLoss ? '' : 'none';

      // total-value line + dots (structural changes redraw without a d-transition)
      var d = pts.map(function(p, idx){ return (idx === 0 ? 'M' : 'L') + x(idx).toFixed(1) + ' ' + y(p.value).toFixed(1); }).join(' ');
      if(structural) line.style.transition = 'none'; else line.style.transition = '';
      line.setAttribute('d', d);
      if(structural) requestAnimationFrame(function(){ line.style.transition = ''; });

      dotsG.innerHTML = '';
      pts.forEach(function(p, idx){
        if(idx % xStep !== 0 && idx !== n) return;
        svgEl('circle', { class: 'ig-dot', cx: x(idx), cy: y(p.value), r: 3 }, dotsG);
      });

      titleEl.textContent = 'Portfolio value over ' + cfg.years + ' years, from ' + fmtMoney(pts[0].value, cfg.currency) +
        ' to ' + fmtMoney(last.value, cfg.currency) + '.';

      var growth = last.value - last.contributed;
      var growthRatio = last.contributed > 0 ? Math.max(0, growth / last.contributed) : 0;
      paintMotif(motifHost, cfg.motif, growthRatio);

      readout.innerHTML =
        '<span class="stat">You put in <b>' + fmtMoney(last.contributed, cfg.currency) + '</b></span>' +
        '<span class="stat' + (growth < 0 ? ' -loss' : '') + '">' + (growth < 0 ? 'Down' : 'It grew by') + ' <b>' + fmtMoney(Math.abs(growth), cfg.currency) + '</b></span>' +
        '<span class="stat">Final value <b>' + fmtMoney(last.value, cfg.currency) + '</b> after ' + cfg.years + ' years</span>';

      prevYears = cfg.years;
    }

    // First draw is deferred to reveal (below) so the bars can grow in from
    // zero the moment the widget actually becomes visible on a spread —
    // building them at full height up front would leave nothing to animate.
    var revealed = false;
    var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting && !revealed){ revealed = true; redraw(true); io.disconnect(); }
      });
    }, { threshold: 0.15 }) : null;
    if(io) io.observe(host); else { revealed = true; redraw(false); }

    return {
      update: function(partial){
        for(var k3 in (partial || {})) cfg[k3] = partial[k3];
        initialCtl.range.value = cfg.initial; initialCtl.num.value = cfg.initial;
        contribCtl.range.value = cfg.contribution; contribCtl.num.value = cfg.contribution;
        rateCtl.range.value = cfg.rate; rateCtl.num.value = cfg.rate;
        yearsCtl.range.value = cfg.years; yearsCtl.num.value = cfg.years;
        redraw(true);
      },
      destroy: function(){ if(io) io.disconnect(); host.innerHTML = ''; host.classList.remove('ig-widget'); }
    };
  }

  var InvestGame = {
    mount: function(hostEl, config){ return new Instance(hostEl, config || {}); },
    init: function(root){
      (root || document).querySelectorAll('.js-invest-game[data-invest]').forEach(function(elm){
        if(elm.__investGame) return;
        var cfg = {};
        try { cfg = JSON.parse(elm.getAttribute('data-invest')); } catch(e){ cfg = {}; }
        elm.__investGame = InvestGame.mount(elm, cfg);
      });
    }
  };
  window.InvestGame = InvestGame;

  document.addEventListener('DOMContentLoaded', function(){ InvestGame.init(document); });
  window.addEventListener('bookbank:relayout', function(){ /* SVG scales via viewBox; nothing to resize. */ });
})();
