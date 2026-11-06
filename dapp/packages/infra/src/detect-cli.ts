// Usage: yarn detect
// Watches new blocks, flags the authorizer of dust that plants a lookalike of an address the receiver paid
// (category 1), signs batches with the detector key, and hands them to the relayer in process.
// The detector key only signs typed data: no wallet client is ever built for it, so it never sends a transaction.
import { setTimeout as sleep } from "node:timers/promises";
import { formatEther, isAddressEqual } from "viem";
import { MAX_BATCH, threatFlagLogAbi } from "./abi.js";
import { signBatch } from "./batch.js";
import { Batcher, type Config, Counterparties, type WatchedLog, scan, toLeaf, transfersIn, watchedEvents } from "./detector.js";
import { accountFrom, connect, senderFor } from "./env.js";
import { relay } from "./relayer.js";

const POLL_MS = 4_000;
const DEADLINE_SECONDS = 3600n;

function intVar(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return n;
}

function uintVar(name: string, fallback: bigint): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`);
  return BigInt(raw);
}

const cfg: Config = {
  prefixHex: intVar("DETECTOR_PREFIX_HEX", 4, 1, 20),
  suffixHex: intVar("DETECTOR_SUFFIX_HEX", 4, 1, 20),
  dustWei: uintVar("DETECTOR_DUST_WEI", 10n ** 14n),
  dustTokenUnits: uintVar("DETECTOR_DUST_TOKEN_UNITS", 10_000n),
};
const perHour = intVar("DETECTOR_LEAVES_PER_HOUR", 50, 1, MAX_BATCH);
const flushMs = intVar("DETECTOR_FLUSH_SECONDS", 300, 1, 3000) * 1000;

const target = await connect();
const detector = accountFrom("DETECTOR_PRIVATE_KEY");
const relayer = senderFor(target, accountFrom("RELAYER_PRIVATE_KEY"));
if (isAddressEqual(detector.address, relayer.account.address)) throw new Error("DETECTOR_PRIVATE_KEY and RELAYER_PRIVATE_KEY must differ");

const balance = await target.public.getBalance({ address: detector.address });
if (balance > 0n) console.warn(`warning: detector ${detector.address} holds ${formatEther(balance)} ETH; it should hold none and never pays gas`);

const head = await target.public.getBlockNumber();
let next = process.env.DETECTOR_FROM_BLOCK?.trim() ? uintVar("DETECTOR_FROM_BLOCK", 0n) : head;
console.log(
  `detector ${detector.address}, relayer ${relayer.account.address}, chain ${target.chainId}, log ${target.log}, from block ${next}, ` +
    `prefix ${cfg.prefixHex} suffix ${cfg.suffixHex} hex, dust < ${cfg.dustWei} wei or ${cfg.dustTokenUnits} token units, cap ${perHour} leaves/hour`,
);

const memory = new Counterparties();
const batcher = new Batcher(perHour);

async function processBlock(n: bigint): Promise<void> {
  const [block, logs] = await Promise.all([
    target.public.getBlock({ blockNumber: n, includeTransactions: true }),
    target.public.getLogs({ fromBlock: n, toBlock: n, events: watchedEvents, strict: true }),
  ]);
  const watched = logs.map((l): WatchedLog => {
    const base = { address: l.address, transactionHash: l.transactionHash, logIndex: l.logIndex };
    switch (l.eventName) {
      case "Transfer":
        return { ...base, eventName: "Transfer", args: { from: l.args.from, to: l.args.to, value: l.args.value } };
      case "UserOperationEvent":
        return { ...base, eventName: "UserOperationEvent", args: { sender: l.args.sender } };
      case "BeforeExecution":
        return { ...base, eventName: "BeforeExecution", args: {} };
    }
  });
  const txs = block.transactions.map((t) => ({ hash: t.hash, from: t.from, to: t.to, value: t.value }));
  for (const d of scan(transfersIn(n, txs, watched), memory, cfg)) {
    const outcome = batcher.offer(d, block.timestamp);
    console.log(`block ${n}: ${outcome} ${d.subject} (${d.via}) dust ${d.txHash}, ${d.lookalike} imitates ${d.imitates}, receiver ${d.receiver}`);
  }
}

async function flush(): Promise<void> {
  const ds = batcher.take(MAX_BATCH);
  const [latest, nonce] = await Promise.all([
    target.public.getBlock({ blockTag: "latest" }),
    target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "signatureNonce", args: [detector.address] }),
  ]);
  const batch = await signBatch(detector, {
    log: target.log,
    chainId: target.chainId,
    leaves: ds.map((d) => toLeaf(d, target.chainId)),
    deadline: latest.timestamp + DEADLINE_SECONDS,
    nonce,
  });
  const result = await relay(batch, target, relayer);
  if (result.status === "sent") {
    console.log(`relayed ${result.leaves} leaves in ${result.hash} (block ${result.blockNumber}, gas ${result.gasUsed})`);
  } else {
    batcher.release(ds);
    console.warn(`relayer dropped ${ds.length} leaves: ${result.reason}`);
  }
}

let lastFlush = Date.now();
for (;;) {
  try {
    const tip = await target.public.getBlockNumber();
    // shortcut: no reorg handling; a block replaced after processing can leave evidence pointing at a dropped tx. Process at tip minus a few blocks if that shows up.
    while (next <= tip) {
      await processBlock(next);
      next += 1n;
    }
    if (batcher.queued > 0 && Date.now() - lastFlush >= flushMs) {
      lastFlush = Date.now();
      await flush();
    }
  } catch (err) {
    // A failed flush after the take keeps those subjects marked flagged: the batch may have landed.
    console.error(`detector: poll at block ${next} failed, retrying:`, err);
  }
  await sleep(POLL_MS);
}
