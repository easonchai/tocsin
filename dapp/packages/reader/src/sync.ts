import { type Address, type Hex, getAddress, hexToBigInt, pad, zeroHash } from "viem";
import { foldHead, leafHash, writerHeadSlot, writerSeqSlot } from "./chain";
import type {
  AppendedLeaf,
  CheckpointStore,
  LeafSource,
  ProofSource,
  SyncResult,
  VerifiedLeaf,
  WriterCheckpoint,
  WriterPin,
  WriterSync,
} from "./types";

export type SyncOptions = {
  /** The log contract address. */
  log: Address;
  /** The union of writers across every pinned list. Duplicates are merged, keeping the lowest `anchorSeq`. */
  writers: readonly WriterPin[];
  proofs: ProofSource;
  leaves: LeafSource;
  checkpoints: CheckpointStore;
};

type Anchor = { seq: bigint; head: Hex; leaves: readonly VerifiedLeaf[] };
type Attempt = { ok: true; leaves: VerifiedLeaf[] } | { ok: false; divergedAt?: bigint; error?: unknown };

const GENESIS: Anchor = { seq: 0n, head: zeroHash, leaves: [] };

/** Checkpoint key. The log address is the same on every chain, so a multi-chain host keeps one store per chain. */
export const checkpointKey = (log: Address, writer: Address): string =>
  `${getAddress(log)}:${getAddress(writer)}`;

/**
 * ERC Light-client read procedure, steps 1 to 4. Proves every pinned writer's head and sequence in
 * one proof request, fetches each writer's suffix from its anchor up to the proven block, recomputes
 * the chain, and on a mismatch rewinds to the last finalized checkpoint and retries once before
 * marking the writer unavailable. Writes checkpoints only when the proven block is finalized.
 * Throws if the proof source fails, since then no writer can be checked.
 */
export async function sync(opts: SyncOptions): Promise<SyncResult> {
  const pins = new Map<Address, bigint | undefined>();
  for (const { writer, anchorSeq } of opts.writers) {
    const w = getAddress(writer);
    const prev = pins.get(w);
    // No anchorSeq means "from the checkpoint", the earliest start, so it wins a merge.
    const merged =
      !pins.has(w) ? anchorSeq : prev === undefined || anchorSeq === undefined ? undefined : prev < anchorSeq ? prev : anchorSeq;
    pins.set(w, merged);
  }
  const writers = [...pins.keys()];

  const slots = writers.flatMap((w) => [writerHeadSlot(w), writerSeqSlot(w)]);
  let proof: Awaited<ReturnType<ProofSource["getProof"]>>;
  try {
    proof = await opts.proofs.getProof(opts.log, slots);
  } catch (error) {
    throw new Error(`proof request for ${writers.length} writers failed`, { cause: error });
  }
  const { block, values } = proof;
  if (values.length !== slots.length) {
    throw new Error(`proof source returned ${values.length} values for ${slots.length} slots`);
  }

  const results = await Promise.all(
    writers.map(async (writer, i): Promise<WriterSync> => {
      // eth_getProof may return minimal hex such as 0x0, so pad before comparing heads.
      const head = pad(values[2 * i].toLowerCase() as Hex, { size: 32 });
      const seq = hexToBigInt(values[2 * i + 1]);
      const key = checkpointKey(opts.log, writer);
      const checkpoint = await opts.checkpoints.get(key);
      const rewind: Anchor = checkpoint ?? GENESIS;
      const anchorSeq = pins.get(writer);

      const run = async (anchor: () => Promise<Anchor>): Promise<Attempt> => {
        try {
          const a = await anchor();
          const fetched = await opts.leaves.getLeaves(writer, a.seq, block.number);
          const r = verify(writer, a, fetched, seq, head, block.number);
          return r.ok ? { ok: true, leaves: [...a.leaves, ...r.leaves] } : r;
        } catch (error) {
          return { ok: false, error };
        }
      };

      const first =
        anchorSeq !== undefined && anchorSeq > rewind.seq
          ? run(async () => ({ seq: anchorSeq, head: await opts.leaves.getAnchorHead(writer, anchorSeq), leaves: [] }))
          : run(async () => rewind);
      let attempt = await first;
      if (!attempt.ok) attempt = await run(async () => rewind);

      if (!attempt.ok) {
        const { divergedAt, error } = attempt;
        return {
          status: "unavailable",
          writer,
          seq,
          head,
          ...(divergedAt !== undefined && { divergedAt }),
          ...(error !== undefined && { error }),
        };
      }
      const { leaves } = attempt;
      if (block.finalized) {
        const next: WriterCheckpoint = { block: block.number, seq, head, leaves };
        await opts.checkpoints.set(key, next);
      }
      return { status: "synced", writer, seq, head, leaves };
    }),
  );

  return { block, writers: Object.fromEntries(results.map((r) => [r.writer, r])) };
}

/**
 * Recompute one writer's chain from `anchor` and compare it with the proven head. On failure,
 * `divergedAt` is the first sequence that is missing, out of order, past the proven sequence, or
 * whose recomputed head differs from the head the source claimed; failing all of those (the
 * source's claimed heads agree with a wrong chain) it is the first sequence after the anchor.
 */
function verify(
  writer: Address,
  anchor: Anchor,
  fetched: readonly AppendedLeaf[],
  provenSeq: bigint,
  provenHead: Hex,
  provenBlock: bigint,
): Attempt {
  const out: VerifiedLeaf[] = [];
  let head = anchor.head.toLowerCase() as Hex;
  let seq = anchor.seq;
  let firstBadHead: bigint | undefined;
  for (const l of fetched) {
    if (l.blockNumber > provenBlock) continue; // past the toBlock bound
    seq += 1n;
    // A leaf past the proven sequence at or before the proven block cannot exist on chain: the source lied.
    if (getAddress(l.writer) !== writer || l.writerSeq !== seq || seq > provenSeq) return { ok: false, divergedAt: seq };
    const { globalHead: _, ...rest } = l;
    const lh = leafHash(l);
    head = foldHead(head, lh);
    if (firstBadHead === undefined && head !== l.writerHead.toLowerCase()) firstBadHead = seq;
    out.push({ ...rest, leafHash: lh, writerHead: head });
  }
  if (seq === provenSeq && head === provenHead) return { ok: true, leaves: out };
  return { ok: false, divergedAt: firstBadHead ?? (seq < provenSeq ? seq + 1n : anchor.seq + 1n) };
}
