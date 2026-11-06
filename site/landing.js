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
      ["01", "choose", "Load the writers from your signed trust list."],
      [
        "02",
        "prove",
        "Check their record fingerprints against a light-client-verified block.",
      ],
      [
        "03",
        "replay",
        "The provider left out a flag. The fingerprints do not match.",
      ],
      [
        "04",
        "stop",
        '<span class="trace-alert">Unverifiable.</span> No all-clear from incomplete data.',
      ],
      [
        "05",
        "retry",
        "Fetch from another source. Replay matches the proven record.",
      ],
      [
        "06",
        "check",
        "A writer you allow to block has flagged this recipient.",
      ],
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
            "<b>Blocked.</b> The warning survives a dishonest provider.";
          body.appendChild(verdict);
          foot.textContent =
            "Verify the record. Apply your policy. Keep the check local.";
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
          '</span><span class="src">' +
          line[1] +
          '</span><span class="msg">' +
          line[2] +
          "</span>";
        body.appendChild(row);
        if (reduced) next();
        else lineTimer = setTimeout(next, 550);
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
