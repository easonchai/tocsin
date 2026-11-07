/* Tocsin how-it-works scenes. Three short stories narrated by a caption in plain words, played in order:
   01 finishes, then 02 starts, then 03, once the section scrolls into view. The trio then holds and replays.
   Devcon schematic language: hairline connectors, mono pills for actors, one solid paper hero node.
   Usage: Tocsin.scene(el, 'append' | 'prove' | 'lie'). Needs scenes.css. */
(function () {
  var MONO = 'JetBrains Mono, monospace', AMBER = '#e9a23b', RED = '#e5484d';
  // each scene starts 400ms after the previous one ends; END is when its last element lands
  var END = { append: 5.6, prove: 5.0, lie: 5.4 }, GAP = .4;
  var OFFSET = { append: 0, prove: END.append + GAP, lie: END.append + END.prove + 2 * GAP };
  var LOOP = (OFFSET.lie + END.lie + 4.2) * 1000; // ~4s hold on the finished trio before it replays
  var HEIGHT = { append: 380, prove: 320, lie: 320 };
  var captions = [], off = 0;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function at(d, until, extra) {
    if (reduced) return extra ? ' style="' + extra + '"' : '';
    return ' style="animation-delay:' + (d + off).toFixed(2) + 's' + (until != null ? ';animation-duration:' + (until - d) + 's' : '') + (extra ? ';' + extra : '') + '"';
  }
  function pill(x, y, w, text, d, cls) {
    return '<g class="' + (cls || 'in') + '"' + at(d) + '><rect x="' + x + '" y="' + (y - 13) + '" width="' + w + '" height="26" rx="3" fill="#1a1d22" stroke="#3a3f47"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + 5) + '" text-anchor="middle" font-family="' + MONO + '" fill="#c9c3b6">' + text + '</text></g>';
  }
  function wire(dd, d, cls) { return '<path class="draw ' + (cls || '') + '" d="' + dd + '"' + at(d) + '/>'; }
  function label(x, y, text, d, fill, anchor, until) { return '<text class="' + (until != null ? 'cap' : 'in') + '" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-family="' + MONO + '" fill="' + (fill || '#8f8b82') + '"' + at(d, until) + '>' + text + '</text>'; }
  // something that travels by (dx, dy): 'go' stays where it lands, 'mv' is absorbed on arrival
  function travel(inner, d, dur, dx, dy, keep, cls) { return '<g class="' + (keep ? 'go' : 'mv') + (cls ? ' ' + cls : '') + '"' + at(d, d + dur, '--dx:' + dx + 'px;--dy:' + dy + 'px') + '>' + inner + '</g>'; }
  function dot(x, y, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + (fill || AMBER) + '"/>'; }
  function flag(x, y, n, fill) {
    return '<rect x="' + (x - 14) + '" y="' + (y - 14) + '" width="28" height="28" rx="2" fill="' + (fill || '#ece7dc') + '"/>' +
      '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="' + MONO + '" fill="#121417">' + n + '</text>';
  }
  function verdict(x, y, w, text, d, color) { return '<g class="in"' + at(d) + '><rect x="' + x + '" y="' + (y - 15) + '" width="' + w + '" height="30" rx="3" fill="none" stroke="' + color + '"/><text x="' + (x + w / 2) + '" y="' + (y + 5) + '" text-anchor="middle" font-family="' + MONO + '" fill="' + color + '">' + text + '</text></g>'; }
  function caption(i, t, text) { captions[i] = [t, text]; return ''; }

  var scenes = {
    // A writer appends a flag to its own chain on Ethereum; every wallet following that writer picks it up.
    append: function () {
      var s = '';
      s += pill(75, 30, 210, 'a victim pays', 0);
      s += caption(0, 0, 'A payment gives a writer evidence of a scam.');
      s += wire('M180 43V77', .5);
      s += pill(75, 90, 210, 'writer · flag + evidence', .7);
      s += '<g class="in"' + at(.2) + '><rect x="40" y="135" width="280" height="120" rx="3" fill="#ece7dc"/>' +
        '<text x="180" y="162" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" fill="#121417">the log · on Ethereum</text>' +
        '<path d="M111 200H139M161 200H189M211 200H239" stroke="#8f8b82" stroke-width="1.5"/>' +
        [100, 150, 200].map(function (x) { return '<rect x="' + (x - 11) + '" y="189" width="22" height="22" rx="2" fill="#3a3f47"/>'; }).join('') +
        '<rect x="239" y="189" width="22" height="22" rx="2" fill="none" stroke="#8f8b82" stroke-dasharray="3 3"/></g>';
      s += caption(1, 1.4, 'A writer publishes a flag and its evidence under their own key.');
      s += travel('<rect x="169" y="99" width="22" height="22" rx="2" fill="' + AMBER + '"/>', 1.6, 1.0, 70, 90, true);
      s += label(180, 238, 'head 0x17b0…', .2, '#3a3f47', 'middle', 2.8);
      s += label(180, 238, 'head 0x9c4e…', 2.8, '#121417');
      s += caption(2, 2.8, 'The log appends the flag to that writer’s chain. Nothing before it changes.');
      s += caption(3, 4.2, 'Wallets following that writer pick up the flag and check it themselves.');
      [[70, 'Kohaku'], [180, 'MetaMask'], [290, 'your wallet']].forEach(function (w, i) {
        var x = w[0], d = 4.4 + i * .25;
        s += wire('M180 255L' + x + ' 300', 4.2);
        s += '<rect class="in" x="' + (x - 20) + '" y="300" width="40" height="40" rx="3" fill="#1a1d22" stroke="#8f8b82"' + at(4.2) + '/>';
        s += travel(dot(180, 255), d, .5, x - 180, 45);
        s += '<rect class="in" x="' + (x - 20) + '" y="300" width="40" height="40" rx="3" fill="' + AMBER + '"' + at(d + .5) + '/>';
        s += label(x, 364, w[1], 4.2, '#c9c3b6');
      });
      return s;
    },
    // the wallet proves the writer head, then replays flags from any source up to it
    prove: function () { return replay(false); },
    // a provider leaves out flag 93: the replay lands somewhere else and the reader says unverifiable
    lie: function () { return replay(true); }
  };

  function replay(lying) {
    var s = '', hashes = lying ? ['0x2b71…', '0x4d01…'] : ['0x2b71…', '0x61a0…', '0x9c4e…'];
    s += pill(60, 28, 240, 'finalized block header', 0, 'drop');
    s += wire('M180 41V92', .5, 'amber');
    s += travel(dot(180, 41), .6, .6, 0, 51);
    s += label(192, 72, 'storage proof', .8, AMBER, 'start');
    s += pill(70, 105, 220, 'writer head 0x9c4e…', 1.2, 'in head');
    s += caption(0, 0, lying ? 'The wallet proves the writer’s head against a verified header.' : 'A light client verifies a finalized block header.');
    s += caption(1, 1.4, lying ? 'A provider serves the flags but leaves out 93.' : 'A storage proof against that header gives the writer’s head.');
    s += label(20, 176, lying ? 'flags · a provider' : 'flags · any source', 1.6, '#8f8b82', 'start');
    s += label(272, 176, 'replayed hash', 1.6);
    s += '<rect class="in" x="220" y="186" width="120" height="40" rx="3" fill="#1a1d22" stroke="#3a3f47"' + at(1.6) + '/>';
    // the queue: 91 sits nearest the fold and goes first
    [[112, 91], [72, 92], [32, 93]].forEach(function (f, i) {
      if (lying && f[1] === 93) {
        s += '<g class="in"' + at(1.8) + '><rect x="18" y="192" width="28" height="28" rx="2" fill="none" stroke="' + RED + '" stroke-dasharray="3 3"/>' +
          '<text x="32" y="211" text-anchor="middle" font-family="' + MONO + '" fill="' + RED + '">93</text></g>';
        s += label(18, 246, '93 missing', 2.6, RED, 'start');
        return;
      }
      s += '<g class="in"' + at(1.8 + i * .1) + '>' + travel(flag(f[0], 206, f[1]), 2.4 + i * .5, .6, 220 - f[0], 0, false, 'queued') + '</g>';
    });
    hashes.forEach(function (h, i) {
      var d = 3.0 + i * .5, last = i === hashes.length - 1;
      s += label(280, 212, h, d, last ? (lying ? RED : AMBER) : '#c9c3b6', 'middle', last ? null : d + .5);
    });
    s += caption(2, 2.8, lying ? 'Replaying what arrived lands on a different hash.' : 'Flags from any source fold one by one into a running hash.');
    s += wire('M334 184V105H290', 4.2, lying ? 'bad' : 'amber');
    s += '<text class="' + (lying ? 'flash' : 'in') + '" x="322" y="148" text-anchor="end" font-family="' + MONO + '" font-weight="500" fill="' + (lying ? RED : AMBER) + '"' + at(4.5) + '>' + (lying ? '≠ proven head' : '= proven head') + '</text>';
    if (lying) s += '<rect class="flash" x="220" y="186" width="120" height="40" rx="3" fill="none" stroke="' + RED + '" stroke-width="1.5"' + at(4.5) + '/>';
    s += verdict(50, 290, 260, lying ? 'unverifiable · not clean' : 'match ✓ · record complete', lying ? 5.0 : 4.7, lying ? RED : AMBER);
    s += caption(3, 4.2, lying ? 'Missing data means unverifiable. It cannot establish a clean result.' : 'The replay matches the proven head, so no flag was left out.');
    return s;
  }

  function scene(el, name) {
    var build = scenes[name]; if (!build) return;
    function render() {
      captions = []; off = OFFSET[name];
      var drawing = build();
      var narration = captions.map(function (c, i) {
        var final = i === captions.length - 1;
        return '<span class="scene-caption' + (final ? ' scene-caption-final' : '') + '"' + at(c[0], final ? null : captions[i + 1][0]) + '>' + c[1] + '</span>';
      }).join('');
      el.innerHTML = '<svg class="sc sc-compact" viewBox="0 0 360 ' + HEIGHT[name] + '" role="img" aria-label="' + el.getAttribute('aria-label') + '">' + drawing + '</svg><div class="scene-captions">' + narration + '</div>';
    }
    var timer = null, started = false;
    // Hold every scene on its first frame until the section is on screen, so 01, 02 and 03 start from one moment.
    el.classList.add('sc-wait');
    render();
    if (reduced) { el.classList.remove('sc-wait'); return { stop: function () {} }; }
    var io = new IntersectionObserver(function (entries) {
      if (started || !entries.some(function (e) { return e.isIntersecting; })) return;
      started = true; io.disconnect();
      el.classList.remove('sc-wait'); render();
      timer = setInterval(function () { if (!document.hidden) render(); }, LOOP);
    }, { threshold: .25 });
    io.observe(el.closest('section') || el);
    return { stop: function () { clearInterval(timer); io.disconnect(); } };
  }
  window.Tocsin = window.Tocsin || {}; window.Tocsin.scene = scene;
  document.querySelectorAll('[data-scene]').forEach(function (el) { scene(el, el.dataset.scene); });
})();
