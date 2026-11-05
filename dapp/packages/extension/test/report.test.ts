// node --test: what the overlay does for each verdict.
import assert from "node:assert/strict";
import { test } from "node:test";
import { OVERRIDE_DELAY_MS, type Report, plan, unavailableReport } from "../src/report.ts";

const report = (verdict: Report["verdict"]): Report => ({ verdict, items: [], unavailable: [], trust: "t" });

test("clean shows nothing and continues", () => {
  assert.deepEqual(plan(report("clean")), { show: false });
});

test("block shows the overlay with the override held back", () => {
  const p = plan(report("block"));
  assert.ok(p.show);
  assert.equal(p.tone, "danger");
  assert.equal(p.overrideDelayMs, OVERRIDE_DELAY_MS);
  assert.ok(OVERRIDE_DELAY_MS >= 3_000, "long enough to read before overriding");
});

test("warn shows the overlay and continues on confirm, no delay", () => {
  const p = plan(report("warn"));
  assert.ok(p.show);
  assert.equal(p.tone, "warning");
  assert.equal(p.overrideDelayMs, 0);
});

test("unavailable states why and offers to continue", () => {
  const p = plan(unavailableReport("the Sepolia light client is still syncing"));
  assert.ok(p.show);
  assert.equal(p.body, "the Sepolia light client is still syncing");
  assert.equal(p.overrideDelayMs, 0);
  assert.match(p.proceedLabel, /continue/i);
});
