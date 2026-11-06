"use client";

import { useEffect } from "react";
import { loadKit } from "~~/utils/kit";

/** Runs the canonical static-site behavior with React-owned mount and cleanup. */
export const LandingScripts = () => {
  useEffect(() => {
    let cancelled = false;
    const stops: (() => void)[] = [];
    loadKit(["/kit/ringfield.js", "/kit/scenes.js", "/kit/trust.js", "/kit/landing.js"])
      .then(kit => {
        if (cancelled) return;
        stops.push(kit.mountLanding!(), kit.mountTrustTour!());
        document.querySelectorAll<HTMLElement>("[data-scene]").forEach(el => {
          const scene = kit.scene?.(el, el.dataset.scene!);
          if (scene) stops.push(scene.stop);
        });
      })
      .catch(error => console.error("Landing scripts failed to load", error));
    return () => {
      cancelled = true;
      stops.forEach(stop => stop());
    };
  }, []);
  return null;
};
