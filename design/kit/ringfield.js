/* Tocsin ring field. A still dot grid; a strike sends three rings out and the dots it passes stay faintly brighter.
   Rules: design/DIRECTION.md. Deterministic from a seed, state recolours the rings only, text always wins (a soft
   mask dims the field under copy), the cursor carries a soft lens after Railgun, watchdog disables ambient strikes
   above 70ms median frame, reduced motion shows the settled field, hidden tabs pause.
   Usage: var rf = Tocsin.ringfield(canvas, {seed: 7, state: 'idle', mask: 'h1,h2,p'}); rf.setState('blocked'); rf.strike(x, y); */
(function () {
  var STATES = {
    idle:         { dot: [38, 42, 48],    ring: null,              alpha: 0,   reach: 1,   spread: true },
    syncing:      { dot: [60, 64, 70],    ring: [233, 162, 59],    alpha: .3,  reach: 1,   spread: true },
    verified:     { dot: [60, 64, 70],    ring: [233, 162, 59],    alpha: .9,  reach: 1,   spread: true },
    unverifiable: { dot: [38, 42, 48],    ring: [229, 72, 77],     alpha: .4,  reach: .5,  spread: true },
    blocked:      { dot: [38, 42, 48],    ring: [229, 72, 77],     alpha: 1,   reach: .7,  spread: false }
  };
  var LIT = [201, 195, 182], SETTLED = [143, 139, 130], PAGE = 'rgba(18,20,23,';
  var GRID = 24, SPEED = 150, RING_GAP = .32, LIFE = 3.2, REACH = 440, LENS = 170;
  var MASK = 'h1,h2,h3,p,li,dt,dd,pre,th,td,blockquote,.label,.eyebrow,.lede,.files,.sw,.states,.cell';

  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }
  function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
  // a soft glow sprite, drawn behind lit dots so they bloom instead of sitting as hard squares
  function glow() { var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'); var r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(236,231,220,.55)'); r.addColorStop(.4, 'rgba(236,231,220,.18)'); r.addColorStop(1, 'rgba(236,231,220,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return c; }

  function ringfield(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), rnd = mulberry(opts.seed || 7), halo = glow();
    var state = STATES[opts.state] || STATES.idle;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = matchMedia('(pointer: fine)').matches;
    var dpr = Math.min(devicePixelRatio || 1, 2), W = 0, H = 0, cols = 0, rows = 0;
    var heat, memory, strikes = [], raf = 0, last = 0, nextAmbient = 0, frames = [], ambient = !reduced, hidden = false;
    var lens = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 }, rects = [], maskSel = opts.mask === false ? '' : (opts.mask || MASK);

    function size() {
      var r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / GRID) + 1; rows = Math.ceil(H / GRID) + 1;
      heat = new Float32Array(cols * rows); memory = new Float32Array(cols * rows);
      if (reduced) seedMemory();
      collect(); draw(0);
    }
    // where the copy is, in canvas space; the field is dimmed there so text always wins
    function collect() {
      rects = [];
      if (!maskSel) return;
      var c = canvas.getBoundingClientRect(), vh = innerHeight;
      document.querySelectorAll(maskSel).forEach(function (el) {
        var r = el.getBoundingClientRect(); if (!r.width || r.bottom < -40 || r.top > vh + 40) return;
        rects.push([r.left - c.left - 10, r.top - c.top - 6, r.width + 20, r.height + 12]);
      });
    }
    function seedMemory() { var r = mulberry((opts.seed || 7) + 1); for (var k = 0; k < 4; k++) bake(r() * W, r() * H, r() * 200 + 140); }
    function bake(x, y, R) { for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) { var d = Math.hypot(i * GRID - x, j * GRID - y); if (d < R) memory[j * cols + i] = Math.max(memory[j * cols + i], .5 * (1 - d / R) + .1); } }

    function strike(x, y, t) { strikes.push({ x: x, y: y, t0: t == null ? last : t, s: state }); if (strikes.length > 6) strikes.shift(); wake(); }
    function wake() { if (!raf && !hidden) raf = requestAnimationFrame(frame); }

    function frame(now) {
      raf = 0; var t = now / 1000, dt = last ? Math.min(t - last, .1) : 0; last = t;
      frames.push(dt); if (frames.length > 30) frames.shift();
      if (ambient && frames.length === 30) { var s = frames.slice().sort(); if (s[15] > .07) ambient = false; }
      if (ambient && t >= nextAmbient) { if (nextAmbient) strike(rnd() * W, rnd() * H, t); nextAmbient = t + 8 + rnd() * 4; }
      var alive = step(t, dt);
      // the lens eases after the pointer
      var dx = lens.tx - lens.x, dy = lens.ty - lens.y;
      if (Math.abs(dx) + Math.abs(dy) > .5) { lens.x += dx * Math.min(1, dt * 9); lens.y += dy * Math.min(1, dt * 9); alive = true; }
      draw(t);
      if (alive || (ambient && !reduced)) raf = requestAnimationFrame(frame);
    }

    function step(t, dt) {
      var alive = false, decay = Math.exp(-dt * .07); // ~20s residue
      for (var k = 0; k < heat.length; k++) { if (heat[k] > .01) { heat[k] *= decay; alive = true; } else heat[k] = 0; }
      strikes = strikes.filter(function (s) { return t - s.t0 < LIFE + RING_GAP * 2; });
      strikes.forEach(function (s) {
        var reach = REACH * s.s.reach;
        for (var n = 0; n < 3; n++) {
          var age = t - s.t0 - n * RING_GAP; if (age < 0 || age > LIFE) continue;
          var r = age * SPEED; if (r > reach) continue;
          alive = true;
          if (!s.s.spread && n > 0) continue;
          var i0 = Math.max(0, ((s.x - r - GRID) / GRID) | 0), i1 = Math.min(cols - 1, ((s.x + r + GRID) / GRID) | 0);
          var j0 = Math.max(0, ((s.y - r - GRID) / GRID) | 0), j1 = Math.min(rows - 1, ((s.y + r + GRID) / GRID) | 0);
          for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
            var d = Math.abs(Math.hypot(i * GRID - s.x, j * GRID - s.y) - r);
            if (d < GRID * .7) { var k = j * cols + i, h = (1 - d / (GRID * .7)) * (1 - age / LIFE); if (h > heat[k]) heat[k] = h; if (n === 0) memory[k] = Math.min(1, Math.max(memory[k], .9 * (1 - r / reach) + .15)); }
          }
        }
      });
      return alive;
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var lensOn = fine && lens.x > -1e3;
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var k = j * cols + i, x = i * GRID, y = j * GRID, m = memory[k], h = heat[k], l = 0;
        if (lensOn) { var dl = Math.hypot(x - lens.x, y - lens.y); if (dl < LENS) l = smooth(1 - dl / LENS); }
        var c = mix(state.dot, SETTLED, m); if (h > 0) c = mix(c, LIT, h); if (l > 0) c = mix(c, LIT, l * .85);
        var glowA = Math.max(h * .7, l * .8, m * .12);
        if (glowA > .05) { var gs = 8 + glowA * 12; ctx.globalAlpha = glowA; ctx.drawImage(halo, x - gs / 2, y - gs / 2, gs, gs); ctx.globalAlpha = 1; }
        var sz = 1.4 + m * .6 + h * .6 + l * 1.2;
        ctx.fillStyle = rgb(c); ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      if (!reduced) {
        ctx.lineWidth = 1;
        strikes.forEach(function (s) {
          if (!s.s.ring) return;
          var reach = REACH * s.s.reach;
          for (var n = 0; n < 3; n++) {
            if (!s.s.spread && n > 0) break;
            var age = t - s.t0 - n * RING_GAP; if (age < 0 || age > LIFE) continue;
            var r = age * SPEED; if (r > reach) continue;
            var hold = age < LIFE * .55 ? 1 : 1 - (age - LIFE * .55) / (LIFE * .45);
            ctx.strokeStyle = rgb(s.s.ring, s.s.alpha * hold * (1 - n * .25));
            ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
          }
        });
      }
      // the copy mask: page colour, blurred edges, over everything the field drew
      if (rects.length) {
        ctx.save(); ctx.filter = 'blur(14px)'; ctx.fillStyle = PAGE + '.82)';
        rects.forEach(function (r) { ctx.fillRect(r[0], r[1], r[2], r[3]); });
        ctx.restore();
      }
    }

    var scrollRaf = 0;
    function remask() { if (scrollRaf) return; scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; collect(); draw(last); }); }
    function onMove(e) { var r = canvas.getBoundingClientRect(); lens.tx = e.clientX - r.left; lens.ty = e.clientY - r.top; if (lens.x < -1e3) { lens.x = lens.tx; lens.y = lens.ty; } wake(); }
    function onLeave() { lens.tx = -1e4; lens.ty = -1e4; wake(); }
    function onDown(e) { if (e.button) return; var r = canvas.getBoundingClientRect(); strike(e.clientX - r.left, e.clientY - r.top, performance.now() / 1000); }
    function onVis() { hidden = document.hidden; if (hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); }
    var ro = new ResizeObserver(size); ro.observe(canvas);
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', remask, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    size(); nextAmbient = 0; wake();
    // copy that arrives after load (reveals, the trace, injected scenes) moves the mask
    var mo = new MutationObserver(remask); mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open'] });

    return {
      strike: function (x, y) { strike(x, y, performance.now() / 1000); },
      setState: function (name) { state = STATES[name] || STATES.idle; wake(); },
      remask: remask,
      destroy: function () { ro.disconnect(); mo.disconnect(); window.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave); window.removeEventListener('scroll', remask); document.removeEventListener('visibilitychange', onVis); cancelAnimationFrame(raf); }
    };
  }
  window.Tocsin = window.Tocsin || {}; window.Tocsin.ringfield = ringfield;
})();
