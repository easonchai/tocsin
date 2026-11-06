// Usage: yarn seed-curators
// Seeds the two curator writers behind harborwatch.eth and lanterndao.eth, signed by each writer and
// submitted by the relayer, so neither writer spends gas. Their subjects overlap the main seed's on purpose:
// the drainer receiver is flagged by all three lists, others by two, and each writer has a few of its own.
// Writes curators-manifest.<chainId>.json.
import { writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { type Account, type Address, type Hex, getAddress, keccak256, slice, toHex, zeroHash } from "viem";
import { OP, threatFlagLogAbi } from "./abi.js";
import { type Leaf, signBatch } from "./batch.js";
import { type Target, accountFrom, connect, senderFor } from "./env.js";
import { relay } from "./relayer.js";

// Same derivation as seed.ts, so a shared label is the same subject address.
const syntheticSubject = (label: string): Address => getAddress(slice(keccak256(toHex(`tocsin-demo/${label}`)), 12));
const syntheticEvidence = (label: string): Hex => keccak256(toHex(`tocsin-demo/evidence/${label}`));

/** [subject label, category]. Labels without a curator prefix are shared with seed.ts. */
const HARBOR: [string, number][] = [
  ["drainer-receiver-1", 3], // also manual (tocsin.eth) and lantern
  ["drainer-receiver-2", 3], // also manual
  ["drainer-receiver-3", 3], // also manual
  ["drainer-spender-1", 7], // also manual
  ["harbor-drainer-receiver-1", 3],
  ["harbor-drainer-receiver-2", 3],
  ["harbor-drainer-spender-1", 7],
];
const LANTERN: [string, number][] = [
  ["drainer-receiver-1", 3], // also manual and harbor
  ["poisoning-operator-1", 1], // also detector (tocsin.eth)
  ["poisoning-operator-2", 1], // also detector
  ["paid-lookalike-1", 6], // also manual
  ["lantern-poisoning-operator-1", 1],
  ["lantern-poisoning-operator-2", 1],
];

const seqOf = (t: Target, w: Address) => t.public.readContract({ address: t.log, abi: threatFlagLogAbi, functionName: "writerSeq", args: [w] });

async function main() {
  const target = await connect();
  const relayerAcct = accountFrom("RELAYER_PRIVATE_KEY");
  const curators: { name: string; account: Account; flags: [string, number][] }[] = [
    { name: "harborwatch.eth", account: accountFrom("HARBOR_WRITER_PRIVATE_KEY"), flags: HARBOR },
    { name: "lanterndao.eth", account: accountFrom("LANTERN_WRITER_PRIVATE_KEY"), flags: LANTERN },
  ];
  for (const c of curators) {
    const seq = await seqOf(target, c.account.address);
    if (seq !== 0n) throw new Error(`${c.name} writer ${c.account.address} already has ${seq} leaves; already seeded`);
    console.log(`${c.name} writer ${c.account.address}: ${c.flags.length} flags`);
  }
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Relayer ${relayerAcct.address} sends ${curators.length} transactions. Type SEED to continue: `);
  rl.close();
  if (answer.trim() !== "SEED") throw new Error("aborted");

  const head = await target.public.getBlock({ blockTag: "latest" });
  const relayer = senderFor(target, relayerAcct);
  const out: Record<string, { writer: Address; tx: Hex; subjects: Record<string, Address> }> = {};
  for (const c of curators) {
    const leaves: Leaf[] = c.flags.map(([label, category]) => ({
      chainId: BigInt(target.chainId),
      subject: syntheticSubject(label),
      category,
      op: OP.FLAG,
      evidence: syntheticEvidence(`${c.name}/${label}`),
      seenBlock: head.number,
      refLeaf: zeroHash,
    }));
    const nonce = await target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [c.account.address] });
    const signed = await signBatch(c.account, { log: target.log, chainId: target.chainId, leaves, deadline: head.timestamp + 3600n, nonce });
    const r = await relay(signed, target, relayer);
    if (r.status !== "sent") throw new Error(`relayer dropped the ${c.name} batch: ${r.reason}`);
    const seq = await seqOf(target, c.account.address);
    console.log(`${c.name}: tx ${r.hash}, writerSeq ${seq}`);
    if (seq !== BigInt(leaves.length)) throw new Error(`${c.name} writerSeq ${seq}, expected ${leaves.length}`);
    out[c.name] = { writer: c.account.address, tx: r.hash, subjects: Object.fromEntries(c.flags.map(([l]) => [l, syntheticSubject(l)])) };
  }
  const path = fileURLToPath(new URL(`../curators-manifest.${target.chainId}.json`, import.meta.url));
  await writeFile(path, `${JSON.stringify({ chainId: target.chainId, log: target.log, seenBlock: head.number.toString(), curators: out }, null, 2)}\n`);
  console.log(`manifest written to ${path}`);
}

main().catch((err) => {
  console.error("seed-curators failed:", err);
  process.exit(1);
});
