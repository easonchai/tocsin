/* Tocsin ring field. A dot grid that is always faintly moving; a strike sends a ripple out through the dots themselves
   (brightness, size, a soft glow, no drawn line) that decelerates and fades, leaving a residue that fades over ~10s.
   Rules: design/DIRECTION.md. Deterministic from a seed, state recolours the ripple only, text always wins (a soft
   mask dims the field under copy), the cursor carries a soft lens after Railgun, watchdog drops to the still field
   above 70ms median frame, reduced motion shows the still field, hidden tabs pause.
   Usage: var rf = Tocsin.ringfield(canvas, {seed: 7, state: 'idle', mask: 'h1,h2,p'}); rf.setState('blocked'); rf.strike(x, y); */
(function () {
  // tint: which colour the ripple lights the dots in. 0 paper, 1 amber, 2 red. echoes: trailing crests after the first
  var STATES = {
    idle:         { dot: [38, 42, 48],  tint: 0, reach: 1,  echoes: 2 },
    syncing:      { dot: [52, 56, 62],  tint: 1, reach: 1,  echoes: 2 },
    verified:     { dot: [52, 56, 62],  tint: 1, reach: 1,  echoes: 2 },
    unverifiable: { dot: [38, 42, 48],  tint: 2, reach: .5, echoes: 2 },
    blocked:      { dot: [38, 42, 48],  tint: 2, reach: .7, echoes: 0 }
  };
  var TINTS = [[201, 195, 182], [233, 162, 59], [229, 72, 77]], LIT = TINTS[0], FLOW = [58, 63, 71], SETTLED = [143, 139, 130], PAGE = 'rgba(18,20,23,';
  var GRID = 24, REACH = 460, LIFE = 4.2, WAVE = 58, ECHO = 64, LENS = 170;
  var MASK = 'h1,h2,h3,p,li,dt,dd,pre,th,td,blockquote,.label,.eyebrow,.lede,.files,.sw,.states,.cell';

  function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function smooth(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 2.6); }
  function glow() { var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d'); var r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(236,231,220,.5)'); r.addColorStop(.45, 'rgba(236,231,220,.14)'); r.addColorStop(1, 'rgba(236,231,220,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return c; }

  function ringfield(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d'), rnd = mulberry(opts.seed || 7), halo = glow();
    var state = STATES[opts.state] || STATES.idle;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = matchMedia('(pointer: fine)').matches;
    var dpr = Math.min(devicePixelRatio || 1, 2), W = 0, H = 0, cols = 0, rows = 0;
    var memory, tint, strikes = [], raf = 0, last = 0, t0 = 0, nextAmbient = 0, frames = [], live = !reduced, hidden = false, skip = false;
    var lens = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 }, rects = [], maskSel = opts.mask === false ? '' : (opts.mask || MASK);
    var maskC = document.createElement('canvas'), maskX = maskC.getContext('2d'), col1 = [], col2 = [], row1 = [], row2 = [];

    function size() {
      var r = canvas.getBoundingClientRect(); W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / GRID) + 1; rows = Math.ceil(H / GRID) + 1;
      memory = new Float32Array(cols * rows); tint = new Uint8Array(cols * rows);
      maskC.width = W * dpr; maskC.height = H * dpr; maskX.setTransform(dpr, 0, 0, dpr, 0, 0);
      collect(); draw(last);
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
      // the mask is rendered once per layout change, not per frame
      maskX.clearRect(0, 0, W, H); maskX.save(); maskX.filter = 'blur(14px)'; maskX.fillStyle = PAGE + '.9)';
      rects.forEach(function (r) { maskX.fillRect(r[0], r[1], r[2], r[3]); }); maskX.restore();
    }

    function strike(x, y, t) { strikes.push({ x: x, y: y, t0: t == null ? last : t, s: state }); if (strikes.length > 5) strikes.shift(); wake(); }
    function wake() { if (!raf && !hidden) raf = requestAnimationFrame(frame); }

    function frame(now) {
      raf = 0; var t = now / 1000, dt = last ? Math.min(t - last, .1) : 0; last = t; if (!t0) t0 = t;
      frames.push(dt); if (frames.length > 30) frames.shift();
      if (live && frames.length === 30) { var s = frames.slice().sort(); if (s[15] > .07) live = false; }
      if (live && t >= nextAmbient) { if (nextAmbient) strike(rnd() * W, rnd() * H, t); nextAmbient = t + 8 + rnd() * 4; }
      strikes = strikes.filter(function (s) { return t - s.t0 < LIFE + .6; });
      // residue fades; the lens eases after the pointer
      var decay = Math.exp(-dt / 10), busy = strikes.length > 0;
      for (var k = 0; k < memory.length; k++) { if (memory[k] > .01) { memory[k] *= decay; busy = true; } else memory[k] = 0; }
      var dx = lens.tx - lens.x, dy = lens.ty - lens.y;
      if (Math.abs(dx) + Math.abs(dy) > .5) { lens.x += dx * Math.min(1, dt * 9); lens.y += dy * Math.min(1, dt * 9); busy = true; }
      // the ambient flow runs at half rate; ripples and the lens at full
      skip = !busy && !skip;
      if (!skip) draw(t);
      if (busy || live) raf = requestAnimationFrame(frame);
    }

    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      var lensOn = fine && lens.x > -1e3, tt = t - t0, flowing = live && !reduced;
      var ss = strikes.map(function (s) {
        var age = (t - s.t0) / LIFE, r = REACH * s.s.reach * easeOut(age);
        return { x: s.x, y: s.y, r: r, amp: Math.pow(1 - age, 1.4), tint: s.s.tint, echoes: s.s.echoes };
      });
      // slow flow: two travelling waves, never more than a step between ink-700 and ink-600; separable so each dot costs two multiplies
      for (var i = 0; i < cols; i++) { var px = i * GRID; col1[i] = [Math.sin(px * .009 + tt * .45), Math.cos(px * .009 + tt * .45)]; col2[i] = [Math.sin(px * .005 - tt * .31), Math.cos(px * .005 - tt * .31)]; }
      for (var j = 0; j < rows; j++) { var py = j * GRID; row1[j] = [Math.sin(py * .006), Math.cos(py * .006)]; row2[j] = [Math.sin(py * .011), Math.cos(py * .011)]; }
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var k = j * cols + i, x = i * GRID, y = j * GRID, m = memory[k], l = 0, rip = 0, rt = tint[k];
        var f = flowing ? .5 + .25 * ((col1[i][0] * row1[j][1] + col1[i][1] * row1[j][0]) + (col2[i][0] * row2[j][1] - col2[i][1] * row2[j][0])) : .5;
        // ripple: a crest at the front with echoes behind it, a shallow trough between
        for (var n = 0; n < ss.length; n++) {
          var s = ss[n], d = Math.hypot(x - s.x, y - s.y);
          for (var e = 0; e <= s.echoes; e++) {
            var u = (d - (s.r - e * ECHO)) / WAVE; if (u < -1.6 || u > 1.6) continue;
            var v = Math.cos(u * 2.4) * Math.exp(-u * u * .9) * s.amp * (1 - e * .3);
            if (Math.abs(v) > Math.abs(rip)) { rip = v; rt = s.tint; }
          }
        }
        if (rip > .12 && rip * .6 > memory[k]) { memory[k] = rip * .6; tint[k] = rt; }
        if (lensOn) { var dl = Math.hypot(x - lens.x, y - lens.y); if (dl < LENS) l = smooth(1 - dl / LENS); }
        var c = mix(state.dot, FLOW, f); c = mix(c, SETTLED, m * .9);
        if (rip > 0) c = mix(c, TINTS[rt], rip); else if (rip < 0) c = mix(c, state.dot, -rip * .8);
        if (l > 0) c = mix(c, LIT, l * .85);
        var lit = Math.max(rip, l * .8, m * .25);
        if (lit > .06) { var gs = 8 + lit * 14; ctx.globalAlpha = Math.min(1, lit); ctx.drawImage(halo, x - gs / 2, y - gs / 2, gs, gs); ctx.globalAlpha = 1; }
        var sz = 1.2 + f * .5 + m * .5 + Math.max(0, rip) * 2.4 + l * 1.2;
        ctx.fillStyle = rgb(c); ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
      // the copy mask, pre-rendered in collect()
      if (rects.length) ctx.drawImage(maskC, 0, 0, W, H);
    }

    var scrollRaf = 0;
    function remask() { if (scrollRaf) return; scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; collect(); if (!raf) draw(last); }); }
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
