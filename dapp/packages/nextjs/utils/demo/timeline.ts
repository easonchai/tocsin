// The stage's timed sequence: when each piece of a scene appears, in ms from the start. Presentation only.
// Timings: lists stagger 120 ms, writers 480 ms apart,
// rule 650 ms before the verdict, the whole sequence under five seconds.
import type { Scene } from "./explain.ts";
import { type Flag, LISTS, type Scenario } from "./scenarios.ts";

export type Cue = { at: number; key: string };

export const PROOF_STEPS = 9; // label, four nodes, three links, the compare line

/** The flags the stage draws a wire for: live or retracted ones explain() counted, in table order. */
export const drawnFlags = (s: Scenario, scene: Scene): Flag[] =>
  s.poison
    ? []
    : s.flags.filter(f => scene.lists.some(o => [...o.flagged, ...o.retracted].some(w => w.id === f.writer)));

export function timeline(s: Scenario, scene: Scene): Cue[] {
  const cues: Cue[] = [{ at: 60, key: "mid" }];
  LISTS.forEach((_, k) => cues.push({ at: 440 + k * 120, key: `list${k}` }));
  for (let k = 0; k < PROOF_STEPS; k++) cues.push({ at: 360 + k * 110, key: `proof${k}` });
  let t = 960;
  if (s.poison) {
    cues.push({ at: t, key: "seq" }, { at: (t += 800), key: "gap" });
    t += 600;
  } else {
    const flags = drawnFlags(s, scene);
    for (const f of flags) {
      cues.push({ at: t, key: `w:${f.writer}` });
      if (f.tombstoned) cues.push({ at: t + 700, key: `x:${f.writer}` });
      t += 480;
    }
    if (flags.some(f => f.tombstoned)) t += 600;
    if (scene.flaggedLists) {
      cues.push({ at: t, key: "count" });
      t += 500;
    }
  }
  cues.push({ at: t, key: "rule" }, { at: t + 650, key: "verdict" });
  return cues.sort((a, b) => a.at - b.at);
}
