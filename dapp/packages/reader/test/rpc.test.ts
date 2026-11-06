import { type Hex, getAddress, hexToBigInt, pad } from "viem";
import { describe, expect, it } from "vitest";
import { type RpcRequest, rpcLeafSource, rpcProofSource } from "../src/rpc";

// Recorded from anvil 1.9.0 after the ticket 06 seed: logs 1 and 22 of the manual writer, as eth_getLogs returned them.
const recorded = {
  jsonrpc: "2.0",
  id: 1,
  result: [
    {
      address: "0xb639d15a0e7ae24e4c32e851fbe0e57585565b14",
      topics: [
        "0xa9793d50953fe203eaa0b98a325313b161563a07c0206d4960e2918a96090548",
        "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ],
      data: "0x0000000000000000000000000000000000000000000000000000000000000001f3054383b7c7257cd5a098015698060f9b04e487ee21ecca14e9816f6d8dfbc4a9a8c41151aef960f7c58be4122aa231a571afa80ec6e636d7262c2d25158fe2a9a8c41151aef960f7c58be4122aa231a571afa80ec6e636d7262c2d25158fe20000000000000000000000000000000000000000000000000000000000007a6900000000000000000000000079fdae13b1a677e5b8ac9f5411f6664788a17537000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000003799cf06f4ea2b24ffdc4730e89c1dbd7455a4c362da01dac89250cb79e9858200000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000",
      blockHash: "0x783b05d41d3ccb00fe4b275426856765129093f08d1f20cc52f68fb68773858e",
      blockNumber: "0x2",
      blockTimestamp: "0x6aece463",
      transactionHash: "0x3739725194c51667417b62f6e0f4b387423171b6822543594e06a298d2e1ae35",
      transactionIndex: "0x0",
      logIndex: "0x0",
      removed: false,
    },
    {
      address: "0xb639d15a0e7ae24e4c32e851fbe0e57585565b14",
      topics: [
        "0xa9793d50953fe203eaa0b98a325313b161563a07c0206d4960e2918a96090548",
        "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
        "0x0000000000000000000000000000000000000000000000000000000000000016",
      ],
      data: "0x000000000000000000000000000000000000000000000000000000000000001636cd10e37f9c2d75af79487befcc0147789003bf118dd08dff4ab33c99cec124489d82e95e5c7c3548b7cd17fed5903435acf19d5c2ffb51be2a74bbc1c7fbfe489d82e95e5c7c3548b7cd17fed5903435acf19d5c2ffb51be2a74bbc1c7fbfe0000000000000000000000000000000000000000000000000000000000007a69000000000000000000000000cd2698c9c9b2b69625dd2a56252190647f34913d00000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000f2eb6757f220d2a68a3d9052dc6f34a4afe0aaa3001c12261c4efee4c1bf462600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000",
      blockHash: "0x783b05d41d3ccb00fe4b275426856765129093f08d1f20cc52f68fb68773858e",
      // Moved from 0x2 to 0x6 so the chunking test sees logs in two different chunks.
      blockNumber: "0x6",
      blockTimestamp: "0x6aece463",
      transactionHash: "0x3739725194c51667417b62f6e0f4b387423171b6822543594e06a298d2e1ae35",
      transactionIndex: "0x0",
      logIndex: "0x15",
      removed: false,
    },
  ],
};

const LOG = getAddress("0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14");
const MANUAL = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

type Filter = { address: Hex; topics: (Hex | null)[]; fromBlock: Hex; toBlock: Hex };

/** A node holding the recorded logs: applies the block range and topic filters like eth_getLogs, and records each call. */
function recordedNode(logs: unknown[] = recorded.result) {
  const calls: Filter[] = [];
  const request: RpcRequest = async ({ method, params }) => {
    if (method === "eth_blockNumber") return "0x7";
    if (method !== "eth_getLogs") throw new Error(`unexpected ${method}`);
    const f = (params as [Filter])[0];
    calls.push(f);
    return (logs as typeof recorded.result).filter(
      (l) =>
        hexToBigInt(l.blockNumber as Hex) >= hexToBigInt(f.fromBlock) &&
        hexToBigInt(l.blockNumber as Hex) <= hexToBigInt(f.toBlock) &&
        f.topics.every((t, i) => t === null || l.topics[i] === t.toLowerCase()),
    );
  };
  return { request, calls };
}

describe("rpcLeafSource", () => {
  it("decodes recorded eth_getLogs logs, taking each block number from the log", async () => {
    const node = recordedNode();
    const leaves = await rpcLeafSource({ request: node.request, log: LOG }).getLeaves(MANUAL, 0n, 7n);
    expect(leaves).toHaveLength(2);
    const [drainer, proceeds] = leaves;
    expect(drainer).toMatchObject({ writer: MANUAL, writerSeq: 1n, globalSeq: 1n, blockNumber: 2n });
    expect(drainer!.leaf).toMatchObject({ chainId: 31337n, subject: "0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537", category: 3, op: 0 });
    expect(proceeds).toMatchObject({ writerSeq: 22n, blockNumber: 6n });
    expect(proceeds!.leaf).toMatchObject({ subject: "0xCd2698C9c9b2b69625DD2a56252190647F34913d", category: 8 });
    // One call, filtered on the log address and the writer topic.
    expect(node.calls).toEqual([
      {
        address: LOG,
        topics: [recorded.result[0]!.topics[0], pad(MANUAL.toLowerCase() as Hex, { size: 32 }), null],
        fromBlock: "0x0",
        toBlock: "0x7",
      },
    ]);
  });

  it("chunks the block range by maxBlockRange", async () => {
    const node = recordedNode();
    const leaves = await rpcLeafSource({ request: node.request, log: LOG, maxBlockRange: 3n }).getLeaves(MANUAL, 0n, 7n);
    expect(leaves.map((l) => l.writerSeq)).toEqual([1n, 22n]);
    expect(node.calls.map((c) => [c.fromBlock, c.toBlock])).toEqual([["0x0", "0x2"], ["0x3", "0x5"], ["0x6", "0x7"]]);
  });

  it("starts a suffix from the anchor leaf's block, found by its writerSeq topic", async () => {
    const node = recordedNode();
    const source = rpcLeafSource({ request: node.request, log: LOG, fromBlock: 1n, maxBlockRange: 100n });
    const leaves = await source.getLeaves(MANUAL, 22n, 7n);
    expect(leaves).toEqual([]); // nothing after 22 in the recording
    expect(node.calls[0]!.topics[2]).toBe(pad("0x16", { size: 32 }));
    expect(node.calls[1]).toMatchObject({ fromBlock: "0x6", toBlock: "0x7" });
    expect(node.calls[1]!.topics[2]).toBeNull();

    expect(await source.getAnchorHead(MANUAL, 1n)).toBe(`0x${recorded.result[0]!.data.slice(2 + 64 * 2, 2 + 64 * 3)}`);
    await expect(source.getAnchorHead(MANUAL, 5n)).rejects.toThrow("no Appended log");
  });

  it("skips removed logs and rejects malformed ones", async () => {
    const removed = { ...recorded.result[0]!, removed: true };
    expect(await rpcLeafSource({ request: recordedNode([removed]).request, log: LOG }).getLeaves(MANUAL, 0n, 7n)).toEqual([]);
    const broken = { ...recorded.result[0]!, data: "nothex" };
    await expect(rpcLeafSource({ request: recordedNode([broken]).request, log: LOG }).getLeaves(MANUAL, 0n, 7n)).rejects.toThrow("malformed");
  });
});

describe("rpcProofSource", () => {
  const header = (n: Hex) => ({ number: n, hash: `0x${"ab".repeat(32)}`, stateRoot: `0x${"cd".repeat(32)}` });
  const node = (finalized: unknown): RpcRequest => async ({ method, params }) => {
    if (method === "eth_getBlockByNumber") {
      if ((params as unknown[])[0] === "latest") return header("0x10");
      if (finalized instanceof Error) throw finalized;
      return finalized;
    }
    if (method === "eth_getProof") {
      expect((params as unknown[])[2]).toBe("0x10");
      // Out of order and with an unpadded key, as some nodes return them.
      return { storageProof: [{ key: "0x2", value: "0x5", proof: [] }, { key: pad("0x1", { size: 32 }), value: "0x0", proof: [] }] };
    }
    throw new Error(`unexpected ${method}`);
  };
  const slots = [pad("0x1", { size: 32 }), pad("0x2", { size: 32 })];

  it("returns values in slot order on an unverified latest block", async () => {
    const { block, values } = await rpcProofSource({ request: node(header("0x8")) }).getProof(LOG, slots);
    expect(values).toEqual(["0x0", "0x5"]);
    expect(block).toMatchObject({ number: 16n, finalized: false, unverified: true });
  });

  it("marks the block finalized only at or below the finalized tag, and not when the tag fails", async () => {
    expect((await rpcProofSource({ request: node(header("0x10")) }).getProof(LOG, slots)).block.finalized).toBe(true);
    expect((await rpcProofSource({ request: node(new Error("unknown tag")) }).getProof(LOG, slots)).block.finalized).toBe(false);
  });
});
