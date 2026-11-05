/* Tocsin ring field. A still dot grid; a strike sends three rings out and the dots it passes stay faintly brighter.
   Rules: docs/brand/DIRECTION.md. Deterministic from a seed, still until touched, state recolours the rings only,
   watchdog disables ambient strikes above 70ms median frame, reduced motion shows the settled field, hidden tabs pause.
   Usage: var rf = Tocsin.ringfield(canvas, {seed: 7, state: 'idle'}); rf.setState('blocked'); rf.strike(x, y); */
(function () {
  var STATES = {
    idle:         { dot: [38, 42, 48],    ring: null,              alpha: 0,   reach: 1,   spread: true },
    syncing:      { dot: [143, 139, 130], ring: [233, 162, 59],    alpha: .3,  reach: 1,   spread: true },
    verified:     { dot: [143, 139, 130], ring: [233, 162, 59],    alpha: .9,  reach: 1,   spread: true },
    unverifiable: { dot: [38, 42, 48],    ring: [229, 72, 77],     alpha: .4,  reach: .5,  spread: true },
    blocked:      { dot: [38, 42, 48],    ring: [229, 72, 77],     alpha: 1,   reach: .7,  spread: false }
  };
  var LIT = [236, 231, 220], SETTLED = [143, 139, 130];
  var GRID = 24, SPEED = 150, RING_GAP = .32, LIFE = 3.2, REACH = 440;

  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? 1 : a) + ')'; }

  function ringfield(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), rnd = mulberry(opts.seed || 7);
    var state = STATES[opts.state] || STATES.idle;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var dpr = Math.min(devicePixelRatio || 1, 2), W = 0, H = 0, cols = 0, rows = 0;
    var heat, memory, strikes = [], raf = 0, last = 0, nextAmbient = 0, frames = [], ambient = !reduced, hidden = false, dirty = true;

    function size() {
      var r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / GRID) + 1; rows = Math.ceil(H / GRID) + 1;
      heat = new Float32Array(cols * rows); memory = new Float32Array(cols * rows);
      if (reduced) seedMemory(); dirty = true; draw(0);
    }
    // reduced motion: the field after a few strikes, no rings
    function seedMemory() { var r = mulberry((opts.seed || 7) + 1); for (var k = 0; k < 4; k++) bake(r() * W, r() * H, r() * 200 + 140); }
    function bake(x, y, R) { for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) { var d = Math.hypot(i * GRID - x, j * GRID - y); if (d < R) memory[j * cols + i] = Math.max(memory[j * cols + i], .28 * (1 - d / R) + .08); } }

    function strike(x, y, t) {
      strikes.push({ x: x, y: y, t0: t == null ? last : t, s: state });
      if (strikes.length > 6) strikes.shift();
      wake();
    }
    function wake() { dirty = true; if (!raf && !hidden) raf = requestAnimationFrame(frame); }

    function frame(now) {
      raf = 0; var t = now / 1000, dt = last ? Math.min(t - last, .1) : 0; last = t;
      frames.push(dt); if (frames.length > 30) frames.shift();
      if (ambient && frames.length === 30) { var s = frames.slice().sort(); if (s[15] > .07) ambient = false; }
      if (ambient && t >= nextAmbient) { if (nextAmbient) strike(rnd() * W, rnd() * H, t); nextAmbient = t + 8 + rnd() * 4; }
      var alive = step(t, dt);
      draw(t);
      if (alive || (ambient && !reduced)) raf = requestAnimationFrame(frame);
      else dirty = false;
    }

    function step(t, dt) {
      var alive = false, decay = Math.exp(-dt * .18); // ~20s residue so the struck region is seen
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
            if (d < GRID * .7) { var k = j * cols + i, h = (1 - d / (GRID * .7)) * (1 - age / LIFE); if (h > heat[k]) heat[k] = h; if (n === 0) memory[k] = Math.max(memory[k], .5 * (1 - r / reach) + .12); }
          }
        }
      });
      return alive;
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var k = j * cols + i, m = memory[k], h = heat[k];
        var c = mix(state.dot, SETTLED, m); if (h > 0) c = mix(c, LIT, h);
        ctx.fillStyle = rgb(c); ctx.fillRect(i * GRID - .75, j * GRID - .75, 1.5, 1.5);
      }
      if (reduced) return;
      ctx.lineWidth = 1;
      strikes.forEach(function (s) {
        if (!s.s.ring) return;
        var reach = REACH * s.s.reach;
        for (var n = 0; n < 3; n++) {
          if (!s.s.spread && n > 0) break;
          var age = t - s.t0 - n * RING_GAP; if (age < 0 || age > LIFE) continue;
          var r = age * SPEED; if (r > reach) continue;
          ctx.strokeStyle = rgb(s.s.ring, s.s.alpha * (1 - age / LIFE) * (1 - n * .25));
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
        }
      });
    }

    function onDown(e) { if (e.button) return; var r = canvas.getBoundingClientRect(); strike(e.clientX - r.left, e.clientY - r.top, performance.now() / 1000); }
    function onVis() { hidden = document.hidden; if (hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else wake(); }
    var ro = new ResizeObserver(size); ro.observe(canvas);
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    size(); nextAmbient = 0; wake();

    return {
      strike: function (x, y) { strike(x, y, performance.now() / 1000); },
      setState: function (name) { state = STATES[name] || STATES.idle; wake(); },
      destroy: function () { ro.disconnect(); window.removeEventListener('pointerdown', onDown); document.removeEventListener('visibilitychange', onVis); cancelAnimationFrame(raf); }
    };
  }
  window.Tocsin = window.Tocsin || {}; window.Tocsin.ringfield = ringfield;
})();
