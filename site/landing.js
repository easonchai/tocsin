/* Canonical landing trace, shared by the static site and Next.js. */
(function () {
  function mountLanding() {
    var rf = Tocsin.ringfield(document.getElementById("field"), {
      seed: 7,
      mask: "h1,h2,h3,p,.tag,.label,.term,.amount,.source,.text-link,.trust-tour,.privacy-comparison,.build-status",
    });
    var body = document.getElementById("term-body");
    var foot = document.getElementById("term-foot");
    var replay = document.getElementById("replay");
    var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    var lines = [
      ["00.00", "wallet", "send 1 ETH to <span class=\"k\">0x79fD…7537</span>"],
      ["00.01", "lists", "core.tocsin.eth · blockaid.tocsin.eth · scamsniffer.tocsin.eth"],
      ["00.02", "helios", "finalized header · slot 11,482,207 · sync committee 512/512"],
      ["00.03", "proof", "eth_getProof(log, writer heads) · 6.9 kB · matches stateRoot"],
      ["00.04", "rpc", "getLogs core → 92 flags · <span class=\"trace-bad\">sequence 93 missing</span>", "bad"],
      ["00.05", "replay", "head 0x4d01… ≠ proven 0x9c4e… · <span class=\"trace-alert\">core unverifiable</span>"],
      ["00.06", "retry", "same flags from a mirror → 93 flags · head 0x9c4e… ✓"],
      ["00.07", "check", "<span class=\"k\">0x79fD…7537</span> → DRAINER_RECEIVER · flagged by 3/3 · evidence 0x3799…"],
    ];
    var lineTimer, idleTimer;
    function run() {
      clearTimeout(lineTimer);
      clearTimeout(idleTimer);
      body.innerHTML = "";
      foot.textContent = "";
      replay.disabled = true;
      var dot = document.querySelector(".term-bar .dot");
      dot.className = "dot live";
      rf.setState("syncing");
      var i = 0;
      function next() {
        if (i === lines.length) {
          var verdict = document.createElement("div");
          verdict.className = "verdict";
          verdict.innerHTML =
            "<b>Blocked.</b> Drainer receiver, flagged by core, Blockaid and Scam Sniffer.";
          body.appendChild(verdict);
          foot.textContent =
            "The RPC hid a flag. The wallet caught it, and never said clean.";
          replay.disabled = false;
          dot.className = "dot blocked";
          rf.setState("blocked");
          var rect = verdict.getBoundingClientRect();
          rf.strike(rect.left, rect.bottom);
          idleTimer = setTimeout(function () {
            rf.setState("idle");
          }, 6000);
          return;
        }
        var line = lines[i++];
        var row = document.createElement("div");
        row.className = "ln";
        row.innerHTML =
          '<span class="t">' +
          line[0] +
          '</span><span class="src' + (line[3] ? " rpc" : "") + '">' +
          line[1] +
          '</span><span class="msg">' +
          line[2] +
          "</span>";
        body.appendChild(row);
        if (reduced) next();
        else lineTimer = setTimeout(next, i === 5 ? 900 : 480);
      }
      next();
    }
    replay.addEventListener("click", run);
    run();
    return function () {
      clearTimeout(lineTimer);
      clearTimeout(idleTimer);
      replay.removeEventListener("click", run);
      rf.destroy();
    };
  }

  window.Tocsin = window.Tocsin || {};
  window.Tocsin.mountLanding = mountLanding;
})();
