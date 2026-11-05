/* Tocsin how-it-works scenes. Three looping schematics in the Devcon schematic language:
   1.5px ink-600 connectors, mono pills on ink-800, one solid paper-100 hero node, entrances staggered 0.4s.
   Each scene is under 10s and loops. They double as loading illustrations.
   Usage: Tocsin.scene(el, 'append' | 'prove' | 'lie'). Needs scenes.css. */
(function () {
  var W = 720, H = 290, MONO = 'JetBrains Mono, monospace', LOOP = 9500;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function at(d) { return reduced ? '' : ' style="animation-delay:' + d + 's"'; }
  // x is the left edge; w fixed per scene so wires line up
  function pill(x, y, w, text, d, cls) {
    return '<g class="in ' + (cls || '') + '"' + at(d) + '><rect x="' + x + '" y="' + (y - 12) + '" width="' + w + '" height="24" rx="3" fill="#1a1d22" stroke="#3a3f47"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 4) + '" text-anchor="middle" font-family="' + MONO + '" font-size="12" fill="#c9c3b6">' + text + '</text></g>';
  }
  function hero(x, y, w, h, title, lines, d) {
    var t = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#ece7dc"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 26) + '" text-anchor="middle" font-family="Bricolage Grotesque, sans-serif" font-weight="700" font-size="15" fill="#121417">' + title + '</text>';
    var late = '';
    lines.forEach(function (l, i) {
      var txt = Array.isArray(l) ? l[0] : l, ly = y + 50 + i * 18;
      var el = '<text x="' + (x + w / 2) + '" y="' + ly + '" text-anchor="middle" font-family="' + MONO + '" font-size="11" fill="#3a3f47"' + (Array.isArray(l) ? ' class="in"' + at(l[1]) : '') + '>' + txt + '</text>';
      if (Array.isArray(l)) late += el; else t += el;
    });
    return '<g class="in"' + at(d) + '>' + t + '</g>' + late;
  }
  function wire(dd, d, cls) { return '<path class="draw ' + (cls || '') + '" d="' + dd + '"' + at(d) + '/>'; }
  function leaf(x, y, d, amber) { return '<rect class="in" x="' + (x - 4) + '" y="' + (y - 4) + '" width="8" height="8" fill="' + (amber ? '#e9a23b' : '#c9c3b6') + '"' + at(d) + '/>'; }
  function label(x, y, text, d, fill, anchor) { return '<text class="in" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-family="' + MONO + '" font-size="11" fill="' + (fill || '#8f8b82') + '"' + at(d) + '>' + text + '</text>'; }

  var scenes = {
    // writers append to their own chains; the log folds each leaf into a head
    append: function () {
      var s = '', writers = [['seal', 70], ['scamsniffer', 150], ['detector-7', 230]];
      s += hero(540, 50, 140, 200, 'log · L1', ['one slot', 'per writer', '', ['seal  0x9c4e…', 4.6], ['scams 0x17b0…', 5.4], ['det-7 0x3fe2…', 6.2]], 0);
      writers.forEach(function (w, i) {
        var y = w[1], d0 = .4 + i * .4;
        s += pill(40, y, 120, w[0], d0);
        s += wire('M170 ' + y + 'H520', d0 + .3);
        for (var k = 0; k < 6; k++) s += leaf(210 + k * 56, y, d0 + 1.2 + k * .55 + i * .15, k === 5);
      });
      s += label(350, 282, 'leaves · hashed with writer, block, sequence · never deleted', 5.5);
      return s;
    },
    // the wallet proves the heads it trusts, then replays leaves from any mirror until the chain lands on the proven head
    prove: function () {
      var s = '';
      s += pill(30, 90, 210, 'helios · finalized header', 0);
      s += pill(30, 210, 210, 'mirror · any source', .8);
      s += hero(540, 60, 140, 180, 'wallet', ['light client', '', ['proven head', 1.6], ['0x9c4e…', 1.6], ['replayed 0x9c4e…', 5.8]], .4);
      s += wire('M250 90H520', 1.2, 'amber');
      s += label(385, 78, 'eth_getProof · verified against stateRoot', 1.6, '#e9a23b');
      s += wire('M250 210H520', 2.0);
      for (var k = 0; k < 6; k++) s += leaf(280 + k * 44, 210, 2.4 + k * .45);
      s += label(385, 240, 'replayed head 0x9c4e…  =  0x9c4e…', 5.8, '#c9c3b6');
      s += '<g class="in"' + at(6.6) + '><rect x="470" y="252" width="210" height="26" rx="3" fill="none" stroke="#ece7dc"/><text x="575" y="269" text-anchor="middle" font-family="' + MONO + '" font-size="12" fill="#ece7dc">head matches · verified</text></g>';
      return s;
    },
    // the RPC omits a flag; the replayed chain misses the proven head; the wallet says unverifiable, never clean
    lie: function () {
      var s = '';
      s += pill(30, 90, 210, 'helios · finalized header', 0);
      s += pill(30, 210, 210, 'rpc · says "clean"', .8, 'bad');
      s += hero(540, 60, 140, 180, 'wallet', ['light client', '', 'proven head', '0x9c4e…', ''], .4);
      s += wire('M250 90H520', 1.2, 'amber');
      s += label(385, 78, 'eth_getProof · verified against stateRoot', 1.6, '#e9a23b');
      s += wire('M250 210H520', 2.0);
      for (var k = 0; k < 6; k++) if (k !== 4) s += leaf(280 + k * 44, 210, 2.4 + k * .45, false);
      s += wire('M250 210H520', 4.2, 'bad');
      s += '<rect class="in" x="452" y="206" width="8" height="8" fill="none" stroke="#e5484d" stroke-dasharray="2 2"' + at(4.2) + '/>';
      s += label(456, 236, 'leaf 41,206 missing', 4.6, '#e5484d');
      s += label(385, 240, 'replayed head 0x4d01…  ≠  0x9c4e…', 5.8, '#c9c3b6');
      s += '<g class="in"' + at(6.6) + '><rect x="470" y="252" width="210" height="26" rx="3" fill="none" stroke="#e5484d"/><text x="575" y="269" text-anchor="middle" font-family="' + MONO + '" font-size="12" fill="#e5484d">unverifiable · never clean</text></g>';
      return s;
    }
  };

  function scene(el, name) {
    var build = scenes[name]; if (!build) return;
    function render() { el.innerHTML = '<svg class="sc" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + el.getAttribute('aria-label') + '">' + build() + '</svg>'; }
    render();
    if (reduced) return;
    var timer = setInterval(function () { if (!document.hidden) render(); }, LOOP);
    return { stop: function () { clearInterval(timer); } };
  }
  window.Tocsin = window.Tocsin || {}; window.Tocsin.scene = scene;
  document.querySelectorAll('[data-scene]').forEach(function (el) { scene(el, el.dataset.scene); });
})();
