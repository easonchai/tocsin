// Usage: yarn workspace @tocsin/infra tsx --env-file=../../../scripts/.env src/seed-names.ts
// Moves the demo flags onto the three names the demo wallet follows. core.tocsin.eth's core writer re-flags what
// tocsin.eth's manual writer flagged, including fakeUSDC and the flag it tombstoned; blockaid.tocsin.eth's writer
// flags what harborwatch.eth's did, scamsniffer.tocsin.eth's what lanterndao.eth's did. Same categories, and every
// leaf carries this chain's id, as in seed.ts, so it counts on a Sepolia send. Each writer signs, the relayer pays.
// Needs CORE_WRITER_, BLOCKAID_ and SCAMSNIFFER_PRIVATE_KEY (scripts/.env) and RELAYER_PRIVATE_KEY (this package's .env).
// Writes names-manifest.<chainId>.json after every tx, so a rerun skips what landed, and
// docs/plan/demo/seed/demo-flags.sepolia.json: per list and subject label, the writer and the tx that flagged it.
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { type Account, type Address, type Hash, type Hex, formatEther, getAddress, isAddressEqual, parseEventLogs, zeroHash } from "viem";
import { OP, threatFlagLogAbi } from "./abi.js";
import { syntheticEvidence, syntheticSubject } from "./append.js";
import { type Leaf, signBatch } from "./batch.js";
import { type KeyVar, type Sender, type Target, accountFrom, connect, manifestPath, senderFor } from "./env.js";
import { relay } from "./relayer.js";

const CORE = "core.tocsin.eth";
const BLOCKAID = "blockaid.tocsin.eth";
const SCAMSNIFFER = "scamsniffer.tocsin.eth";

/** [subject label, category]. "fakeUSDC" is the token in tokens-manifest; every other label is a synthetic subject. */
type Flag = readonly [string, number];
// drainer-receiver-1 first, so its flag is the core writer's next sequence: the lying proxy drops that one.
const CORE_FLAGS: Flag[] = [
  ...[1, 2, 3, 4, 5].map((i): Flag => [`drainer-receiver-${i}`, 3]),
  ...[1, 2, 3, 4, 5].map((i): Flag => [`drainer-spender-${i}`, 7]),
  ...[1, 2, 3, 4].map((i): Flag => [`paid-lookalike-${i}`, 6]),
  ["paid-lookalike-retracted", 6],
  ...[1, 2, 3, 4, 5, 6].map((i): Flag => [`poisoning-operator-m${i}`, 1]),
  ["theft-proceeds-1", 8],
  ["malicious-delegate-1", 4],
  ["fakeUSDC", 5],
];
const BLOCKAID_FLAGS: Flag[] = [
  ["drainer-receiver-1", 3],
  ["drainer-receiver-2", 3],
  ["drainer-receiver-3", 3],
  ["drainer-spender-1", 7],
  ["harbor-drainer-receiver-1", 3],
  ["harbor-drainer-receiver-2", 3],
  ["harbor-drainer-spender-1", 7],
];
const SCAMSNIFFER_FLAGS: Flag[] = [
  ["drainer-receiver-1", 3],
  ["poisoning-operator-1", 1],
  ["poisoning-operator-2", 1],
  ["paid-lookalike-1", 6],
  ["lantern-poisoning-operator-1", 1],
  ["lantern-poisoning-operator-2", 1],
  ["poisoning-funder-1", 2],
];

type FlagRecord = { label: string; subject: Address; category: number; op: number; writerSeq: string; leafHash: Hash };
type TxRecord = {
  batch: string;
  list: string;
  writer: Address;
  via: "appendSigned";
  hash: Hash;
  block: string;
  leaves: number;
  gasUsed: string;
  costWei: string;
  fromSeq: string;
  toSeq: string;
  flags: FlagRecord[];
};
type Manifest = { chainId: number; log: Address; relayer: Address; writers: Record<string, Address>; txs: TxRecord[] };
type DemoFlag = { writer: Address; tx: Hash; tombstoneTx?: Hash };

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T; // SAFETY: files this repo wrote
const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const seqOf = (t: Target, w: Address, blockNumber: bigint) =>
  t.public.readContract({ address: t.log, abi: threatFlagLogAbi, functionName: "writerSeq", args: [w], blockNumber });

async function appendedIn(t: Target, hash: Hash) {
  const receipt = await t.public.getTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: threatFlagLogAbi, eventName: "Appended", logs: receipt.logs }).filter((l) => isAddressEqual(l.address, t.log));
  return { receipt, logs };
}

/** Signs `leaves` as `account`, relays them, and records the tx with each leaf's sequence and hash. */
async function send(t: Target, relayer: Sender, account: Account, batch: string, list: string, labels: string[], leaves: Leaf[]): Promise<TxRecord> {
  const head = await t.public.getBlock({ blockTag: "latest" });
  const nonce = await t.public.readContract({ address: t.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [account.address] });
  const signed = await signBatch(account, { log: t.log, chainId: t.chainId, leaves, deadline: head.timestamp + 3600n, nonce });
  const r = await relay(signed, t, relayer);
  if (r.status !== "sent") throw new Error(`relayer dropped ${batch}: ${r.reason}`);
  const { receipt, logs } = await appendedIn(t, r.hash);
  if (logs.length !== leaves.length) throw new Error(`${batch}: ${logs.length} Appended events for ${leaves.length} leaves in ${r.hash}`);
  // At the receipt's block and the one before: a load-balanced RPC can answer "latest" from a node behind it.
  const [fromSeq, toSeq] = await Promise.all([seqOf(t, account.address, r.blockNumber - 1n), seqOf(t, account.address, r.blockNumber)]);
  if (toSeq !== fromSeq + BigInt(leaves.length)) throw new Error(`${batch}: writerSeq ${fromSeq} -> ${toSeq} after ${leaves.length} leaves`);
  const rec: TxRecord = {
    batch,
    list,
    writer: account.address,
    via: "appendSigned",
    hash: r.hash,
    block: receipt.blockNumber.toString(),
    leaves: leaves.length,
    gasUsed: receipt.gasUsed.toString(),
    costWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    fromSeq: fromSeq.toString(),
    toSeq: toSeq.toString(),
    flags: logs.map((l, i) => ({ label: labels[i]!, subject: l.args.leaf.subject, category: l.args.leaf.category, op: l.args.leaf.op, writerSeq: l.args.writerSeq.toString(), leafHash: l.args.leafHash })),
  };
  console.log(`  ${batch}: tx ${rec.hash}, block ${rec.block}, writerSeq ${rec.fromSeq} -> ${rec.toSeq}, gas ${rec.gasUsed}, cost ${formatEther(BigInt(rec.costWei))} ETH`);
  return rec;
}

/** tsv address -> label, the label cut at " (" as the demo page's test keys it. */
async function tsvLabels(): Promise<Map<Address, string>> {
  const tsv = await readFile(here("../../../../docs/plan/demo/test-addresses.tsv"), "utf8");
  return new Map(tsv.trim().split("\n").slice(1).map((line) => {
    const [address, , , label] = line.split("\t");
    return [getAddress(address!), label!.split(" (")[0]!];
  }));
}

async function main() {
  const target = await connect();
  const relayerAcct = accountFrom("RELAYER_PRIVATE_KEY");
  const seed = await readJson<{ writers: { detector: Address }; txs: { batch: string; hash: Hash }[] }>(manifestPath(`seed-manifest.${target.chainId}.json`));
  const tokens = await readJson<{ fakeUSDC: { address: Address; tx: Hash } }>(manifestPath(`tokens-manifest.${target.chainId}.json`));
  const detectorTx = seed.txs.find((x) => x.batch === "detector-1")?.hash;
  if (!detectorTx) throw new Error("seed manifest has no detector-1 batch");

  const writers: { list: string; key: KeyVar; flags: Flag[] }[] = [
    { list: CORE, key: "CORE_WRITER_PRIVATE_KEY", flags: CORE_FLAGS },
    { list: BLOCKAID, key: "BLOCKAID_PRIVATE_KEY", flags: BLOCKAID_FLAGS },
    { list: SCAMSNIFFER, key: "SCAMSNIFFER_PRIVATE_KEY", flags: SCAMSNIFFER_FLAGS },
  ];
  const accounts = Object.fromEntries(writers.map((w) => [w.list, accountFrom(w.key)]));
  const path = manifestPath(`names-manifest.${target.chainId}.json`);
  // Only a missing file starts fresh; any other read error would resend batches that already landed.
  let manifest: Manifest = await readJson<Manifest>(path).catch((err: unknown) => {
    if ((err as { code?: unknown }).code !== "ENOENT") throw err;
    return {
    chainId: target.chainId,
    log: target.log,
    relayer: relayerAcct.address,
    writers: Object.fromEntries(Object.entries(accounts).map(([l, a]) => [l, a.address])),
    txs: [],
    };
  });
  const done = (batch: string) => manifest.txs.find((x) => x.batch === batch);
  const save = async (rec: TxRecord) => {
    manifest = { ...manifest, txs: [...manifest.txs, rec] };
    await writeJson(path, manifest);
  };

  const todo = [...writers.map((w) => `${w.list}/flags`), `${CORE}/retract`].filter((b) => !done(b));
  const balance = await target.public.getBalance({ address: relayerAcct.address });
  console.log(`chain ${target.chainId}, log ${target.log}; to send: ${todo.join(", ") || "nothing"}`);
  if (todo.length) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(`Relayer ${relayerAcct.address} (${formatEther(balance)} ETH) sends ${todo.length} transactions. Type SEED to continue: `);
    rl.close();
    if (answer.trim() !== "SEED") throw new Error("aborted");
  }

  const relayer = senderFor(target, relayerAcct);
  const head = await target.public.getBlockNumber();
  const chainId = BigInt(target.chainId);
  const subjectOf = (label: string) => (label === "fakeUSDC" ? getAddress(tokens.fakeUSDC.address) : syntheticSubject(label));
  for (const w of writers) {
    const batch = `${w.list}/flags`;
    if (done(batch)) continue;
    const leaves: Leaf[] = w.flags.map(([label, category]) => ({
      chainId,
      subject: subjectOf(label),
      category,
      op: OP.FLAG,
      // ERC, Categories: a token's evidence is its deployment tx, as seed-tokens.ts used.
      evidence: label === "fakeUSDC" ? tokens.fakeUSDC.tx : syntheticEvidence(`${w.list}/${label}`),
      seenBlock: head,
      refLeaf: zeroHash,
    }));
    await save(await send(target, relayer, accounts[w.list]!, batch, w.list, w.flags.map(([l]) => l), leaves));
  }

  // The core writer retracts its paid-lookalike-retracted flag, and counters the detector's flag on
  // poisoning-operator-countered as the manual writer did (same operator, so the flag still counts).
  const detectorLogs = (await appendedIn(target, detectorTx)).logs;
  if (!done(`${CORE}/retract`)) {
    const retracted = done(`${CORE}/flags`)!.flags.find((f) => f.label === "paid-lookalike-retracted")!;
    const countered = detectorLogs.find((l) => isAddressEqual(l.args.leaf.subject, syntheticSubject("poisoning-operator-countered")) && l.args.leaf.op === OP.FLAG);
    if (!countered) throw new Error(`no detector flag on poisoning-operator-countered in ${detectorTx}`);
    const leaves: Leaf[] = [
      { chainId, subject: retracted.subject, category: 6, op: OP.TOMBSTONE, evidence: zeroHash, seenBlock: head, refLeaf: retracted.leafHash },
      { chainId, subject: countered.args.leaf.subject, category: 1, op: OP.COUNTER, evidence: syntheticEvidence(`${CORE}/counter-poisoning-operator-countered`), seenBlock: head, refLeaf: countered.args.leafHash },
    ];
    await save(await send(target, relayer, accounts[CORE]!, `${CORE}/retract`, CORE, ["paid-lookalike-retracted", "poisoning-operator-countered"], leaves));
  }

  // The demo page's evidence table. The detector writes on core.tocsin.eth too; its flags come from the seed.
  const labels = await tsvLabels();
  const out: Record<string, Record<string, DemoFlag>> = {};
  const put = (list: string, label: string, flag: DemoFlag) => {
    const byLabel = out[list] ?? {};
    if (byLabel[label]) throw new Error(`${list}: two writers flag ${label}`);
    out[list] = { ...byLabel, [label]: flag };
  };
  for (const w of writers) {
    const rec = done(`${w.list}/flags`)!;
    for (const f of rec.flags) put(w.list, f.label, { writer: rec.writer, tx: rec.hash });
  }
  const retract = done(`${CORE}/retract`)!;
  out[CORE] = { ...out[CORE], "paid-lookalike-retracted": { ...out[CORE]!["paid-lookalike-retracted"]!, tombstoneTx: retract.hash } };
  for (const l of detectorLogs.filter((x) => x.args.leaf.op === OP.FLAG)) {
    const label = labels.get(getAddress(l.args.leaf.subject));
    if (label) put(CORE, label, { writer: getAddress(seed.writers.detector), tx: detectorTx });
  }
  const flagsPath = here(`../../../../docs/plan/demo/seed/demo-flags.${target.chainId === 11155111 ? "sepolia" : target.chainId}.json`);
  await writeJson(flagsPath, out);
  console.log(`manifests written to ${path} and ${flagsPath}`);
}

main().catch((err) => {
  console.error("seed-names failed:", err);
  process.exit(1);
});
