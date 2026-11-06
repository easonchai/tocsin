// node --test: the scenario table agrees with the demo address table, so a reseed cannot leave the page lying.
import { DEMO_ACCOUNT, FAKE_USDC, REAL_USDC, SCENARIOS, listsOf } from "./scenarios.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const docs = new URL("../../../../../docs/plan/demo/", import.meta.url);

// Label column, cut at " (" so "fakeUSDC (symbol USDC, ...)" keys as "fakeUSDC".
const table = new Map(
  readFileSync(new URL("test-addresses.tsv", docs), "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map(line => {
      const [address, type, lists, label, expected] = line.split("\t");
      // Undefined for rows no send can reach (malicious-delegate-1); a scenario using one then fails below.
      const verdict = /^(clean|warn|block|unverifiable)\b/.exec(expected)?.[1];
      return [label.split(" (")[0], { address, type, lists: lists === "(none)" ? [] : lists.split(", "), verdict }];
    }),
);

// Subjects the tsv does not list. Anything else must match a tsv label, so a typo cannot skip a row.
const OFF_TABLE = new Set(["demo account", "SwapRouter02", "connected account"]);

test("every scenario subject matches its demo address table row", () => {
  for (const s of SCENARIOS) {
    const row = table.get(s.subjectLabel);
    if (!row) {
      assert.ok(OFF_TABLE.has(s.subjectLabel), `${s.id}: label ${s.subjectLabel} is not in test-addresses.tsv`);
      continue;
    }
    assert.equal(s.subject, row.address, `${s.id}: address`);
    assert.deepEqual(listsOf(s).sort(), [...row.lists].sort(), `${s.id}: lists`);
    assert.equal(s.category, row.type, `${s.id}: category`);
    // The poison row reads the same subject through the lying proxy, so the wallet cannot call it anything.
    assert.equal(s.expected, s.poison ? "unverifiable" : row.verdict, `${s.id}: expected verdict`);
  }
});

test("off-table subjects are unflagged and the fixed addresses match their sources", () => {
  for (const s of SCENARIOS.filter(s => OFF_TABLE.has(s.subjectLabel))) {
    assert.deepEqual(s.flags, [], `${s.id}: flags`);
    assert.equal(s.expected, "clean", `${s.id}: expected verdict`);
  }
  assert.equal(REAL_USDC, table.get("realUSDC")?.address);
  assert.equal(FAKE_USDC, table.get("fakeUSDC")?.address);
  const runbook = readFileSync(new URL("../../operator.md", docs), "utf8");
  assert.match(runbook, new RegExp(`\\| Demo account \\| \`${DEMO_ACCOUNT}\``));
  assert.equal(SCENARIOS.find(s => s.id === "send-clean")?.subject, DEMO_ACCOUNT);
});

test("scenario ids are unique", () => {
  assert.equal(new Set(SCENARIOS.map(s => s.id)).size, SCENARIOS.length);
});
