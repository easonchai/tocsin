"use client";

import { useEffect } from "react";
import { type Ringfield, loadKit } from "~~/utils/kit";

// The trace: the RPC lies, the wallet catches it. [time, source, source class, message html, message class]
const SCRIPT: [string, string, string, string, string?][] = [
  ["00.00", "wallet", "", 'paste recipient <span class="k">0x7a3F…c91B</span>'],
  ["00.01", "rpc", "rpc", 'label lookup → <span class="k">clean</span> (no reports)'],
  ["00.02", "helios", "lc", "finalized header slot 11,482,207 · sync committee 512/512"],
  ["00.03", "helios", "lc", "eth_getProof(log, [0,1]) · 6.9 kB · verified against stateRoot"],
  ["00.04", "tocsin", "ab", "globalHead 0x9c4e…a1f0 · seq 41,207 · replayed 41,207 leaves ✓"],
  ["00.05", "tocsin", "ab", "lists: core, blockaid, scamsniffer · 3 independent"],
  [
    "00.06",
    "tocsin",
    "ab",
    '<span class="k">0x7a3F…c91B</span> → DRAINER_RECEIVER · flagged by 3/3 · evidence 0x31b7…',
  ],
  ["00.07", "tocsin", "ab", "local heuristic: no prefix/suffix match with your history", "dim"],
];

/** The inline script of site/index.html: reveals, the ring field, the scenes and the hero trace. */
export const LandingScripts = () => {
  useEffect(() => {
    const canvas = document.getElementById("field");
    const body = document.getElementById("term-body");
    const foot = document.getElementById("term-foot");
    const dot = document.querySelector(".term-bar .dot");
    const replay = document.getElementById("replay");
    if (!(canvas instanceof HTMLCanvasElement) || !body || !foot || !dot || !replay) return;

    let cancelled = false;
    let rf: Ringfield | undefined;
    const stops: (() => void)[] = [];
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };

    // reveals first, so the copy shows even if the kit scripts fail to load
    const io = new IntersectionObserver(
      es =>
        es.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".rv").forEach(el => io.observe(el));
    later(() => document.querySelectorAll(".rv").forEach(el => el.classList.add("in")), 1200);

    loadKit(["/kit/ringfield.js", "/kit/scenes.js"])
      .then(Tocsin => {
        if (cancelled) return;
        rf = Tocsin.ringfield(canvas, { seed: 7, mask: "h1,h2,h3,p,.tag,.label,.proof,.rows,.card" });
        // scenes.js fills [data-scene] when it first runs; fill any it did not, e.g. after a client-side visit
        document.querySelectorAll<HTMLElement>("[data-scene]").forEach(el => {
          if (el.childElementCount || !el.dataset.scene) return;
          const s = Tocsin.scene?.(el, el.dataset.scene);
          if (s) stops.push(s.stop);
        });
      })
      .catch(e => console.error("Landing: the ring field and scenes did not load.", e));

    let idleTimer: number | undefined;
    const run = () => {
      body.innerHTML = "";
      dot.className = "dot live";
      if (idleTimer) window.clearTimeout(idleTimer);
      rf?.setState("syncing");
      foot.textContent = "";
      const cur = document.createElement("div");
      cur.className = "ln cur";
      cur.innerHTML = '<span class="t"> </span><span class="src"> </span><span class="msg">█</span>';
      let i = 0;
      const next = () => {
        if (i >= SCRIPT.length) {
          const v = document.createElement("div");
          v.className = "verdict";
          v.innerHTML = "<b>Blocked.</b> Drainer receiver, flagged by core, Blockaid and Scam Sniffer.";
          cur.remove();
          body.appendChild(v);
          foot.textContent = "The RPC said clean. The wallet never asked it who to trust.";
          dot.className = "dot blocked";
          rf?.setState("blocked");
          const vr = v.getBoundingClientRect();
          rf?.strike(vr.left + vr.width / 2, vr.bottom);
          idleTimer = later(() => rf?.setState("idle"), 6000);
          return;
        }
        const [t, src, srcClass, msg, msgClass] = SCRIPT[i++];
        const d = document.createElement("div");
        d.className = "ln";
        d.innerHTML = `<span class="t">${t}</span><span class="src ${srcClass}">${src}</span><span class="msg ${msgClass || ""}">${msg}</span>`;
        body.appendChild(d);
        body.appendChild(cur);
        if (i === 5) rf?.setState("verified");
        later(next, i === 2 ? 650 : 420);
      };
      next();
    };
    replay.addEventListener("click", run);
    // the trace sits in the hero, so it runs on load and the strike lands where the reader is looking
    later(run, 900);

    return () => {
      cancelled = true;
      replay.removeEventListener("click", run);
      io.disconnect();
      timers.forEach(id => window.clearTimeout(id));
      stops.forEach(stop => stop());
      rf?.destroy();
    };
  }, []);

  return null;
};
