// Usage: yarn seed
// Appends about fifty synthetic leaves from the manual writer (append) and the detector (appendSigned,
// submitted by the relayer), checks the writer sequences, and writes seed-manifest.<chainId>.json.
import { writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { type Address, type Hash, type Hex, formatEther, getAddress, isAddressEqual, keccak256, parseEventLogs, slice, toHex, zeroHash } from "viem";
import { MAX_BATCH, OP, threatFlagLogAbi } from "./abi.js";
import { type Leaf, signBatch } from "./batch.js";
import { type Sender, type Target, accountFrom, connect, senderFor } from "./env.js";
import { relay } from "./relayer.js";

/** A synthetic address nobody holds a key for: the low 20 bytes of keccak("tocsin-demo/<label>"). */
const syntheticSubject = (label: string): Address => getAddress(slice(keccak256(toHex(`tocsin-demo/${label}`)), 12));
const syntheticEvidence = (label: string): Hex => keccak256(toHex(`tocsin-demo/evidence/${label}`));

type TxRecord = { batch: string; writer: Address; via: "append" | "appendSigned"; hash: Hash; leaves: number; gasUsed: string; costWei: string };

async function readSeq(target: Target, writer: Address): Promise<bigint> {
  return target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "writerSeq", args: [writer] });
}

async function appendedIn(target: Target, hash: Hash) {
  const receipt = await target.public.getTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: threatFlagLogAbi, eventName: "Appended", logs: receipt.logs });
  return { receipt, logs: logs.filter((l) => isAddressEqual(l.address, target.log)) };
}

function leafHashOf(logs: Awaited<ReturnType<typeof appendedIn>>["logs"], subject: Address, op: number): Hash {
  const hit = logs.find((l) => isAddressEqual(l.args.leaf.subject, subject) && l.args.leaf.op === op);
  if (!hit) throw new Error(`no Appended event for subject ${subject} op ${op}`);
  return hit.args.leafHash;
}

async function sendAppend(target: Target, writer: Sender, leaves: Leaf[]): Promise<Hash> {
  if (leaves.length === 0 || leaves.length > MAX_BATCH) throw new Error(`a batch holds 1 to ${MAX_BATCH} leaves`);
  const { request } = await target.public.simulateContract({
    account: writer.account,
    address: target.log,
    abi: threatFlagLogAbi,
    functionName: "append",
    args: [leaves],
  });
  const hash = await writer.writeContract(request);
  const receipt = await target.public.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`append ${hash} reverted on chain`);
  return hash;
}

async function record(target: Target, batch: string, writer: Address, via: TxRecord["via"], hash: Hash) {
  const { receipt, logs } = await appendedIn(target, hash);
  const rec: TxRecord = {
    batch,
    writer,
    via,
    hash,
    leaves: logs.length,
    gasUsed: receipt.gasUsed.toString(),
    costWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
  };
  console.log(`  ${batch}: ${rec.leaves} leaves, tx ${hash}, gas ${rec.gasUsed}, cost ${formatEther(BigInt(rec.costWei))} ETH`);
  return { rec, logs };
}

async function main() {
  const target = await connect();
  const manualAcct = accountFrom("MANUAL_WRITER_PRIVATE_KEY");
  const detectorAcct = accountFrom("DETECTOR_PRIVATE_KEY");
  const relayerAcct = accountFrom("RELAYER_PRIVATE_KEY");
  const [manual, detector, relayerAddr] = [manualAcct.address, detectorAcct.address, relayerAcct.address];
  if (new Set([manual, detector, relayerAddr]).size !== 3) throw new Error("manual writer, detector, and relayer must be three different keys");

  // Refuse a second seed: the seed holds the detector's first leaves.
  const detectorStart = await readSeq(target, detector);
  if (detectorStart !== 0n) throw new Error(`detector ${detector} already has ${detectorStart} leaves; the log is already seeded`);
  const manualStart = await readSeq(target, manual);

  const [mBal, rBal, dBal, gasPrice, head] = await Promise.all([
    target.public.getBalance({ address: manual }),
    target.public.getBalance({ address: relayerAddr }),
    target.public.getBalance({ address: detector }),
    target.public.getGasPrice(),
    target.public.getBlock({ blockTag: "latest" }),
  ]);
  console.log(`chain ${target.chainId}, log ${target.log}, block ${head.number}`);
  console.log(`manual writer ${manual}  balance ${formatEther(mBal)} ETH  writerSeq ${manualStart}`);
  console.log(`detector      ${detector}  balance ${formatEther(dBal)} ETH  writerSeq ${detectorStart}`);
  console.log(`relayer       ${relayerAddr}  balance ${formatEther(rBal)} ETH`);
  console.log(`gas price ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);
  if (dBal > 0n) console.warn("warning: the detector key holds ETH; it should hold none");
  if (mBal === 0n || rBal === 0n) throw new Error("manual writer and relayer both need ETH for gas");

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question("Sends 3 transactions, 50 leaves. Type SEED to continue: ");
  rl.close();
  if (answer.trim() !== "SEED") throw new Error("aborted");

  const chainId = BigInt(target.chainId);
  const seenBlock = head.number;
  const leaf = (subject: Address, category: number, op: number, evidence: Hex, refLeaf: Hex = zeroHash): Leaf => ({
    chainId, subject, category, op, evidence, seenBlock, refLeaf,
  });
  const flag = (label: string, category: number): Leaf => leaf(syntheticSubject(label), category, OP.FLAG, syntheticEvidence(label));
  const range = (n: number, f: (i: number) => Leaf) => Array.from({ length: n }, (_, i) => f(i + 1));

  const subjects = {
    drainerReceiver: syntheticSubject("drainer-receiver-1"),
    theftProceeds: syntheticSubject("theft-proceeds-1"),
    tombstoned: syntheticSubject("paid-lookalike-retracted"),
    countered: syntheticSubject("poisoning-operator-countered"),
    disputed: manual,
  };
  const txs: TxRecord[] = [];
  const manualW = senderFor(target, manualAcct);
  const relayerW = senderFor(target, relayerAcct);

  // Batch 1, manual writer: 22 flags in categories 3, 7, 6, 1, and one category 8.
  const m1 = [
    ...range(5, (i) => flag(`drainer-receiver-${i}`, 3)),
    ...range(5, (i) => flag(`drainer-spender-${i}`, 7)),
    ...range(4, (i) => flag(`paid-lookalike-${i}`, 6)),
    flag("paid-lookalike-retracted", 6),
    ...range(6, (i) => flag(`poisoning-operator-m${i}`, 1)),
    flag("theft-proceeds-1", 8),
  ];
  const r1 = await record(target, "manual-1", manual, "append", await sendAppend(target, manualW, m1));
  txs.push(r1.rec);

  // Batch 2, detector, signed and handed to the relayer: 25 flags in categories 1 and 6, one on the manual
  // writer's own address so the manual writer has something to dispute.
  const d1 = [
    ...range(19, (i) => flag(`poisoning-operator-${i}`, 1)),
    flag("poisoning-operator-countered", 1),
    ...range(4, (i) => flag(`paid-lookalike-d${i}`, 6)),
    leaf(manual, 1, OP.FLAG, syntheticEvidence("detector-flags-manual-writer")),
  ];
  const nonce = await target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [detector] });
  const signed = await signBatch(detectorAcct, { log: target.log, chainId: target.chainId, leaves: d1, deadline: head.timestamp + 3600n, nonce });
  const relayed = await relay(signed, target, relayerW);
  if (relayed.status !== "sent") throw new Error(`relayer dropped the detector batch: ${relayed.reason}`);
  const r2 = await record(target, "detector-1", detector, "appendSigned", relayed.hash);
  txs.push(r2.rec);

  // Batch 3, manual writer: tombstone of its own leaf, counter of a detector leaf, dispute of the detector's flag on it.
  const m2 = [
    leaf(subjects.tombstoned, 6, OP.TOMBSTONE, zeroHash, leafHashOf(r1.logs, subjects.tombstoned, OP.FLAG)),
    leaf(subjects.countered, 1, OP.COUNTER, syntheticEvidence("counter-poisoning-operator-countered"), leafHashOf(r2.logs, subjects.countered, OP.FLAG)),
    leaf(manual, 1, OP.DISPUTE, syntheticEvidence("dispute-detector-flag"), leafHashOf(r2.logs, manual, OP.FLAG)),
  ];
  const r3 = await record(target, "manual-2", manual, "append", await sendAppend(target, manualW, m2));
  txs.push(r3.rec);

  const sent = { manual: m1.length + m2.length, detector: d1.length };
  const [manualEnd, detectorEnd, globalSeq] = await Promise.all([
    readSeq(target, manual),
    readSeq(target, detector),
    target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "globalSeq" }),
  ]);
  const ok = manualEnd - manualStart === BigInt(sent.manual) && detectorEnd - detectorStart === BigInt(sent.detector);
  console.log(`writerSeq manual ${manualStart} -> ${manualEnd} (sent ${sent.manual}), detector ${detectorStart} -> ${detectorEnd} (sent ${sent.detector}), globalSeq ${globalSeq}`);

  const manifest = {
    chainId: target.chainId,
    log: target.log,
    writers: { manual, detector },
    relayer: relayerAddr,
    subjects,
    leavesSent: sent,
    writerSeq: { manual: manualEnd.toString(), detector: detectorEnd.toString() },
    seenBlock: seenBlock.toString(),
    txs,
  };
  const path = fileURLToPath(new URL(`../seed-manifest.${target.chainId}.json`, import.meta.url));
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest written to ${path}`);
  if (!ok) throw new Error("writer sequences do not match the leaf counts sent");
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
