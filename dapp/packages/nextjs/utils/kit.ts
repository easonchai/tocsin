// The kit's vanilla scripts (copies of design/kit/*.js in public/kit/) set window.Tocsin when they run.
export type Ringfield = {
  strike: (x: number, y: number) => void;
  setState: (state: "idle" | "syncing" | "verified" | "unverifiable" | "blocked") => void;
  remask: () => void;
  destroy: () => void;
};

type Tocsin = {
  mountLanding?: () => () => void;
  mountTrustTour?: () => () => void;
  ringfield: (canvas: HTMLCanvasElement, opts?: { seed?: number; state?: string; mask?: string | false }) => Ringfield;
  scene?: (el: Element, name: string) => { stop: () => void } | undefined;
};

declare global {
  interface Window {
    Tocsin?: Tocsin;
  }
}

const loading = new Map<string, Promise<void>>();

/** Appends a classic <script> once per page load and resolves when it has run. */
export const loadScript = (src: string): Promise<void> => {
  const known = loading.get(src);
  if (known) return known;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(s);
  });
  loading.set(src, p);
  return p;
};

/** Loads the kit scripts in order and returns window.Tocsin. */
export const loadKit = async (scripts: string[]): Promise<Tocsin> => {
  for (const src of scripts) await loadScript(src);
  if (!window.Tocsin) throw new Error("The kit scripts ran but window.Tocsin is missing");
  return window.Tocsin;
};
