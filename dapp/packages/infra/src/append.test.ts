import { describe, expect, it } from "vitest";
import { type Address, type Hex, recoverTypedDataAddress, zeroHash } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { appendFlags, syntheticEvidence, syntheticSubject } from "./append.js";
import { appendTypes } from "./batch.js";
import type { Sender, Target } from "./env.js";

const LOG: Address = "0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14";
const NOW = 1_800_000_000n;
const writer = privateKeyToAccount(generatePrivateKey());
const relayerAccount = privateKeyToAccount(generatePrivateKey());

type Sent = { args: readonly [Address, readonly { subject: Address; category: number; evidence: Hex }[], bigint, bigint, Hex] };

// In-memory log: the writer already has `seq` leaves and has signed `nonce` batches. A sent appendSigned
// advances the sequence by `advance(leaves)`, which a test can break to model a log that lost leaves.
function fakeChain(seq: bigint, nonce: bigint, advance = (n: number) => BigInt(n)) {
  const state = { seq, nonce };
  const sent: Sent[] = [];
  const pub = {
    getBlock: async () => ({ timestamp: NOW, number: 500n }),
    readContract: async ({ functionName }: { functionName: string }) => (functionName === "writerSeq" ? state.seq : state.nonce),
    simulateContract: async (args: unknown) => ({ request: args }),
    waitForTransactionReceipt: async () => ({ status: "success", blockNumber: 501n, gasUsed: 1234n }),
  };
  const sender = {
    account: relayerAccount,
    writeContract: async (req: Sent) => {
      sent.push(req);
      state.seq += advance(req.args[1].length);
      state.nonce += 1n;
      return zeroHash;
    },
  };
  // SAFETY: appendFlags and relay() call only the methods implemented above.
  const target = { chainId: 11155111, log: LOG, chain: {} as Target["chain"], public: pub as unknown as Target["public"] };
  return { target, sender: sender as unknown as Sender, sent };
}

const batch = { account: writer, evidencePrefix: "lanterndao.eth/", flags: [["poisoning-funder-1", 2]] as const };

describe("appendFlags", () => {
  it("continues a writer that already has leaves, signed with its current nonce", async () => {
    const { target, sender, sent } = fakeChain(6n, 1n);
    const r = await appendFlags(target, sender, batch);
    expect(r).toMatchObject({ fromSeq: 6n, toSeq: 7n, writer: writer.address });
    expect(sent).toHaveLength(1);
    const [w, leaves, deadline, nonce, signature] = sent[0]!.args;
    expect(w).toBe(writer.address);
    expect(nonce).toBe(1n);
    expect(leaves[0]).toMatchObject({ subject: syntheticSubject("poisoning-funder-1"), category: 2, evidence: syntheticEvidence("lanterndao.eth/poisoning-funder-1") });
    const signer = await recoverTypedDataAddress({
      domain: { name: "ThreatFlagLog", version: "1", chainId: 11155111, verifyingContract: LOG },
      types: appendTypes,
      primaryType: "Append",
      message: { leaves: r.leaves, deadline, nonce },
      signature,
    });
    expect(signer).toBe(writer.address);
  });

  it("throws when the onchain sequence does not move by the leaf count", async () => {
    const { target, sender } = fakeChain(6n, 1n, () => 0n);
    await expect(appendFlags(target, sender, batch)).rejects.toThrow(/writerSeq 6 -> 6/);
  });

  it("derives the subjects the seeders already published", () => {
    // From curators-manifest.11155111.json and seed-manifest.11155111.json.
    expect(syntheticSubject("drainer-receiver-1")).toBe("0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537");
    expect(syntheticSubject("lantern-poisoning-operator-1")).toBe("0xd59557f9a8f3574f58FDc8ea63E4f9B1F7486B22");
  });
});
