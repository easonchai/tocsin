"use client";

import { useEffect } from "react";
import { initClaim } from "./claim";
import { type Ringfield, loadKit } from "~~/utils/kit";

/** Runs site/claim.html's module script and its ring field once the page has hydrated. */
export const ClaimScripts = () => {
  useEffect(() => {
    const stopClaim = initClaim();
    const canvas = document.getElementById("field");
    let cancelled = false;
    let rf: Ringfield | undefined;
    if (canvas instanceof HTMLCanvasElement) {
      loadKit(["/kit/ringfield.js"])
        .then(Tocsin => {
          if (cancelled) return;
          rf = Tocsin.ringfield(canvas, { seed: 11, state: "idle", mask: ".claim h1, .claim .lede, .panel" });
        })
        .catch(e => console.error("Claim: the ring field did not load.", e));
    }
    return () => {
      cancelled = true;
      stopClaim();
      rf?.destroy();
    };
  }, []);

  return null;
};
