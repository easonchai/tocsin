// In-memory fakes for the three injected interfaces, plus the Foundry parity fixture as typed leaves.
import { type Address, type Hex, getAddress, numberToHex, zeroHash } from "viem";
import fixture from "../../foundry/fixtures/parity.json";
import {
  type AppendedLeaf,
  type CheckpointStore,
  type LeafSource,
  type ProofSource,
  type ProvenBlock,
  type WriterCheckpoint,
  writerHeadSlot,
  writerSeqSlot,
} from "../src";

export { fixture };
export const LOG = getAddress(fixture.log);
export const ALPHA = getAddress(fixture.writers[0]!.address);
export const BETA = getAddress(fixture.writers[1]!.address);
export const LAST_BLOCK = BigInt(fixture.leaves.at(-1)!.blockNumber);

/** Fixture leaves as the event plus block number, with the fixture's hashes as the source's claimed values. */
export const fixtureLeaves: AppendedLeaf[] = fixture.leaves.map((l) => ({
  writer: getAddress(l.writer),
  writerSeq: BigInt(l.writerSeq),
  globalSeq: BigInt(l.globalSeq),
  blockNumber: BigInt(l.blockNumber),
  leafHash: l.leafHash as Hex,
  writerHead: l.writerHeadAfter as Hex,
  globalHead: l.globalHeadAfter as Hex,
  leaf: {
    chainId: BigInt(l.leaf.chainId),
    subject: getAddress(l.leaf.subject),
    category: Number(l.leaf.category),
    op: Number(l.leaf.op),
    evidence: l.leaf.evidence as Hex,
    seenBlock: BigInt(l.leaf.seenBlock),
    refLeaf: l.leaf.refLeaf as Hex,
  },
}));

/** Each writer's head and sequence on chain at `block`, read off the fixture. */
export function stateAt(block: bigint): Map<Address, { seq: bigint; head: Hex }> {
  const state = new Map<Address, { seq: bigint; head: Hex }>();
  for (const l of fixtureLeaves) if (l.blockNumber <= block) state.set(l.writer, { seq: l.writerSeq, head: l.writerHead });
  return state;
}

/** A proof source holding the log's storage at one block. Records every slot list it was asked for. */
export class RecordingProofSource implements ProofSource {
  readonly calls: (readonly Hex[])[] = [];
  readonly block: ProvenBlock;
  private readonly storage = new Map<Hex, Hex>();

  constructor(number: bigint, finalized: boolean) {
    this.block = { number, hash: numberToHex(number, { size: 32 }), stateRoot: zeroHash, finalized };
    for (const [w, { seq, head }] of stateAt(number)) {
      this.storage.set(writerHeadSlot(w), head);
      this.storage.set(writerSeqSlot(w), numberToHex(seq));
    }
  }

  async getProof(_log: Address, slots: readonly Hex[]) {
    this.calls.push(slots);
    return { block: this.block, values: slots.map((s) => this.storage.get(s) ?? "0x0") as Hex[] };
  }
}

/** Wraps a leaf source and records each request. */
export class RecordingLeafSource implements LeafSource {
  readonly leafCalls: { writer: Address; fromSeq: bigint; toBlock: bigint }[] = [];
  readonly anchorCalls: { writer: Address; seq: bigint }[] = [];
  constructor(private readonly inner: LeafSource) {}

  getLeaves(writer: Address, fromSeq: bigint, toBlock: bigint) {
    this.leafCalls.push({ writer, fromSeq, toBlock });
    return this.inner.getLeaves(writer, fromSeq, toBlock);
  }

  getAnchorHead(writer: Address, seq: bigint) {
    this.anchorCalls.push({ writer, seq });
    return this.inner.getAnchorHead(writer, seq);
  }
}

export class InMemoryCheckpointStore implements CheckpointStore {
  readonly entries = new Map<string, WriterCheckpoint>();
  async get(key: string) {
    return this.entries.get(key);
  }
  async set(key: string, value: WriterCheckpoint) {
    this.entries.set(key, value);
  }
}
