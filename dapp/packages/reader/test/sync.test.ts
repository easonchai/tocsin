import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  parseAbiParameters,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  type AppendedLeaf,
  type LeafSource,
  type SyncResult,
  type WriterSync,
  foldHead,
  memoryLeafSource,
  snapshotLeafSource,
  sync,
  threatFlagLogAbi,
} from "../src";
import {
  ALPHA,
  BETA,
  InMemoryCheckpointStore,
  LAST_BLOCK,
  LOG,
  RecordingLeafSource,
  RecordingProofSource,
  fixture,
  fixtureLeaves,
} from "./fakes";

const BOTH = [{ writer: ALPHA }, { writer: BETA }];

function run(opts: {
  block?: bigint;
  finalized?: boolean;
  leaves?: LeafSource;
  checkpoints?: InMemoryCheckpointStore;
  writers?: { writer: Address; anchorSeq?: bigint }[];
}) {
  const proofs = new RecordingProofSource(opts.block ?? LAST_BLOCK, opts.finalized ?? true);
  const leaves = new RecordingLeafSource(opts.leaves ?? memoryLeafSource(fixtureLeaves));
  const checkpoints = opts.checkpoints ?? new InMemoryCheckpointStore();
  const result = sync({ log: LOG, writers: opts.writers ?? BOTH, proofs, leaves, checkpoints });
  return { result, proofs, leaves, checkpoints };
}

function synced(r: SyncResult, w: Address): Extract<WriterSync, { status: "synced" }> {
  const s = r.writers[w];
  if (s?.status !== "synced") throw new Error(`${w} is ${s?.status}`);
  return s;
}

const seqs = (s: { leaves: readonly { writerSeq: bigint }[] }) => s.leaves.map((l) => l.writerSeq);
const alphaAt = (seq: bigint) => fixtureLeaves.find((l) => l.writer === ALPHA && l.writerSeq === seq)!;

describe("hash parity with the Foundry fixture", () => {
  it("recomputes every leaf hash, writer head, and global head", async () => {
    // Blank the source's claimed hashes so every match has to come from recomputation.
    const blank = fixtureLeaves.map((l) => ({ ...l, leafHash: zeroHash, writerHead: zeroHash, globalHead: zeroHash }));
    const { result } = run({ leaves: memoryLeafSource(blank) });
    const r = await result;

    const verified = [...synced(r, ALPHA).leaves, ...synced(r, BETA).leaves].sort((a, b) =>
      Number(a.globalSeq - b.globalSeq),
    );
    expect(verified).toHaveLength(fixture.leaves.length);

    let globalHead: Hex = zeroHash;
    verified.forEach((v, i) => {
      const f = fixture.leaves[i]!;
      expect(v.globalSeq).toBe(BigInt(f.globalSeq));
      expect(v.leafHash).toBe(f.leafHash);
      expect(v.writerHead).toBe(f.writerHeadAfter);
      globalHead = foldHead(globalHead, v.leafHash);
      expect(globalHead).toBe(f.globalHeadAfter);
    });
    expect(globalHead).toBe(fixture.globalHead);
    for (const w of fixture.writers) {
      expect(synced(r, getAddress(w.address)).head).toBe(w.head);
      expect(synced(r, getAddress(w.address)).seq).toBe(BigInt(w.seq));
    }
  });
});

describe("proof request", () => {
  it("is one request covering only the pinned writers, at the ERC's slots", async () => {
    const lower = ALPHA.toLowerCase() as Address;
    const { result, proofs } = run({ writers: [{ writer: ALPHA }, { writer: lower }] });
    const r = await result;

    // Vectors from `cast index address <alpha> 2` and `... 3`.
    expect(proofs.calls).toEqual([
      [
        "0x3612a314215f4a307a2d25eb0b46065be1f34863b1e8b2740bbc580f420e54e7",
        "0x783ce7f64ddef74ba752ad570a56c08bcc30b17b93d1ba98c855a59117c5b06c",
      ],
    ]);
    expect(Object.keys(r.writers)).toEqual([ALPHA]);
    expect(synced(r, ALPHA).seq).toBe(7n);
  });
});

describe("lying leaf source", () => {
  const lies: [string, (ls: AppendedLeaf[]) => AppendedLeaf[], bigint][] = [
    ["drops one leaf", (ls) => ls.filter((l) => l !== alphaAt(3n)), 3n],
    [
      "alters one leaf",
      (ls) => ls.map((l) => (l === alphaAt(4n) ? { ...l, leaf: { ...l.leaf, subject: BETA } } : l)),
      4n,
    ],
    ["appends one past the proven sequence", (ls) => [...ls, { ...alphaAt(7n), writerSeq: 8n, globalSeq: 13n }], 8n],
    [
      "reorders two leaves",
      (ls) => ls.map((l) => (l === alphaAt(5n) ? alphaAt(6n) : l === alphaAt(6n) ? alphaAt(5n) : l)),
      5n,
    ],
  ];

  it.each(lies)("%s: unavailable at the first diverging sequence after one retry", async (_, lie, divergedAt) => {
    const { result, leaves, checkpoints } = run({ leaves: memoryLeafSource(lie(fixtureLeaves)) });
    const r = await result;

    const alpha = r.writers[ALPHA];
    expect(alpha).toEqual({ status: "unavailable", writer: ALPHA, seq: 7n, head: fixture.writers[0]!.head, divergedAt });
    expect(alpha).not.toHaveProperty("leaves");
    expect(leaves.leafCalls.filter((c) => c.writer === ALPHA)).toHaveLength(2);
    expect([...checkpoints.entries.keys()].some((k) => k.endsWith(ALPHA))).toBe(false);
    // The honest writer is unaffected.
    expect(synced(r, BETA).seq).toBe(5n);
  });

  it("a source that throws gives unavailable with the error, not a crash", async () => {
    const failing: LeafSource = {
      getLeaves: async () => {
        throw new Error("rpc down");
      },
      getAnchorHead: async () => zeroHash,
    };
    const r = await run({ leaves: failing }).result;
    expect(r.writers[ALPHA]).toMatchObject({ status: "unavailable", error: new Error("rpc down") });
  });
});

describe("anchors and checkpoints", () => {
  it("first sync from an untrusted anchor lands on the proven head and returns only the suffix", async () => {
    const { result, leaves } = run({ writers: [{ writer: ALPHA, anchorSeq: 3n }] });
    const alpha = synced(await result, ALPHA);
    expect(alpha.head).toBe(fixture.writers[0]!.head);
    expect(seqs(alpha)).toEqual([4n, 5n, 6n, 7n]);
    expect(leaves.anchorCalls).toEqual([{ writer: ALPHA, seq: 3n }]);
    expect(leaves.leafCalls).toEqual([{ writer: ALPHA, fromSeq: 3n, toBlock: LAST_BLOCK }]);
  });

  it("second sync starts from the checkpoint and fetches only the suffix", async () => {
    const checkpoints = new InMemoryCheckpointStore();
    await run({ block: 9000004n, checkpoints }).result;

    const { result, leaves } = run({ checkpoints });
    const r = await result;
    expect(leaves.leafCalls).toEqual([
      { writer: ALPHA, fromSeq: 6n, toBlock: LAST_BLOCK },
      { writer: BETA, fromSeq: 2n, toBlock: LAST_BLOCK },
    ]);
    expect(seqs(synced(r, ALPHA))).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect(seqs(synced(r, BETA))).toEqual([1n, 2n, 3n, 4n, 5n]);
  });

  it("writes a checkpoint only when the proven block is finalized", async () => {
    const checkpoints = new InMemoryCheckpointStore();
    await run({ block: 9000004n, finalized: false, checkpoints }).result;
    expect(checkpoints.entries.size).toBe(0);

    await run({ block: 9000004n, finalized: true, checkpoints }).result;
    expect([...checkpoints.entries.values()].map((c) => [c.block, c.seq])).toEqual([
      [9000004n, 6n],
      [9000004n, 2n],
    ]);
  });

  it("a mismatch after a checkpoint rewinds to that checkpoint", async () => {
    const checkpoints = new InMemoryCheckpointStore();
    await run({ block: 9000001n, checkpoints, writers: [{ writer: ALPHA }] }).result;

    const honest = memoryLeafSource(fixtureLeaves);
    const lyingAnchor: LeafSource = { ...honest, getAnchorHead: async () => `0x${"ab".repeat(32)}` };
    const { result, leaves } = run({ checkpoints, leaves: lyingAnchor, writers: [{ writer: ALPHA, anchorSeq: 5n }] });
    const alpha = synced(await result, ALPHA);

    expect(leaves.leafCalls.map((c) => c.fromSeq)).toEqual([5n, 3n]);
    expect(seqs(alpha)).toEqual([1n, 2n, 3n, 4n, 5n, 6n, 7n]);
    expect(alpha.head).toBe(fixture.writers[0]!.head);
  });
});

describe("snapshot leaf source", () => {
  const dataParams = parseAbiParameters([
    "uint64 globalSeq, bytes32 leafHash, bytes32 writerHead, bytes32 globalHead, Leaf leaf",
    "struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }",
  ]);
  const mirrorFile = (ls: AppendedLeaf[]) =>
    JSON.stringify(
      ls.map((l) => ({
        blockNumber: l.blockNumber.toString(),
        topics: encodeEventTopics({
          abi: threatFlagLogAbi,
          eventName: "Appended",
          args: { writer: l.writer, writerSeq: l.writerSeq },
        }),
        data: encodeAbiParameters(dataParams, [l.globalSeq, l.leafHash, l.writerHead, l.globalHead, l.leaf]),
      })),
    );
  const files = [ALPHA, BETA].map((w) => fixtureLeaves.filter((l) => l.writer === w));

  it("a source built from mirror-format files syncs to the proven head", async () => {
    const r = await run({ leaves: snapshotLeafSource(...files.map(mirrorFile)) }).result;
    expect(synced(r, ALPHA).head).toBe(fixture.writers[0]!.head);
    expect(synced(r, BETA).head).toBe(fixture.writers[1]!.head);
  });

  it("the same file with one leaf dropped gives unavailable", async () => {
    const alphaMinusOne = files[0]!.filter((l) => l.writerSeq !== 2n);
    const r = await run({ leaves: snapshotLeafSource(mirrorFile(alphaMinusOne), mirrorFile(files[1]!)) }).result;
    expect(r.writers[ALPHA]).toMatchObject({ status: "unavailable", divergedAt: 2n });
    expect(synced(r, BETA).seq).toBe(5n);
  });

  it("rejects a malformed file", () => {
    expect(() => snapshotLeafSource('[{"blockNumber":"1","topics":[],"data":"0x"}]')).toThrow(/entry 0 is malformed/);
  });
});
