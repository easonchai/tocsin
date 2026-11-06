// node --test: the stage's explanation agrees with the table, and the table's writers with the signed lists.
import { DEFAULT_POLICY, explain } from "./explain.ts";
import { LISTS, type List, SCENARIOS, type Scenario } from "./scenarios.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const seed = new URL("../../../../../docs/plan/demo/seed/", import.meta.url);

test("explain() reaches every scenario's expected verdict under the default policy", () => {
  for (const s of SCENARIOS) assert.equal(explain(s).verdict, s.expected, s.id);
});

test("LISTS match the signed list documents", () => {
  for (const list of LISTS) {
    const doc = JSON.parse(readFileSync(new URL(`${list.short}.list.json`, seed), "utf8"));
    assert.equal(doc.name, list.name);
    const entries = doc.trustList.entries.map((e: { writer: string; weight: number; operator: string }) => ({
      address: e.writer.toLowerCase(),
      weight: e.weight,
      operator: e.operator.toLowerCase(),
    }));
    const ours = list.writers.map(w => ({ address: w.address.toLowerCase(), weight: w.weight, operator: w.operator }));
    assert.deepEqual(ours, entries, list.name);
  }
});

const byId = (id: string): Scenario => {
  const s = SCENARIOS.find(x => x.id === id);
  assert.ok(s, id);
  return s;
};

test("the rule sentence follows the spec's precedence", () => {
  assert.match(explain(byId("send-drainer-receiver-4-poison")).rule, /^The RPC left out/);
  assert.match(explain(byId("send-paid-lookalike-retracted")).rule, /^The writer retracted/);
  assert.match(explain(byId("send-clean")).rule, /^No list you follow/);
  assert.match(explain(byId("send-theft-proceeds-1")).rule, /^A weight-255 writer would block/);
  assert.equal(
    explain(byId("send-drainer-receiver-1")).rule,
    "core.tocsin.eth and blockaid.tocsin.eth carry this writer at weight 255. One such writer blocks on its own.",
  );
  assert.match(explain(byId("send-poisoning-operator-1")).rule, /^Each list has one writer at weight 1/);
  assert.equal(
    explain(byId("send-sniffer-poisoning-operator-1")).rule,
    "One writer at weight 1 warns. Set the Snap policy to 1 writer and this blocks.",
  );
  // A warn-only category stays a warning at threshold 1, so no hint.
  assert.equal(explain(byId("send-poisoning-funder-1")).rule, "One writer at weight 1 warns.");
});

test("core and the detector share an operator and count once", () => {
  const scene = explain(byId("send-drainer-receiver-1"));
  assert.equal(scene.independent, 3);
  assert.equal(scene.collapsed, false);
  const both = explain({ ...byId("send-drainer-receiver-1"), flags: [{ writer: "core" }, { writer: "detector" }] });
  assert.equal(both.independent, 1);
  assert.equal(both.collapsed, true);
});

test("two independent weight-1 writers on one list block by count", () => {
  const lists: List[] = [
    {
      name: "core.tocsin.eth",
      short: "core",
      role: "us",
      writers: [
        { id: "detector", label: "a", address: "0x0000000000000000000000000000000000000001", weight: 1, operator: "0x01" },
        { id: "scamsniffer", label: "b", address: "0x0000000000000000000000000000000000000002", weight: 1, operator: "0x02" },
      ],
    },
  ];
  const s = { ...byId("send-poisoning-operator-1"), flags: [{ writer: "detector" as const }, { writer: "scamsniffer" as const }] };
  const scene = explain(s, DEFAULT_POLICY, lists);
  assert.equal(scene.verdict, "block");
  assert.equal(scene.rule, "Two independent writers on one list reach the threshold. That blocks.");
  assert.equal(scene.lists[0]?.counted, 2);
});

test("a flag in a category the context does not read counts toward nothing", () => {
  const s = { ...byId("approve-drainer-spender-1"), category: "POISONING_OPERATOR" as const };
  assert.equal(explain(s).verdict, "clean");
});
