import type { Address, Hex } from "viem";

/** The ERC's `Leaf` struct. */
export type Leaf = {
  chainId: bigint;
  subject: Address;
  category: number;
  op: number;
  evidence: Hex;
  seenBlock: bigint;
  refLeaf: Hex;
};

/**
 * One `Appended` event plus the block it was appended in. Every field comes from an untrusted
 * source. `leafHash`, `writerHead` and `globalHead` are the event's claimed values: sync uses them
 * only to locate the first diverging sequence, never to accept data.
 */
export type AppendedLeaf = {
  writer: Address;
  writerSeq: bigint;
  globalSeq: bigint;
  blockNumber: bigint;
  leafHash: Hex;
  writerHead: Hex;
  globalHead: Hex;
  leaf: Leaf;
};

/** A leaf inside a suffix that landed on a proven head. `leafHash` and `writerHead` are recomputed. */
export type VerifiedLeaf = Omit<AppendedLeaf, "globalHead">;

/** A block the proof source verified (for example through a consensus light client). */
export type ProvenBlock = {
  number: bigint;
  hash: Hex;
  stateRoot: Hex;
  finalized: boolean;
};

export type ProofSource = {
  /**
   * Storage values of `log` at `slots`, proven against the returned block's state root, in the
   * same order as `slots`. Sync makes exactly one call per run.
   */
  getProof(log: Address, slots: readonly Hex[]): Promise<{ block: ProvenBlock; values: readonly Hex[] }>;
};

export type LeafSource = {
  /** `Appended` events of `writer` with `writerSeq > fromSeq` and `blockNumber <= toBlock`, in writer-sequence order. */
  getLeaves(writer: Address, fromSeq: bigint, toBlock: bigint): Promise<readonly AppendedLeaf[]>;
  /** The writer's head right after leaf `seq` (the anchor for leaves after it). Untrusted. */
  getAnchorHead(writer: Address, seq: bigint): Promise<Hex>;
};

/** What sync persists per writer, only for finalized blocks. */
export type WriterCheckpoint = {
  block: bigint;
  seq: bigint;
  head: Hex;
  leaves: readonly VerifiedLeaf[];
};

/** Key-value store. Values hold bigints, so back it with structured clone (IndexedDB) or memory, not JSON. */
export type CheckpointStore = {
  get(key: string): Promise<WriterCheckpoint | undefined>;
  set(key: string, value: WriterCheckpoint): Promise<void>;
};

export type WriterPin = {
  writer: Address;
  /**
   * Start from the source's head after this sequence instead of the checkpoint, when it is past
   * the checkpoint (first sync, or a list's `fromBlock` or `headPin`). Default: the checkpoint.
   */
  anchorSeq?: bigint;
};

export type WriterSync =
  | { status: "synced"; writer: Address; seq: bigint; head: Hex; leaves: readonly VerifiedLeaf[] }
  | {
      status: "unavailable";
      writer: Address;
      /** Proven sequence and head the source failed to reach. */
      seq: bigint;
      head: Hex;
      /** First writer sequence whose data did not match, when the data got that far. */
      divergedAt?: bigint;
      /** Set when the leaf source threw instead of returning data. */
      error?: unknown;
    };

export type SyncResult = {
  block: ProvenBlock;
  /** Keyed by checksummed writer address. */
  writers: Record<Address, WriterSync>;
};
