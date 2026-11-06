// Usage: yarn workspace @tocsin/infra mirror [writer ...]
// Demo beat 3. Writes one snapshot per writer to site/mirror/<writer-lowercase>.json, the static host
// that serves site/lists/, in the reader's mirror format (see snapshotLeafSource in @tocsin/reader).
// Writers default to the manual writer and the detector in seed-manifest.<CHAIN_ID>.json (MANIFEST_DIR).
//   LOG_FROM_BLOCK    first block to scan, the log's deployment block; default 0
//   LOG_BLOCK_RANGE   blocks per eth_getLogs call; default 10000
//   MIRROR_DIR        where the snapshots go; default site/mirror
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Address, getAddress, http, isAddress } from "viem";
import { getAppendedLogs } from "@tocsin/reader";
import { threatFlagLogAbi } from "./abi.js";
import { connect, manifestPath, required } from "./env.js";

const mirrorDir = process.env.MIRROR_DIR?.trim();
const MIRROR_DIR = mirrorDir ? pathToFileURL(`${resolve(mirrorDir)}/`) : new URL("../../../../site/mirror/", import.meta.url);

async function writersFromArgs(chainId: number): Promise<Address[]> {
  const args = process.argv.slice(2);
  if (args.length) {
    for (const a of args) if (!isAddress(a, { strict: false })) throw new Error(`not an address: ${a}`);
    return args.map((a) => getAddress(a));
  }
  const path = manifestPath(`seed-manifest.${chainId}.json`);
  const manifest = JSON.parse(await readFile(path, "utf8")) as { writers?: Record<string, unknown> };
  const writers = Object.values(manifest.writers ?? {}).filter((w): w is string => typeof w === "string" && isAddress(w));
  if (!writers.length) throw new Error(`${path} names no writers; pass writer addresses as arguments`);
  return writers.map((w) => getAddress(w));
}

async function main() {
  const target = await connect();
  const request = http(required("RPC_URL"), { timeout: 30_000 })({}).request;
  const fromBlock = BigInt(process.env.LOG_FROM_BLOCK?.trim() || "0");
  const maxBlockRange = BigInt(process.env.LOG_BLOCK_RANGE?.trim() || "10000");
  const toBlock = await target.public.getBlockNumber();
  const writers = await writersFromArgs(target.chainId);
  await mkdir(MIRROR_DIR, { recursive: true });

  for (const writer of writers) {
    const [logs, seq] = await Promise.all([
      getAppendedLogs({ request, log: target.log, writer, fromBlock, toBlock, maxBlockRange }),
      target.public.readContract({ address: target.log, abi: threatFlagLogAbi, functionName: "writerSeq", args: [writer], blockNumber: toBlock }),
    ]);
    // A snapshot that misses leaves fails every reader's replay, so refuse to publish one.
    if (BigInt(logs.length) !== seq) {
      throw new Error(`writer ${writer}: ${logs.length} Appended logs from block ${fromBlock} to ${toBlock}, but writerSeq is ${seq}; is LOG_FROM_BLOCK after the first leaf?`);
    }
    const entries = logs.map((l) => ({ blockNumber: l.blockNumber.toString(), topics: l.topics, data: l.data }));
    const file = new URL(`${writer.toLowerCase()}.json`, MIRROR_DIR);
    await writeFile(file, `${JSON.stringify(entries, null, 2)}\n`);
    console.log(`writer ${writer}: ${entries.length} leaves to block ${toBlock} -> ${fileURLToPath(file)}`);
  }
}

main().catch((err) => {
  console.error("mirror failed:", err);
  process.exit(1);
});
