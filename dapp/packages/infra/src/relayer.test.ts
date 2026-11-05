import { describe, expect, it } from "vitest";
import { type Address, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { batchToJson, parseBatch, signBatch } from "./batch.js";
import type { Sender, Target } from "./env.js";
import { relay } from "./relayer.js";

const LOG: Address = "0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14";
const NOW = 1_800_000_000n;
const writer = privateKeyToAccount(generatePrivateKey());
const relayerAccount = privateKeyToAccount(generatePrivateKey());

// In-memory chain: latest block at NOW, writer nonce 0, every simulation succeeds.
function fakeTarget(): Target {
  const pub = {
    getBlock: async () => ({ timestamp: NOW, number: 100n }),
    readContract: async () => 0n,
    simulateContract: async (args: unknown) => ({ request: args }),
    waitForTransactionReceipt: async () => ({ status: "success", blockNumber: 101n, gasUsed: 1234n }),
  };
  // SAFETY: relay() only calls the four methods implemented above.
  return { chainId: 11155111, log: LOG, chain: {} as Target["chain"], public: pub as unknown as Target["public"] };
}

function recordingSender() {
  const sent: unknown[] = [];
  const sender = {
    account: relayerAccount,
    writeContract: async (req: unknown) => {
      sent.push(req);
      return zeroHash;
    },
  };
  return { sent, sender: sender as unknown as Sender }; // SAFETY: relay() uses only account and writeContract
}

const leaves = [{ chainId: 11155111n, subject: writer.address, category: 1, op: 0, evidence: `0x${"11".repeat(32)}` as const, seenBlock: 99n, refLeaf: zeroHash }];
const sign = (deadline: bigint) => signBatch(writer, { log: LOG, chainId: 11155111, leaves, deadline, nonce: 0n });

describe("relay", () => {
  it("drops a batch whose deadline has passed and sends nothing", async () => {
    const { sent, sender } = recordingSender();
    const result = await relay(await sign(NOW - 1n), fakeTarget(), sender);
    expect(result.status).toBe("dropped");
    expect(sent).toHaveLength(0);
  });

  it("drops a batch whose deadline falls inside the margin", async () => {
    const { sent, sender } = recordingSender();
    const result = await relay(await sign(NOW + 10n), fakeTarget(), sender, { marginSeconds: 30 });
    expect(result.status).toBe("dropped");
    expect(sent).toHaveLength(0);
  });

  it("drops a batch signed for another chain", async () => {
    const { sent, sender } = recordingSender();
    const batch = { ...(await sign(NOW + 3600n)), chainId: 1 };
    expect((await relay(batch, fakeTarget(), sender)).status).toBe("dropped");
    expect(sent).toHaveLength(0);
  });

  it("sends a live batch", async () => {
    const { sent, sender } = recordingSender();
    const result = await relay(await sign(NOW + 3600n), fakeTarget(), sender);
    expect(result).toMatchObject({ status: "sent", gasUsed: 1234n, leaves: 1 });
    expect(sent).toHaveLength(1);
  });
});

describe("parseBatch", () => {
  it("round-trips the JSON form", async () => {
    const batch = await sign(NOW + 3600n);
    expect(parseBatch(JSON.parse(batchToJson(batch)))).toEqual(batch);
  });

  it("rejects an op outside 0 to 3, an empty batch, and more than 500 leaves", async () => {
    const json = JSON.parse(batchToJson(await sign(NOW + 3600n)));
    expect(() => parseBatch({ ...json, leaves: [{ ...json.leaves[0], op: 4 }] })).toThrow(/op/);
    expect(() => parseBatch({ ...json, leaves: [] })).toThrow(/leaves/);
    expect(() => parseBatch({ ...json, leaves: Array(501).fill(json.leaves[0]) })).toThrow(/leaves/);
  });
});
