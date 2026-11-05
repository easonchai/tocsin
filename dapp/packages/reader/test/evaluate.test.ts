import { type Address, type Hex, concat, getAddress, keccak256, pad, toHex, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  type AppendedLeaf,
  type Context,
  type EvaluateInput,
  type ListKind,
  type VerifiedList,
  acceptList,
  encodeListRecord,
  evaluate,
  listRoot,
  listRootTypedData,
  memoryLeafSource,
  parseList,
  resolveWriters,
  sync,
} from "../src";
import { ALPHA, BETA, FakeLog, InMemoryCheckpointStore, LOG, RecordingProofSource, fixture, fixtureLeaves } from "./fakes";

const CHAIN = BigInt(fixture.chainId);
const OTHER_CHAIN = 1n;
const TOMBSTONE = 1;
const COUNTER = 2;
const DISPUTE = 3;
const CONTEXTS: Context[] = ["recipient", "spender", "delegate", "incomingSender"];

const addr = (n: number): Address => getAddress(pad(toHex(n), { size: 20 }));
const [A, B, C] = [addr(0xa1), addr(0xb1), addr(0xc1)];
const [X, Y, Z] = [addr(0x5a), addr(0x5b), addr(0x5c)];
const UPSTREAM = keccak256(toHex("upstream.eth"));

const maintainer = privateKeyToAccount(generatePrivateKey());

type EntrySpec = {
  writer: Address;
  weight?: number;
  operator?: Hex;
  upstream?: Hex;
  fromBlock?: bigint;
  toBlock?: bigint;
  headPin?: Hex;
  categories?: bigint;
};
type ListSpec = { entries: EntrySpec[]; blocking?: boolean };

// Each writer gets its own operator unless the test says otherwise.
const entryDoc = (e: EntrySpec) => ({
  writer: e.writer,
  weight: e.weight ?? 1,
  operator: e.operator ?? keccak256(e.writer),
  upstream: e.upstream ?? zeroHash,
  fromBlock: String(e.fromBlock ?? 0n),
  toBlock: String(e.toBlock ?? 0n),
  headPin: e.headPin ?? zeroHash,
  categories: toHex(e.categories ?? 1n), // bit 0: all of 1 to 127
  snapshotURI: "",
});

/** Signs a document and passes it through the real `acceptList`. */
async function accept(kind: ListKind, body: object): Promise<VerifiedList> {
  const document = { log: LOG, chainId: String(CHAIN), maintainer: maintainer.address, version: 1, ...body };
  const list = parseList(kind, document);
  const root = listRoot(list);
  const signature = await maintainer.signTypedData(listRootTypedData(list, root));
  const record = encodeListRecord({ root, version: 1n, signature, listURI: "https://example.test/list.json" });
  const out = await acceptList({ kind, log: LOG, chainId: CHAIN, fetched: { record, document } });
  if (out.status !== "accepted") throw new Error(`list not accepted: ${out.status}`);
  return out.list;
}

/**
 * Accepts the lists, syncs their writers with the real `sync` against a proof of `leaves`, and
 * returns an evaluator over that one sync result. `served` is what the leaf source hands out.
 */
async function setup(leaves: readonly AppendedLeaf[], lists: ListSpec[], opts: { safelist?: Address[]; served?: AppendedLeaf[] } = {}) {
  const applied = await Promise.all(
    lists.map(async l => ({ list: await accept("list", { entries: l.entries.map(entryDoc) }), blocking: l.blocking ?? false })),
  );
  const resolved = resolveWriters(applied.map(a => ({ status: "accepted" as const, list: a.list })));
  const writers = resolved.status === "ok" ? resolved.writers.map(writer => ({ writer })) : [];
  const s = await sync({
    log: LOG,
    writers,
    proofs: new RecordingProofSource(leaves.at(-1)?.blockNumber ?? 1n, true, leaves),
    leaves: memoryLeafSource(opts.served ?? leaves),
    checkpoints: new InMemoryCheckpointStore(),
  });
  const safelists = opts.safelist ? [await accept("safelist", { subjects: opts.safelist })] : [];
  return (subject: Address, context: Context = "recipient", extra: Partial<EvaluateInput> = {}) =>
    evaluate({ subject, context, sync: s, lists: applied, safelists, logChainId: CHAIN, ...extra });
}

const heavy = (writer: Address, more: Partial<EntrySpec> = {}): ListSpec => ({ entries: [{ writer, weight: 255, ...more }], blocking: true });

describe("ERC Test Cases", () => {
  it("Test Case 10: two entries sharing an operator count as one writer; different operators and upstreams count as two", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: X });
    const shared = await setup(log.leaves, [{ entries: [{ writer: A, operator: UPSTREAM }, { writer: B, operator: UPSTREAM }] }]);
    expect(shared(X).verdict).toBe("warn");
    expect(shared(X).findings).toHaveLength(2);
    const independent = await setup(log.leaves, [{ entries: [{ writer: A }, { writer: B }] }]);
    expect(independent(X).verdict).toBe("block");
  });

  it("Test Case 11: a TOMBSTONE referencing a leaf from a different writer is ignored", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X });
    log.append(B, { subject: X, op: TOMBSTONE, refLeaf: flag.leafHash });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A, weight: 255 }, { writer: B }], blocking: true }]);
    expect(ev(X).verdict).toBe("block");
    expect(ev(X).findings.map(f => f.leaf.leafHash)).toEqual([flag.leafHash]);
  });

  it("Test Case 12: a recomputed head that differs from the proven head gives unavailable, never clean, for every subject of that writer", async () => {
    const lists = [{ entries: [{ writer: ALPHA, weight: 255 }, { writer: BETA, weight: 255 }], blocking: true }];
    const subjects = [...new Set(fixtureLeaves.filter(l => l.writer === ALPHA && l.leaf.op === 0).map(l => l.leaf.subject))];
    const honest = await setup(fixtureLeaves, lists);
    // The same subjects do get verdicts from honest data, so unavailable below is the lie's doing.
    expect(subjects.some(s => CONTEXTS.some(c => honest(s, c).verdict === "block"))).toBe(true);

    const lying = await setup(fixtureLeaves, lists, { served: fixtureLeaves.filter(l => !(l.writer === ALPHA && l.writerSeq === 2n)) });
    for (const s of subjects)
      for (const c of CONTEXTS) {
        const r = lying(s, c);
        expect(r.verdict, `${s} as ${c}`).toBe("unavailable");
        expect(r.unavailable).toEqual([ALPHA]);
      }
  });
});

describe("policy, one test per rule", () => {
  it("one listed writer gives warn, naming the writer, category, evidence, and list", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X, category: 3 });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A }] }]);
    const r = ev(X);
    expect(r.verdict).toBe("warn");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ writer: A, category: 3, evidence: flag.leaf.evidence, weight: 1 });
    expect(r.findings[0]!.list.root).toBe(r.lists[0]!.list.root);
  });

  it("two independent writers give block", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: X, category: 7 });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A }, { writer: B }] }]);
    expect(ev(X).verdict).toBe("block");
  });

  it("two writers sharing a non-zero upstream give warn", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: X });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A, upstream: UPSTREAM }, { writer: B, upstream: UPSTREAM }] }]);
    expect(ev(X).verdict).toBe("warn");
  });

  it("weight 255 gives block in a blocking list and warn in a non-blocking one", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    expect((await setup(log.leaves, [heavy(A)]))(X).verdict).toBe("block");
    expect((await setup(log.leaves, [{ ...heavy(A), blocking: false }]))(X).verdict).toBe("warn");
  });

  it("a same-writer tombstone clears the flag", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X });
    log.append(A, { subject: X, op: TOMBSTONE, refLeaf: flag.leafHash });
    const r = (await setup(log.leaves, [heavy(A)]))(X);
    expect(r.verdict).toBe("clean");
    expect(r.findings).toEqual([]);
  });

  it("a different-writer tombstone does not take a writer out of the independent count", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X });
    log.append(B, { subject: X });
    log.append(C, { subject: X, op: TOMBSTONE, refLeaf: flag.leafHash });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A }, { writer: B }, { writer: C }] }]);
    expect(ev(X).verdict).toBe("block");
  });

  it("an independent counter reduces two writers to one; a counter from the flagger's own operator does not", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X });
    log.append(B, { subject: X });
    const counter = log.append(C, { subject: X, op: COUNTER, refLeaf: flag.leafHash });
    const independent = await setup(log.leaves, [{ entries: [{ writer: A }, { writer: B }, { writer: C }] }]);
    const r = independent(X);
    expect(r.verdict).toBe("warn");
    expect(r.findings.find(f => f.writer === A)!.counters.map(c => c.leafHash)).toEqual([counter.leafHash]);
    const op = keccak256(toHex("a.eth"));
    const sameOperator = await setup(log.leaves, [{ entries: [{ writer: A, operator: op }, { writer: B }, { writer: C, operator: op }] }]);
    expect(sameOperator(X).verdict).toBe("block");
  });

  it("a dispute does not change the verdict and is shown", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    const lists = [{ entries: [{ writer: A, weight: 255 }, { writer: X, weight: 0 }], blocking: true }];
    const before = (await setup(log.leaves, lists))(X);
    const dispute = log.append(X, { subject: X, op: DISPUTE });
    const after = (await setup(log.leaves, lists))(X);
    expect(before.verdict).toBe("block");
    expect(after.verdict).toBe("block");
    expect(before.disputes).toEqual([]);
    expect(after.disputes.map(d => d.leafHash)).toEqual([dispute.leafHash]);
  });

  it("a safelisted subject caps at warn", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    const r = (await setup(log.leaves, [heavy(A)], { safelist: [X] }))(X);
    expect(r.verdict).toBe("warn");
    expect(r.lists[0]!.verdict).toBe("block");
    expect(r.safelistedBy).toHaveLength(1);
  });

  it("a noisy category is ignored without its bit, even with bit 0, and counted with it", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X, category: 200 });
    expect((await setup(log.leaves, [heavy(A, { categories: 1n })]))(X).verdict).toBe("clean");
    expect((await setup(log.leaves, [heavy(A, { categories: 1n << 200n })]))(X).verdict).toBe("block");
  });

  it("chainId = 0 in category 3 applies only on the log's chain, and in category 8 on every chain", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X, category: 3, chainId: 0n });
    log.append(A, { subject: Y, category: 8, chainId: 0n });
    const ev = await setup(log.leaves, [heavy(A)]);
    expect(ev(X, "recipient").verdict).toBe("block");
    expect(ev(X, "recipient", { chainId: OTHER_CHAIN }).verdict).toBe("clean");
    expect(ev(Y, "incomingSender").verdict).toBe("block");
    expect(ev(Y, "incomingSender", { chainId: OTHER_CHAIN }).verdict).toBe("block");
  });

  it("block range and head pin exclude leaves outside the range", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X }, 100n);
    const middle = log.append(A, { subject: Y }, 105n);
    log.append(A, { subject: Z }, 110n);
    const ranged = await setup(log.leaves, [{ entries: [{ writer: A, fromBlock: 104n, toBlock: 106n }] }]);
    expect([X, Y, Z].map(s => ranged(s).verdict)).toEqual(["clean", "warn", "clean"]);
    const pinned = await setup(log.leaves, [{ entries: [{ writer: A, headPin: middle.writerHead }] }]);
    expect([X, Y, Z].map(s => pinned(s).verdict)).toEqual(["warn", "warn", "clean"]);
  });

  it("a head pin that matches no head ignores the entry", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: Y });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A, weight: 255, headPin: keccak256("0x01") }, { writer: B }], blocking: true }]);
    expect(ev(X).verdict).toBe("clean");
    expect(ev(Y).verdict).toBe("warn");
    // With only the ignored entry there is no resolvable writer: unavailable, never clean.
    const only = await setup(log.leaves, [heavy(A, { headPin: keccak256("0x01") })]);
    expect(only(Z).verdict).toBe("unavailable");
  });

  it("escalation is OR across lists", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: X });
    const op = keccak256(toHex("one.eth"));
    const ev = await setup(log.leaves, [
      { entries: [{ writer: A, operator: op }, { writer: B, operator: op }] },
      { entries: [{ writer: A }, { writer: B }] },
    ]);
    const r = ev(X);
    expect(r.lists.map(l => l.verdict)).toEqual(["warn", "block"]);
    expect(r.verdict).toBe("block");
  });
});

describe("category 8", () => {
  it("two independent writers give warn as recipient and block as incoming sender", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X, category: 8 });
    log.append(B, { subject: X, category: 8 });
    const ev = await setup(log.leaves, [{ entries: [{ writer: A }, { writer: B }] }]);
    expect(ev(X, "recipient").verdict).toBe("warn");
    expect(ev(X, "recipient").findings).toHaveLength(2);
    expect(ev(X, "incomingSender").verdict).toBe("block");
  });
});

describe("context", () => {
  it("the same flagged subject gets the verdict only in contexts its category applies to, clean otherwise", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X, category: 4 }); // malicious delegate
    log.append(A, { subject: Y, category: 5 }); // malicious token
    log.append(A, { subject: Z, category: 7 }); // drainer spender
    const ev = await setup(log.leaves, [heavy(A)]);
    const row = (s: Address) => CONTEXTS.map(c => ev(s, c).verdict);
    expect(row(X)).toEqual(["clean", "clean", "block", "clean"]);
    expect(row(Y)).toEqual(["clean", "clean", "clean", "block"]);
    expect(row(Z)).toEqual(["block", "block", "clean", "clean"]);
  });
});

describe("category 4 self-check", () => {
  it("own code 0xef0100 followed by a flagged delegate yields the delegate's verdict", async () => {
    const log = new FakeLog();
    const flag = log.append(A, { subject: X, category: 4 });
    log.append(A, { subject: Y, category: 3 });
    const ev = await setup(log.leaves, [heavy(A)]);
    const designator = (d: Address) => concat(["0xef0100", d]);

    const r = ev(Z, "recipient", { ownCode: designator(X) });
    expect(r.verdict).toBe("block");
    expect(r.findings).toEqual([]);
    expect(r.ownDelegate).toMatchObject({ subject: X, context: "delegate", verdict: "block" });
    expect(r.ownDelegate!.findings[0]!.leaf.leafHash).toBe(flag.leafHash);

    expect(ev(Z, "recipient").verdict).toBe("clean");
    expect(ev(Z, "recipient", { ownCode: "0x6080604052" }).verdict).toBe("clean");
    // Only category 4 applies to the delegate.
    expect(ev(Z, "recipient", { ownCode: designator(Y) }).verdict).toBe("clean");
  });
});

describe("clean only when every pinned writer synced", () => {
  it("an unflagged subject is clean with every writer synced, unavailable otherwise, and a reached warn names the missing writer", async () => {
    const log = new FakeLog();
    log.append(A, { subject: X });
    log.append(B, { subject: Y });
    const lists = [{ entries: [{ writer: A }, { writer: B }] }];

    const honest = await setup(log.leaves, lists);
    expect(honest(Z)).toMatchObject({ verdict: "clean", unavailable: [] });

    const lying = await setup(log.leaves, lists, { served: log.leaves.filter(l => l.writer !== B) });
    expect(lying(Z)).toMatchObject({ verdict: "unavailable", unavailable: [B], findings: [] });
    expect(lying(Y).verdict).toBe("unavailable");
    expect(lying(X)).toMatchObject({ verdict: "warn", unavailable: [B] });
    expect(lying(X).findings[0]).toMatchObject({ writer: A, category: 3 });
  });

  it("zero pinned writers is unavailable", async () => {
    const ev = await setup([], [{ entries: [] }]);
    expect(ev(X).verdict).toBe("unavailable");
  });
});
