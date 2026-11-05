import { type Address, type Hex, decodeEventLog, getAddress, isHex, zeroHash } from "viem";
import { threatFlagLogAbi } from "./chain";
import type { AppendedLeaf, LeafSource } from "./types";

/**
 * A leaf source over leaves already in memory. Returns them in the order given, so a source that
 * hands it reordered or edited leaves passes them on unchanged; sync is what catches that.
 */
export function memoryLeafSource(all: readonly AppendedLeaf[]): LeafSource {
  const of = (writer: Address) => all.filter((l) => getAddress(l.writer) === getAddress(writer));
  return {
    async getLeaves(writer, fromSeq, toBlock) {
      return of(writer).filter((l) => l.writerSeq > fromSeq && l.blockNumber <= toBlock);
    },
    async getAnchorHead(writer, seq) {
      if (seq === 0n) return zeroHash;
      const l = of(writer).find((x) => x.writerSeq === seq);
      if (!l) throw new Error(`no leaf ${seq} for writer ${writer} to anchor on`);
      return l.writerHead;
    },
  };
}

/**
 * Mirror snapshot format, one file per writer: a JSON array of the writer's `Appended` logs in
 * writer-sequence order, each entry
 *
 *   { "blockNumber": "<decimal string>", "topics": ["0x..", "0x..", "0x.."], "data": "0x.." }
 *
 * where `topics` and `data` are the log's raw ABI-encoded topics and data exactly as `eth_getLogs`
 * returns them, and `blockNumber` is the block the leaf was appended in (the event does not carry
 * it and the leaf hash commits to it). Nothing in the file is trusted; sync verifies it.
 *
 * Takes one file text per writer. Throws on a file that does not parse.
 */
export function snapshotLeafSource(...fileTexts: string[]): LeafSource {
  return memoryLeafSource(fileTexts.flatMap(parseSnapshot));
}

function parseSnapshot(fileText: string): AppendedLeaf[] {
  const json: unknown = JSON.parse(fileText);
  if (!Array.isArray(json)) throw new Error("snapshot is not a JSON array");
  return json.map((entry: unknown, i): AppendedLeaf => {
    // SAFETY: only read through optional access; every field is checked below before use.
    const e = entry as { blockNumber?: unknown; topics?: unknown; data?: unknown } | null;
    if (
      typeof e?.blockNumber !== "string" ||
      !/^\d+$/.test(e.blockNumber) ||
      !Array.isArray(e.topics) ||
      e.topics.length === 0 ||
      !e.topics.every((t) => isHex(t)) ||
      !isHex(e.data)
    ) {
      throw new Error(`snapshot entry ${i} is malformed`);
    }
    try {
      const { args } = decodeEventLog({
        abi: threatFlagLogAbi,
        eventName: "Appended",
        // SAFETY: checked above to be a non-empty array of hex strings.
        topics: e.topics as [Hex, ...Hex[]],
        data: e.data,
      });
      return { ...args, blockNumber: BigInt(e.blockNumber) };
    } catch (error) {
      throw new Error(`snapshot entry ${i} is not an Appended log`, { cause: error });
    }
  });
}
