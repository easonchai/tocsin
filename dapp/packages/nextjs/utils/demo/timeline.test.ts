// node --test: every scene's sequence ends on its verdict, under the spec's five seconds.
import { explain } from "./explain.ts";
import { SCENARIOS } from "./scenarios.ts";
import { drawnFlags, timeline } from "./timeline.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("every scene ends on the verdict in under five seconds", () => {
  for (const s of SCENARIOS) {
    const cues = timeline(s, explain(s));
    const last = cues.at(-1);
    assert.equal(last?.key, "verdict", s.id);
    // the verdict's entrance and ripple start take another 500 ms
    assert.ok((last?.at ?? Infinity) + 500 < 5000, `${s.id} ends at ${last?.at}`);
  }
});

test("the lying-RPC scene draws no wires, the retracted one draws its tombstoned flag", () => {
  const poison = SCENARIOS.find(s => s.poison);
  assert.ok(poison);
  assert.deepEqual(drawnFlags(poison, explain(poison)), []);
  const retracted = SCENARIOS.find(s => s.id === "send-paid-lookalike-retracted");
  assert.ok(retracted);
  assert.ok(timeline(retracted, explain(retracted)).some(c => c.key === "x:core"));
});
