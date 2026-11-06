import { type Account, type Address, type Hash, type Hex, getAddress, keccak256, slice, toHex, zeroHash } from "viem";
import { OP, threatFlagLogAbi } from "./abi.js";
import { type Leaf, signBatch } from "./batch.js";
import type { Sender, Target } from "./env.js";
import { relay } from "./relayer.js";

// Same derivation as seed.ts and seed-curators.ts, so a label names the same subject everywhere.
export const syntheticSubject = (label: string): Address => getAddress(slice(keccak256(toHex(`tocsin-demo/${label}`)), 12));
export const syntheticEvidence = (label: string): Hex => keccak256(toHex(`tocsin-demo/evidence/${label}`));

/**
 * One writer's extra flags. `evidencePrefix` matches the seeder that made the writer's first leaves:
 * "" for seed.ts (manual writer), "<name>/" for seed-curators.ts.
 */
export type AppendBatch = { account: Account; evidencePrefix: string; flags: readonly (readonly [label: string, category: number])[] };

export type AppendResult = { hash: Hash; writer: Address; fromSeq: bigint; toSeq: bigint; leaves: Leaf[] };

const seqOf = (t: Target, w: Address, blockNumber?: bigint) =>
  t.public.readContract({ address: t.log, abi: threatFlagLogAbi, functionName: "writerSeq", args: [w], ...(blockNumber === undefined ? {} : { blockNumber }) });

/**
 * Signs `batch` as its writer and relays it, for a writer that may already have leaves. The log assigns
 * sequence numbers, so the batch continues from the writer's current onchain sequence; this checks the
 * sequence moved by exactly the leaf count and throws otherwise.
 */
export async function appendFlags(target: Target, relayer: Sender, batch: AppendBatch): Promise<AppendResult> {
  const writer = batch.account.address;
  const [fromSeq, nonce, head] = await Promise.all([
    seqOf(target, writer),
    target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [writer] }),
    target.public.getBlock({ blockTag: "latest" }),
  ]);
  const leaves: Leaf[] = batch.flags.map(([label, category]) => ({
    chainId: BigInt(target.chainId),
    subject: syntheticSubject(label),
    category,
    op: OP.FLAG,
    evidence: syntheticEvidence(`${batch.evidencePrefix}${label}`),
    seenBlock: head.number,
    refLeaf: zeroHash,
  }));
  const signed = await signBatch(batch.account, { log: target.log, chainId: target.chainId, leaves, deadline: head.timestamp + 3600n, nonce });
  const r = await relay(signed, target, relayer);
  if (r.status !== "sent") throw new Error(`relayer dropped the batch for ${writer}: ${r.reason}`);
  // At the receipt's block: a load-balanced RPC can answer "latest" from a node that has not seen it yet.
  const toSeq = await seqOf(target, writer, r.blockNumber);
  if (toSeq !== fromSeq + BigInt(leaves.length)) {
    throw new Error(`writer ${writer}: writerSeq ${fromSeq} -> ${toSeq} after ${leaves.length} leaves in ${r.hash}`);
  }
  return { hash: r.hash, writer, fromSeq, toSeq, leaves };
}
