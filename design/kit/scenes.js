/* Tocsin how-it-works scenes. Three looping stories in four beats each, narrated by a caption in plain words.
   Devcon schematic language: hairline connectors, mono pills for actors, one solid paper hero node, entrances
   staggered. Each scene is under 10s and loops. They double as loading illustrations.
   Usage: Tocsin.scene(el, 'append' | 'prove' | 'lie'). Needs scenes.css. */
(function () {
  var W = 720, H = 330, MONO = 'JetBrains Mono, monospace', BODY = 'Inter, sans-serif', LOOP = 13000; // END + ~2.8s hold on the finished scene before it rebuilds
  var BEATS = [.3, 2.8, 5.3, 7.8], END = 10.2;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function at(d, until) { return reduced ? '' : ' style="animation-delay:' + d + 's' + (until != null ? ';animation-duration:' + (until - d) + 's' : '') + '"'; }
  // actors: a mono pill. x is the left edge
  function pill(x, y, w, text, d, cls) {
    return '<g class="in ' + (cls || '') + '"' + at(d) + '><rect x="' + x + '" y="' + (y - 13) + '" width="' + w + '" height="26" rx="3" fill="#1a1d22" stroke="#3a3f47"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 4) + '" text-anchor="middle" font-family="' + MONO + '" font-size="12" fill="#c9c3b6">' + text + '</text></g>';
  }
  // the hero: solid paper. lines may be [text, delay] to arrive late, or [text, delay, until] to leave again
  function hero(x, y, w, h, title, lines, d) {
    var t = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="#ece7dc"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 27) + '" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="15" fill="#121417">' + title + '</text>';
    var late = '';
    lines.forEach(function (l, i) {
      var arr = Array.isArray(l), txt = arr ? l[0] : l, ly = y + 52 + i * 19;
      var el = '<text x="' + (x + w / 2) + '" y="' + ly + '" text-anchor="middle" font-family="' + MONO + '" font-size="11.5" fill="#3a3f47"' + (arr ? ' class="' + (l[2] != null ? 'cap' : 'in') + '"' + at(l[1], l[2]) : '') + '>' + txt + '</text>';
      if (arr) late += el; else t += el;
    });
    return '<g class="in"' + at(d) + '>' + t + '</g>' + late;
  }
  function wire(dd, d, cls) { return '<path class="draw ' + (cls || '') + '" d="' + dd + '"' + at(d) + '/>'; }
  function leaf(x, y, d, fill) { return '<rect class="in" x="' + (x - 4) + '" y="' + (y - 4) + '" width="8" height="8" fill="' + (fill || '#c9c3b6') + '"' + at(d) + '/>'; }
  function label(x, y, text, d, fill, anchor, until) { return '<text class="' + (until != null ? 'cap' : 'in') + '" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-family="' + MONO + '" font-size="11.5" fill="' + (fill || '#8f8b82') + '"' + at(d, until) + '>' + text + '</text>'; }
  // the caption: one plain sentence per beat, shown for that beat only
  function caption(i, text) { return '<text class="cap" x="' + (W / 2) + '" y="' + (H - 16) + '" text-anchor="middle" font-family="' + BODY + '" font-size="15" fill="#ece7dc"' + at(BEATS[i], i < 3 ? BEATS[i + 1] : END) + '>' + text + '</text>'; }
  function verdict(x, y, w, text, d, color) { return '<g class="in"' + at(d) + '><rect x="' + x + '" y="' + (y - 14) + '" width="' + w + '" height="28" rx="3" fill="none" stroke="' + color + '"/><text x="' + (x + w / 2) + '" y="' + (y + 4) + '" text-anchor="middle" font-family="' + MONO + '" font-size="12" fill="' + color + '">' + text + '</text></g>'; }

  var scenes = {
    // one bite, everyone immune: a victim pays, a writer records it, the log keeps it forever, every wallet that syncs knows
    append: function () {
      var s = '', b = BEATS;
      s += pill(30, 100, 150, 'a victim pays', b[0]);
      s += pill(30, 160, 150, '0x7a3F…c91B', b[0] + .4, 'addr');
      s += caption(0, 'Someone pays a scam address. It takes their money.');
      s += pill(230, 160, 160, 'SEAL · a writer', b[1]);
      s += wire('M180 160H230', b[1] + .2);
      s += hero(420, 70, 200, 180, 'the log · on Ethereum', ['one chain per writer', '', ['seal  head 0x17b0…', 0, b[2] + .4], ['seal  head 0x9c4e…', b[2] + .5], ['41,208 flags · 0 removed', b[2] + 1.2]], b[0]);
      s += wire('M390 160H420', b[1] + .8);
      s += leaf(405, 160, b[1] + 1.1);
      s += caption(1, 'A writer, say SEAL, records that address in the log under its own name.');
      s += caption(2, 'The log hashes it into SEAL\'s chain. Nothing in the log can ever be removed.');
      var ys = [100, 160, 220];
      ys.forEach(function (y, i) { s += wire('M620 ' + y + 'H645', b[3] + i * .3); s += pill(645, y, 62, 'wallet', b[3] + i * .3 + .2, 'wallet'); });
      s += caption(3, 'Every wallet that syncs the log now knows. One bite, everyone immune.');
      return s;
    },
    // your wallet checks Ethereum itself
    prove: function () {
      var s = '', b = BEATS;
      s += pill(30, 100, 160, 'you paste 0x7a3F…', b[0]);
      s += hero(250, 60, 160, 180, 'your wallet', ['light client', '', ['proven head 0x9c4e…', b[1] + 1.2], ['replayed   0x9c4e…', b[2] + 1.8], ['match ✓', b[2] + 2.2]], b[0] + .3);
      s += wire('M190 100H250', b[0] + .6);
      s += caption(0, 'You paste an address into your wallet.');
      s += pill(520, 90, 170, 'Ethereum · final block', b[1]);
      s += wire('M410 90H520', b[1] + .3, 'amber');
      s += label(465, 78, 'proof', b[1] + .8, '#e9a23b');
      s += caption(1, 'The wallet asks Ethereum itself, not a company, for the log\'s head. A proof, checked on the device.');
      s += pill(520, 200, 170, 'flags · from anywhere', b[2]);
      s += wire('M520 200H410', b[2] + .2);
      for (var k = 0; k < 4; k++) s += leaf(500 - k * 26, 200, b[2] + .5 + k * .3);
      s += caption(2, 'It downloads the flags from any source and replays them until they land on the proven head.');
      s += verdict(250, 272, 160, 'blocked · on device', b[3], '#e5484d');
      s += caption(3, 'The address is flagged by two independent writers. Blocked. No company was asked, nothing was sent.');
      return s;
    },
    // an rpc lies and the wallet notices
    lie: function () {
      var s = '', b = BEATS;
      s += pill(30, 100, 160, 'you paste 0x7a3F…', b[0]);
      s += hero(250, 60, 160, 180, 'your wallet', ['light client', '', ['proven head 0x9c4e…', b[1] + 1.2], ['replayed   0x4d01…', b[2] + 1.8], ['no match', b[2] + 2.2]], b[0] + .3);
      s += wire('M190 100H250', b[0] + .6);
      s += pill(520, 200, 170, 'RPC · says "clean"', b[0] + .9, 'bad');
      s += caption(0, 'This time the flags come from an RPC that lies. It says the address is clean.');
      s += pill(520, 90, 170, 'Ethereum · final block', b[1]);
      s += wire('M410 90H520', b[1] + .3, 'amber');
      s += label(465, 78, 'proof', b[1] + .8, '#e9a23b');
      s += caption(1, 'The wallet still asks Ethereum itself for the real head.');
      s += wire('M520 200H410', b[2] + .2);
      for (var k = 0; k < 4; k++) if (k !== 1) s += leaf(500 - k * 26, 200, b[2] + .5 + k * .3);
      s += '<rect class="in" x="470" y="196" width="8" height="8" fill="none" stroke="#e5484d" stroke-dasharray="2 2"' + at(b[2] + 1.4) + '/>';
      s += label(474, 224, 'one flag missing', b[2] + 1.6, '#e5484d');
      s += caption(2, 'It replays what the RPC gave it. The chain never reaches the proven head: a flag is missing.');
      s += verdict(250, 272, 160, 'unverifiable', b[3], '#e5484d');
      s += caption(3, 'The wallet says unverifiable, never clean. An RPC cannot talk a wallet into trusting it.');
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
