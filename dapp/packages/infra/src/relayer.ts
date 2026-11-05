import { BaseError, ContractFunctionRevertedError, type Hash, isAddressEqual } from "viem";
import { threatFlagLogAbi } from "./abi.js";
import type { SignedBatch } from "./batch.js";
import type { Sender, Target } from "./env.js";

export type RelayResult =
  | { status: "sent"; hash: Hash; blockNumber: bigint; gasUsed: bigint; leaves: number }
  | { status: "dropped"; reason: string };

export type RelayOptions = {
  /** Seconds of headroom the deadline must have past the latest block, for the time the tx takes to land. */
  marginSeconds?: number;
  receiptTimeoutMs?: number;
};

/**
 * Submits a signed batch through `appendSigned`, paid by `relayer`.
 * Returns `dropped` without sending when the batch would revert: wrong log or chain, a deadline at or
 * inside the margin, a stale nonce, or a failed simulation (bad signature, bad leaf). RPC failures throw.
 */
export async function relay(
  batch: SignedBatch,
  target: Target,
  relayer: Sender,
  { marginSeconds = 30, receiptTimeoutMs = 180_000 }: RelayOptions = {},
): Promise<RelayResult> {
  if (batch.chainId !== target.chainId || !isAddressEqual(batch.log, target.log)) {
    return { status: "dropped", reason: `batch is for log ${batch.log} on chain ${batch.chainId}, relayer targets ${target.log} on ${target.chainId}` };
  }
  if (isAddressEqual(batch.writer, relayer.account.address)) {
    return { status: "dropped", reason: "writer and relayer are the same key; the writer key must not hold ETH" };
  }

  const head = await target.public.getBlock({ blockTag: "latest" });
  if (batch.deadline < head.timestamp + BigInt(marginSeconds)) {
    return { status: "dropped", reason: `deadline ${batch.deadline} passed or within ${marginSeconds}s of block timestamp ${head.timestamp}` };
  }

  const nonce = await target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [batch.writer] });
  if (nonce !== batch.nonce) return { status: "dropped", reason: `nonce ${batch.nonce} is not the writer's current nonce ${nonce}` };

  let request;
  try {
    ({ request } = await target.public.simulateContract({
      account: relayer.account,
      address: target.log,
      abi: threatFlagLogAbi,
      functionName: "appendSigned",
      args: [batch.writer, batch.leaves, batch.deadline, batch.nonce, batch.signature],
    }));
  } catch (err) {
    const revert = err instanceof BaseError ? err.walk((e) => e instanceof ContractFunctionRevertedError) : null;
    if (revert instanceof ContractFunctionRevertedError) {
      return { status: "dropped", reason: `simulation reverted: ${revert.reason ?? revert.shortMessage}` };
    }
    throw new Error("appendSigned simulation failed", { cause: err });
  }

  const hash = await relayer.writeContract(request);
  const receipt = await target.public.waitForTransactionReceipt({ hash, timeout: receiptTimeoutMs });
  if (receipt.status !== "success") throw new Error(`appendSigned ${hash} reverted on chain`);
  return { status: "sent", hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed, leaves: batch.leaves.length };
}
