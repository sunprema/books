/* Protobuf — book-local widget definitions, registered on the shared
   assets/vendor/book-widgets.js runtime (BookWidgets.register(name, init)). */
(function(){
"use strict";

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* The varint algorithm itself: low 7 bits of each byte are data, the 8th
   (high) bit is the continuation flag. Groups are little-endian: the
   least-significant 7 bits come first. */
function varintBytes(n){
  n = Math.max(0, Math.floor(n));
  if(n === 0) return [0];
  var bytes = [];
  while(n > 0){
    var b = n & 0x7f;
    n = Math.floor(n / 128);
    if(n > 0) b |= 0x80;
    bytes.push(b);
  }
  return bytes;
}
function hex2(b){
  var h = b.toString(16).toUpperCase();
  return h.length < 2 ? '0' + h : h;
}
function bin7(b){
  var s = (b & 0x7f).toString(2);
  while(s.length < 7) s = '0' + s;
  return s;
}

BookWidgets.register('varint', function(box, W){
  var cv = box.querySelector('canvas');
  if(!cv) return;
  var mono = '"SF Mono",Menlo,Consolas,monospace';
  var p = W.params(box);
  var slider = box.querySelector('input.v');
  var readout = box.querySelector('.readout');
  var value = (p.value != null) ? Math.round(p.value) : 300;
  var maxValue = (p.max != null) ? Math.round(p.max) : 2097151;
  if(slider){ slider.min = 0; slider.max = maxValue; slider.step = 1; slider.value = value; }

  function draw(){
    if(!W.fitCanvas(cv)) return;
    var ctx = cv.getContext('2d');
    var Wd = cv.__w, Hd = cv.__h;
    var C = W.theme();
    ctx.clearRect(0, 0, Wd, Hd);

    var bytes = varintBytes(value);
    var n = bytes.length;
    var gap = 14;
    var boxW = Math.min(110, (Wd - gap * (n + 1)) / n);
    var boxH = Math.min(Hd - 60, 96);
    var totalW = n * boxW + (n - 1) * gap;
    var startX = (Wd - totalW) / 2;
    var boxY = (Hd - boxH) / 2 - 6;

    for(var i = 0; i < n; i++){
      var b = bytes[i];
      var x = startX + i * (boxW + gap);
      var cont = !!(b & 0x80);

      ctx.lineWidth = 1.4;
      ctx.strokeStyle = C.grid;
      ctx.fillStyle = C.code;
      roundRect(ctx, x, boxY, boxW, boxH, 9);
      ctx.fill(); ctx.stroke();

      ctx.fillStyle = C.soft;
      ctx.font = '11px ' + mono;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('byte ' + i, x + boxW / 2, boxY - 8);

      ctx.beginPath();
      ctx.fillStyle = cont ? C.accent : C.soft;
      ctx.arc(x + 15, boxY + 16, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '9px ' + mono;
      ctx.fillStyle = C.soft;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(cont ? 'more follow' : 'last byte', x + 25, boxY + 17);

      ctx.fillStyle = C.ink;
      ctx.font = 'bold 16px ' + mono;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(bin7(b), x + boxW / 2, boxY + boxH / 2 + 8);

      ctx.font = '12px ' + mono;
      ctx.fillStyle = C.accent;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('0x' + hex2(b), x + boxW / 2, boxY + boxH - 12);
    }

    if(n > 1){
      ctx.fillStyle = C.soft;
      ctx.font = '11px ' + mono;
      ctx.textAlign = 'center';
      ctx.fillText(
        '← least-significant 7 bits            most-significant 7 bits →',
        Wd / 2, Hd - 8
      );
    }
  }

  function updateReadout(){
    if(!readout) return;
    var bytes = varintBytes(value);
    var hexes = bytes.map(hex2).join(' ');
    readout.textContent = value + '  →  ' + bytes.length + '-byte varint:  ' + hexes;
  }

  if(slider){
    slider.addEventListener('input', function(){
      value = Math.round(parseFloat(slider.value));
      draw(); updateReadout();
    });
  }
  var btns = box.querySelectorAll('.controls button[data-set]');
  for(var i = 0; i < btns.length; i++){
    btns[i].addEventListener('click', function(e){
      var v = parseInt(e.currentTarget.getAttribute('data-set'), 10);
      value = v;
      if(slider) slider.value = v;
      draw(); updateReadout();
    });
  }

  W.onRelayout(draw);
  draw();
  updateReadout();
});
})();
