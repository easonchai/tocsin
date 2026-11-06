// Leaf and proof sources over a plain JSON-RPC endpoint. Pure TypeScript with no Node or DOM
// globals, so the Snap and wallet hosts reuse it with their own `request` function.
import { type Address, type Hex, decodeEventLog, encodeEventTopics, hexToBigInt, isHex, numberToHex, zeroHash } from "viem";
import { threatFlagLogAbi } from "./chain";
import type { AppendedLeaf, LeafSource, ProofSource } from "./types";

/** An EIP-1193 `request`: a wallet provider, a Snap's `ethereum.request`, a viem transport, or a fetch wrapper. */
export type RpcRequest = (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;

/** One `Appended` log as `eth_getLogs` returned it, reduced to the mirror format's fields. */
export type RawAppendedLog = { blockNumber: bigint; topics: [Hex, ...Hex[]]; data: Hex };

export type LogScan = {
  request: RpcRequest;
  /** The log contract address. */
  log: Address;
  writer: Address;
  /** Only the log of this writer sequence (topic filter on the indexed `writerSeq`). */
  writerSeq?: bigint;
  fromBlock: bigint;
  toBlock: bigint;
  /** Blocks per `eth_getLogs` call. Public RPCs cap the span; default 10,000. */
  maxBlockRange?: bigint;
};

const DEFAULT_RANGE = 10_000n;

/**
 * Yields the writer's `Appended` logs one `eth_getLogs` chunk at a time, oldest first. Throws on a
 * response that is not a log array; nothing in a well-formed one is trusted.
 */
async function* scan(o: LogScan): AsyncGenerator<RawAppendedLog[]> {
  const topics = encodeEventTopics({
    abi: threatFlagLogAbi,
    eventName: "Appended",
    args: o.writerSeq === undefined ? { writer: o.writer } : { writer: o.writer, writerSeq: o.writerSeq },
  });
  const step = o.maxBlockRange ?? DEFAULT_RANGE;
  if (step < 1n) throw new Error("maxBlockRange must be at least 1");
  for (let from = o.fromBlock; from <= o.toBlock; from += step) {
    const to = from + step - 1n < o.toBlock ? from + step - 1n : o.toBlock;
    const res = await o.request({
      method: "eth_getLogs",
      params: [{ address: o.log, topics, fromBlock: numberToHex(from), toBlock: numberToHex(to) }],
    });
    yield parseLogs(res, from, to);
  }
}

/** Every `Appended` log of one writer between two blocks, in chain order. Used by the leaf source and the mirror writer. */
export async function getAppendedLogs(o: LogScan): Promise<RawAppendedLog[]> {
  const out: RawAppendedLog[] = [];
  for await (const chunk of scan(o)) out.push(...chunk);
  return out;
}

function parseLogs(res: unknown, from: bigint, to: bigint): RawAppendedLog[] {
  if (!Array.isArray(res)) throw new Error(`eth_getLogs ${from}..${to} did not return an array`);
  return res.flatMap((entry: unknown, i): RawAppendedLog[] => {
    // SAFETY: only read through optional access; every field is checked below before use.
    const e = entry as { blockNumber?: unknown; topics?: unknown; data?: unknown; removed?: unknown } | null;
    if (e?.removed === true) return []; // reorged out
    if (!isHex(e?.blockNumber) || !Array.isArray(e.topics) || e.topics.length === 0 || !e.topics.every((t) => isHex(t)) || !isHex(e.data)) {
      throw new Error(`eth_getLogs ${from}..${to}: log ${i} is malformed`);
    }
    // SAFETY: checked above to be a non-empty array of hex strings.
    return [{ blockNumber: hexToBigInt(e.blockNumber), topics: e.topics as [Hex, ...Hex[]], data: e.data }];
  });
}

/** Decodes a raw log into the reader's leaf type. Throws if it is not an `Appended` log. */
export function decodeAppended(raw: RawAppendedLog): AppendedLeaf {
  const { args } = decodeEventLog({ abi: threatFlagLogAbi, eventName: "Appended", topics: raw.topics, data: raw.data });
  return { ...args, blockNumber: raw.blockNumber };
}

export type RpcLeafSourceOptions = {
  request: RpcRequest;
  log: Address;
  /** First block to scan when a writer has no anchor yet: the log's deployment block. Default 0. */
  fromBlock?: bigint;
  maxBlockRange?: bigint;
};

/**
 * A leaf source over `eth_getLogs`, filtered on the writer topic (ERC, Light-client read procedure,
 * step 3). Each leaf's block number is the log's `blockNumber`, the block of the receipt that
 * emitted it. A suffix after sequence `n > 0` is scanned from the block of leaf `n`, found with an
 * exact `writerSeq` topic filter, so a sync from a checkpoint or anchor skips older history.
 * Everything it returns is untrusted; sync verifies it against the proven head.
 *
 * shortcut: the anchor-block lookup is not cached, so it scans from `fromBlock` on every sync; cache
 * it per writer and sequence if a long-lived host syncs a writer with deep history often.
 */
export function rpcLeafSource(o: RpcLeafSourceOptions): LeafSource {
  const base = { request: o.request, log: o.log, ...(o.maxBlockRange !== undefined && { maxBlockRange: o.maxBlockRange }) };
  const fromBlock = o.fromBlock ?? 0n;

  async function leafAt(writer: Address, seq: bigint): Promise<AppendedLeaf> {
    const latest = await blockNumber(o.request);
    for await (const chunk of scan({ ...base, writer, writerSeq: seq, fromBlock, toBlock: latest })) {
      const raw = chunk[0];
      if (raw) return decodeAppended(raw);
    }
    throw new Error(`no Appended log for writer ${writer} sequence ${seq} since block ${fromBlock}`);
  }

  return {
    async getLeaves(writer, fromSeq, toBlock) {
      const start = fromSeq === 0n ? fromBlock : (await leafAt(writer, fromSeq)).blockNumber;
      const logs = await getAppendedLogs({ ...base, writer, fromBlock: start, toBlock });
      return logs.map(decodeAppended).filter((l) => l.writerSeq > fromSeq);
    },
    async getAnchorHead(writer, seq) {
      return seq === 0n ? zeroHash : (await leafAt(writer, seq)).writerHead;
    },
  };
}

async function blockNumber(request: RpcRequest): Promise<bigint> {
  const res = await request({ method: "eth_blockNumber" });
  if (!isHex(res)) throw new Error("eth_blockNumber did not return a hex quantity");
  return hexToBigInt(res);
}

async function getBlock(request: RpcRequest, tag: "latest" | "finalized"): Promise<{ number: bigint; hash: Hex; stateRoot: Hex }> {
  const res = await request({ method: "eth_getBlockByNumber", params: [tag, false] });
  // SAFETY: only read through optional access; every field is checked below before use.
  const b = res as { number?: unknown; hash?: unknown; stateRoot?: unknown } | null;
  if (!isHex(b?.number) || !isHex(b.hash) || !isHex(b.stateRoot)) throw new Error(`eth_getBlockByNumber(${tag}) returned no usable header`);
  return { number: hexToBigInt(b.number), hash: b.hash, stateRoot: b.stateRoot };
}

/**
 * A proof source over `eth_getProof` at the RPC's latest block. Every block it returns carries
 * `unverified: true`. `finalized` is true when that block
 * is at or below the RPC's `finalized` tag (false if the RPC does not answer that tag).
 *
 * The header is unverified: it comes from the same RPC as the proof, with no light-client check of
 * its hash. The storage proofs are not checked against `stateRoot` either, because an RPC that can
 * pick the header can forge a matching proof; the check would only catch an inconsistent liar.
 * The values still bind the leaf source: a source other than this RPC cannot fake a suffix that
 * lands on these heads. This is the Snap's trust level (ERC, Security Considerations,
 * Light-client assumptions).
 */
export function rpcProofSource(o: { request: RpcRequest }): ProofSource {
  return {
    async getProof(log, slots) {
      const [latest, finalized] = await Promise.all([
        getBlock(o.request, "latest"),
        // A node without the finalized tag only costs the checkpoint, the safe direction.
        getBlock(o.request, "finalized").catch(() => undefined),
      ]);
      const res = await o.request({ method: "eth_getProof", params: [log, slots, numberToHex(latest.number)] });
      // SAFETY: only read through optional access; checked below.
      const proof = (res as { storageProof?: unknown } | null)?.storageProof;
      if (!Array.isArray(proof)) throw new Error("eth_getProof returned no storageProof");
      const byKey = new Map<bigint, Hex>();
      for (const p of proof as { key?: unknown; value?: unknown }[]) {
        if (!isHex(p?.key) || !isHex(p.value)) throw new Error("eth_getProof returned a malformed storage entry");
        byKey.set(hexToBigInt(p.key), p.value); // keys may come back unpadded
      }
      const values = slots.map((s) => {
        const v = byKey.get(hexToBigInt(s));
        if (v === undefined) throw new Error(`eth_getProof omitted slot ${s}`);
        return v;
      });
      return {
        block: { ...latest, finalized: finalized !== undefined && latest.number <= finalized.number, unverified: true },
        values,
      };
    },
  };
}
