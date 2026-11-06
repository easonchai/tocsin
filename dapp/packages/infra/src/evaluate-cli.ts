// Usage: yarn workspace @tocsin/infra eval <address> --source rpc|proxy|mirror [--context recipient|spender|delegate|incomingSender|token]
// The three demo beats at the command line. Loads the signed default list, proves every listed
// writer's head and sequence through RPC_URL, syncs their leaves through the chosen source, and
// evaluates the address on this machine.
//   rpc     leaves from RPC_URL over eth_getLogs
//   proxy   leaves from PROXY_URL (default http://127.0.0.1:8550, the lying proxy)
//   mirror  leaves from each list entry's snapshotURI (http(s) or file://)
// Proofs always come from RPC_URL, so the header is an unverified RPC header in every mode.
//   LIST_RECORD       the list's ENS record value (hex), as `publish-list sign` prints it
//   LIST_DOCUMENT     path to the list document; default site/lists/default.json
//   LOG_FROM_BLOCK    first block to scan, the log's deployment block; default 0
//   LOG_BLOCK_RANGE   blocks per eth_getLogs call; default 10000
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type Context,
  type LeafSource,
  type SyncResult,
  acceptList,
  evaluate,
  snapshotLeafSource,
  sync,
  type RpcRequest,
  rpcLeafSource,
  rpcProofSource,
} from "@tocsin/reader";
import { type Address, type Hex, getAddress, http, isAddress, isHex } from "viem";
import { connect, required } from "./env.js";

const SOURCES = ["rpc", "proxy", "mirror"] as const;
type Source = (typeof SOURCES)[number];
const CONTEXTS: readonly Context[] = ["recipient", "spender", "delegate", "incomingSender", "token"];

const CATEGORY: Record<number, string> = {
  1: "POISONING_OPERATOR",
  2: "POISONING_FUNDER",
  3: "DRAINER_RECEIVER",
  4: "MALICIOUS_DELEGATE",
  5: "MALICIOUS_TOKEN",
  6: "PAID_LOOKALIKE",
  7: "DRAINER_SPENDER",
  8: "THEFT_PROCEEDS",
};

function parseArgs(argv: string[]): { subject: Address; source: Source; context: Context } {
  const usage = "usage: eval <address> --source rpc|proxy|mirror [--context recipient|spender|delegate|incomingSender|token]";
  let subject: string | undefined;
  let source: string | undefined;
  let context = "recipient";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--source") source = argv[++i];
    else if (a === "--context") context = argv[++i] ?? "";
    else if (!subject) subject = a;
    else throw new Error(usage);
  }
  if (!subject || !isAddress(subject, { strict: false })) throw new Error(usage);
  if (!SOURCES.includes(source as Source)) throw new Error(usage);
  if (!CONTEXTS.includes(context as Context)) throw new Error(usage);
  // SAFETY: both checked against their literal lists on the lines above.
  return { subject: getAddress(subject), source: source as Source, context: context as Context };
}

const rpc = (url: string): RpcRequest => http(url, { timeout: 30_000, retryCount: 0 })({}).request;

async function fetchText(uri: string): Promise<string> {
  if (uri.startsWith("file:")) return readFile(fileURLToPath(uri), "utf8");
  const res = await fetch(uri, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GET ${uri}: HTTP ${res.status}`);
  return res.text();
}

/** One snapshot per writer. A writer whose snapshot cannot be fetched gets a source that throws, so sync reports why. */
async function mirrorSource(entries: readonly { writer: Address; snapshotURI: string }[]): Promise<LeafSource> {
  const byWriter = new Map<Address, LeafSource>();
  for (const { writer, snapshotURI } of entries) {
    const w = getAddress(writer);
    try {
      byWriter.set(w, snapshotLeafSource(await fetchText(snapshotURI)));
    } catch (error) {
      const fail = async (): Promise<never> => {
        throw new Error(`snapshot ${snapshotURI} unavailable`, { cause: error });
      };
      byWriter.set(w, { getLeaves: fail, getAnchorHead: fail });
    }
  }
  const of = (w: Address): LeafSource => {
    const s = byWriter.get(getAddress(w));
    if (!s) throw new Error(`no snapshot for writer ${w}`);
    return s;
  };
  return {
    getLeaves: (w, fromSeq, toBlock) => of(w).getLeaves(w, fromSeq, toBlock),
    getAnchorHead: (w, seq) => of(w).getAnchorHead(w, seq),
  };
}

function why(s: SyncResult["writers"][Address]): string {
  if (s.status === "synced") return `synced to sequence ${s.seq}`;
  if (s.divergedAt !== undefined) return `unavailable, chain mismatch at sequence ${s.divergedAt}`;
  const cause = s.error instanceof Error ? `${s.error.message}${s.error.cause instanceof Error ? `: ${s.error.cause.message}` : ""}` : String(s.error);
  return `unavailable, source failed: ${cause}`;
}

async function main() {
  const { subject, source, context } = parseArgs(process.argv.slice(2));
  const target = await connect();
  const proofsRpc = rpc(required("RPC_URL"));
  const fromBlock = BigInt(process.env.LOG_FROM_BLOCK?.trim() || "0");
  const maxBlockRange = BigInt(process.env.LOG_BLOCK_RANGE?.trim() || "10000");

  // The list: the signed document on disk plus the record value. No ENS lookup here (ticket 08).
  const docPath = process.env.LIST_DOCUMENT?.trim() || fileURLToPath(new URL("../../../../site/lists/default.json", import.meta.url));
  const record = required("LIST_RECORD");
  if (!isHex(record)) throw new Error("LIST_RECORD must be the hex record value from `publish-list sign`");
  const document: unknown = JSON.parse(await readFile(docPath, "utf8"));
  const outcome = await acceptList({ kind: "list", log: target.log, chainId: target.chainId, fetched: { record: record as Hex, document } });
  if (outcome.status !== "accepted") throw new Error(`list ${docPath} not accepted: ${outcome.status}${"reason" in outcome ? ` (${outcome.reason})` : ""}`);
  const list = outcome.list;
  if (!("entries" in list.list)) throw new Error(`${docPath} is a safelist, not a trust list`);
  const entries = list.list.entries;
  console.log(`list     ${docPath}, record from LIST_RECORD: version ${list.version}, maintainer ${list.maintainer}, signature checked`);

  const leaves =
    source === "mirror"
      ? await mirrorSource(entries)
      : rpcLeafSource({
          request: source === "rpc" ? proofsRpc : rpc(process.env.PROXY_URL?.trim() || "http://127.0.0.1:8550"),
          log: target.log,
          fromBlock,
          maxBlockRange,
        });
  const result = await sync({
    log: target.log,
    writers: entries.map((e) => ({ writer: e.writer })),
    proofs: rpcProofSource({ request: proofsRpc }),
    leaves,
    // In memory: every run syncs from genesis, so no earlier run's checkpoint can mask a lie.
    checkpoints: { get: async () => undefined, set: async () => {} },
  });
  const { block } = result;
  console.log(`header   block ${block.number} ${block.hash}, ${block.unverified ? "from RPC_URL, unverified (no light-client check)" : "verified"}, ${block.finalized ? "finalized" : "not finalized"}`);
  console.log(`source   ${source === "mirror" ? "mirror, each entry's snapshotURI" : source === "proxy" ? "PROXY_URL over eth_getLogs" : "RPC_URL over eth_getLogs"}`);
  for (const s of Object.values(result.writers)) console.log(`writer   ${s.writer} ${why(s)}`);

  const ev = evaluate({ subject, context, sync: result, lists: [{ list, blocking: true }], safelists: [], logChainId: BigInt(target.chainId) });
  console.log(`subject  ${ev.subject} as ${context}`);
  if (ev.verdict === "unavailable") {
    const reasons = ev.unavailable.map((w) => `${why(result.writers[w]!)} (writer ${w})`);
    console.log(`verdict  ${reasons.length ? reasons.join("; ") : "unavailable, no listed writer applies"}`);
  } else {
    console.log(`verdict  ${ev.verdict}`);
  }
  for (const f of ev.findings) {
    console.log(`  writer ${f.writer}, category ${f.category} ${CATEGORY[f.category] ?? "noisy"}, evidence ${f.evidence}, weight ${f.weight}, sequence ${f.leaf.writerSeq}, block ${f.leaf.blockNumber}`);
  }
  if (ev.verdict !== "unavailable" && ev.unavailable.length) console.log(`  also unavailable: ${ev.unavailable.join(", ")}`);
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(1);
});
