// Usage: yarn workspace @tocsin/infra tsx src/seed-append.ts
// Adds flags for writers that already have leaves, which seed.ts and seed-curators.ts refuse to touch:
// a POISONING_FUNDER on lanterndao.eth and a MALICIOUS_DELEGATE on tocsin.eth's manual writer. Each writer
// signs, the relayer submits, and each writer's sequence continues from its onchain value.
// Records every tx under `appends` in curators-manifest.<chainId>.json, and the manual writer's tx and
// subject in seed-manifest.<chainId>.json as well. Skips a batch the manifest already records.
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { type Address, formatEther, isAddressEqual } from "viem";
import { type AppendBatch, appendFlags } from "./append.js";
import { type KeyVar, accountFrom, connect, senderFor } from "./env.js";

const BATCHES: { name: string; key: KeyVar; evidencePrefix: string; flags: AppendBatch["flags"] }[] = [
  { name: "lanterndao.eth", key: "LANTERN_WRITER_PRIVATE_KEY", evidencePrefix: "lanterndao.eth/", flags: [["poisoning-funder-1", 2]] },
  { name: "tocsin.eth", key: "MANUAL_WRITER_PRIVATE_KEY", evidencePrefix: "", flags: [["malicious-delegate-1", 4]] },
];

type AppendRecord = { list: string; writer: Address; tx: string; fromSeq: string; toSeq: string; flags: { label: string; subject: Address; category: number }[] };
type CuratorsManifest = { curators: Record<string, { subjects: Record<string, Address> }>; appends?: AppendRecord[] };
type SeedManifest = { writers: { manual: Address }; subjects: Record<string, Address>; writerSeq: Record<string, string>; txs: unknown[] };

const manifestPath = (name: string, chainId: number) => fileURLToPath(new URL(`../${name}-manifest.${chainId}.json`, import.meta.url));
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T; // SAFETY: files this package wrote
const writeJson = (path: string, value: unknown) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

async function main() {
  const target = await connect();
  const relayerAcct = accountFrom("RELAYER_PRIVATE_KEY");
  const curatorsPath = manifestPath("curators", target.chainId);
  const seedPath = manifestPath("seed", target.chainId);
  const curators = await readJson<CuratorsManifest>(curatorsPath);
  const seed = await readJson<SeedManifest>(seedPath);

  // A batch is one tx, so a recorded label means its whole batch landed. Skipping it lets a failed run resume.
  const batches = BATCHES.map((b) => ({ ...b, account: accountFrom(b.key) })).filter((b) => {
    const done = curators.appends?.find((a) => isAddressEqual(a.writer, b.account.address) && a.flags.some((f) => b.flags.some(([l]) => l === f.label)));
    if (done) console.log(`${b.name}: already appended in ${done.tx}, skipping`);
    else console.log(`${b.name} writer ${b.account.address}: ${b.flags.map(([l, c]) => `${l} (category ${c})`).join(", ")}`);
    return !done;
  });
  if (!batches.length) return console.log("nothing to append");
  const balance = await target.public.getBalance({ address: relayerAcct.address });
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Relayer ${relayerAcct.address} (${formatEther(balance)} ETH) sends ${batches.length} transactions on chain ${target.chainId}. Type SEED to continue: `);
  rl.close();
  if (answer.trim() !== "SEED") throw new Error("aborted");

  const relayer = senderFor(target, relayerAcct);
  let nextCurators = curators;
  let nextSeed = seed;
  for (const b of batches) {
    const r = await appendFlags(target, relayer, b);
    const receipt = await target.public.getTransactionReceipt({ hash: r.hash });
    const costWei = receipt.gasUsed * receipt.effectiveGasPrice;
    console.log(`${b.name}: tx ${r.hash}, writerSeq ${r.fromSeq} -> ${r.toSeq}, gas ${receipt.gasUsed}, cost ${formatEther(costWei)} ETH`);

    const flags = r.leaves.map((l, i) => ({ label: b.flags[i]![0], subject: l.subject, category: l.category }));
    const rec: AppendRecord = { list: b.name, writer: r.writer, tx: r.hash, fromSeq: r.fromSeq.toString(), toSeq: r.toSeq.toString(), flags };
    const subjects = Object.fromEntries(flags.map((f) => [f.label, f.subject]));
    const curator = nextCurators.curators[b.name];
    nextCurators = {
      ...nextCurators,
      curators: curator ? { ...nextCurators.curators, [b.name]: { ...curator, subjects: { ...curator.subjects, ...subjects } } } : nextCurators.curators,
      appends: [...(nextCurators.appends ?? []), rec],
    };
    if (isAddressEqual(r.writer, seed.writers.manual)) {
      nextSeed = {
        ...nextSeed,
        subjects: { ...nextSeed.subjects, ...subjects },
        writerSeq: { ...nextSeed.writerSeq, manual: r.toSeq.toString() },
        txs: [...nextSeed.txs, { batch: `append-${flags.map((f) => f.label).join("+")}`, writer: r.writer, via: "appendSigned", hash: r.hash, leaves: r.leaves.length, gasUsed: receipt.gasUsed.toString(), costWei: costWei.toString() }],
      };
    }
    // Written after each tx so a later failure keeps the record of what already landed.
    await writeJson(curatorsPath, nextCurators);
    if (nextSeed !== seed) await writeJson(seedPath, nextSeed);
  }
  console.log(`manifests written to ${curatorsPath} and ${seedPath}`);
}

main().catch((err) => {
  console.error("seed-append failed:", err);
  process.exit(1);
});
