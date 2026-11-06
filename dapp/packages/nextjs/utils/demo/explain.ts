// explain(): the demo stage's copy of the reader's rules. Presentation code only: nothing here
// checks the chain, and the wallet does its own evaluation. Kept in step with
// dapp/packages/reader/src/evaluate.ts by hand; explain.test.ts ties every verdict to the table.
import {
  type Category,
  type Context,
  LISTS,
  type List,
  type Scenario,
  type Verdict,
  type Writer,
  contextOf,
  writerById,
} from "./scenarios.ts";

export type Policy = { threshold: 1 | 2; warnOnly: readonly Category[] };

// Mirrors the Snap's DEFAULT_POLICY in snap/src/state.ts.
export const DEFAULT_POLICY: Policy = { threshold: 2, warnOnly: ["POISONING_FUNDER", "THEFT_PROCEEDS"] };

// The categories each context reads, from the reader's context table.
const CONTEXT_CATEGORIES: Record<Context, readonly Category[]> = {
  recipient: [
    "POISONING_OPERATOR",
    "POISONING_FUNDER",
    "DRAINER_RECEIVER",
    "PAID_LOOKALIKE",
    "DRAINER_SPENDER",
    "THEFT_PROCEEDS",
  ],
  spender: ["DRAINER_RECEIVER", "DRAINER_SPENDER"],
  token: ["MALICIOUS_TOKEN"],
};

export type ListOutcome = {
  list: List;
  // Writers on this list with a live flag on the subject.
  flagged: Writer[];
  // Same-writer tombstones: flagged, then retracted. They count toward nothing.
  retracted: Writer[];
  // Independent groups (by operator) toward the threshold.
  counted: number;
  heavy: boolean;
  verdict: Exclude<Verdict, "unverifiable">;
};

export type Scene = {
  context: Context;
  lists: ListOutcome[];
  // Distinct operators among all live flags: core and the detector count once.
  independent: number;
  flaggedLists: number;
  collapsed: boolean;
  rule: string;
  verdict: Verdict;
};

const RANK: Record<Verdict, number> = { clean: 0, warn: 1, block: 2, unverifiable: 3 };

const joinAnd = (names: string[]): string =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function explain(s: Scenario, policy: Policy = DEFAULT_POLICY, lists: readonly List[] = LISTS): Scene {
  const context = contextOf(s);
  const applies = s.category !== null && CONTEXT_CATEGORIES[context].includes(s.category);
  const warnOnly =
    s.category !== null &&
    ((context === "recipient" && s.category === "THEFT_PROCEEDS") || policy.warnOnly.includes(s.category));

  const outcomes = lists.map((list): ListOutcome => {
    const mine = s.flags.filter(f => list.writers.some(w => w.id === f.writer));
    const byId = (f: (typeof mine)[number]) => writerById(f.writer, lists).writer;
    const flagged = applies ? mine.filter(f => !f.tombstoned).map(byId) : [];
    const retracted = mine.filter(f => f.tombstoned).map(byId);
    const blocking = warnOnly ? [] : flagged.filter(w => w.weight > 0);
    const counted = new Set(blocking.map(w => w.operator)).size;
    const heavy = blocking.some(w => w.weight === 255);
    const verdict = heavy || counted >= policy.threshold ? "block" : flagged.length ? "warn" : "clean";
    return { list, flagged, retracted, counted, heavy, verdict };
  });

  const live = outcomes.flatMap(o => o.flagged);
  const independent = new Set(live.map(w => w.operator)).size;
  const flaggedLists = outcomes.filter(o => o.flagged.length).length;
  const base = { context, lists: outcomes, independent, flaggedLists, collapsed: independent < live.length };
  const worst = outcomes.reduce<Verdict>((v, o) => (RANK[o.verdict] > RANK[v] ? o.verdict : v), "clean");

  if (s.poison)
    return {
      ...base,
      verdict: "unverifiable",
      rule: "The RPC left out one of the writer's entries. The replayed fold does not reach the head Ethereum proves. Nothing it says can be trusted, so the wallet refuses to call this clean.",
    };
  if (!live.length && outcomes.some(o => o.retracted.length))
    return {
      ...base,
      verdict: "clean",
      rule: "The writer retracted its own flag with a tombstone. The log keeps both entries; the wallet counts neither.",
    };
  if (!live.length) return { ...base, verdict: "clean", rule: "No list you follow has a flag on this address." };
  if (warnOnly && live.some(w => w.weight === 255))
    return {
      ...base,
      verdict: worst,
      rule: "A weight-255 writer would block, but this category warns and never blocks a send: the money is already stolen, the wallet only tells you where it is going.",
    };

  const heavyLists = outcomes.filter(o => o.heavy).map(o => o.list.name);
  if (heavyLists.length)
    return {
      ...base,
      verdict: worst,
      rule: `${joinAnd(heavyLists)} ${heavyLists.length > 1 ? "carry" : "carries"} this writer at weight 255. One such writer blocks on its own.`,
    };
  if (worst === "block")
    return { ...base, verdict: worst, rule: "Two independent writers on one list reach the threshold. That blocks." };
  if (flaggedLists > 1)
    return {
      ...base,
      verdict: worst,
      rule: "Each list has one writer at weight 1. One writer warns. Two lists do not add up to a block.",
    };
  const stricter = policy.threshold > 1 && explain(s, { ...policy, threshold: 1 }, lists).verdict === "block";
  return {
    ...base,
    verdict: worst,
    rule: `One writer at weight 1 warns.${stricter ? " Set the Snap policy to 1 writer and this blocks." : ""}`,
  };
}
