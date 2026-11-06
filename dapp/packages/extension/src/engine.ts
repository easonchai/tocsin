// The reader wired to the extension's transports: Helios for the header, proofs and ENS, a JSON-RPC
// for leaves (routed through the Anon-RPC worker by the harness's fetch shim), and a persisted pin
// and checkpoints. Mirrors dapp/packages/snap/src/engine.ts with a verified proof source.
import {
  type EthCall,
  type ProofSource,
  type RpcRequest,
  type SignedList,
  type SyncResult,
  type VerifiedList,
  type WriterCheckpoint,
  type WriterSync,
  acceptList,
  decodeListRecord,
  evaluate,
  resolveListRecord,
  reverseName,
  rpcLeafSource,
  rpcProofSource,
  sync,
} from "../../reader/src/index.ts";
import { type Address, type Hex, getAddress, isHex } from "viem";
import { LOG_ADDRESS as LOG } from "../../nextjs/utils/harness/anonHelios.ts";
import type { Report, ReportItem, Verdict } from "./report.ts";
import type { Target } from "./targets.ts";

export const LOG_CHAIN_ID = 11155111n;
const TIMEOUT_MS = 20_000;

/** What survives a browser restart: the pin (trust on first use) and the finalized checkpoints. */
export type Persisted = { pinned?: SignedList; checkpoints: Record<string, WriterCheckpoint> };

export type EngineState = {
  persisted: Persisted;
  sync?: SyncResult;
  list?: VerifiedList;
  listStatus?: string;
  names: Record<string, string>;
  error?: string;
};

export type EngineConfig = { listName: string; listRecord: Hex | ""; fromBlock: bigint; transportLabel: string };

export type Transports = {
  /** Sepolia Helios: every answer checked against the light client's verified state. */
  helios: RpcRequest;
  /** Untrusted leaf RPC; sync verifies what it returns against the proven heads. */
  leaves: RpcRequest;
};

// chrome.storage holds JSON, so bigints travel as {"$n":"<decimal>"}.
export const toJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === "bigint" ? { $n: x.toString() } : x)));
export const fromJson = <T>(v: unknown): T =>
  JSON.parse(JSON.stringify(v ?? null), (_k, x: unknown) =>
    typeof x === "object" && x !== null && !Array.isArray(x) && Object.keys(x).length === 1 && typeof (x as { $n?: unknown }).$n === "string"
      ? BigInt((x as { $n: string }).$n)
      : x,
  ) as T;

async function fetchWithTimeout(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch((cause: unknown) => {
    throw new Error(`request to ${new URL(url).host} failed`, { cause });
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res;
}

let rpcId = 0;
/** Plain JSON-RPC over global fetch, so the harness's shim can route it through the worker. */
export function rpcRequest(url: string): RpcRequest {
  return async ({ method, params = [] }) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message ?? "RPC error"}`);
    return body.result;
  };
}

/**
 * The reader's RPC proof source over Helios, minus `unverified`: Helios checks the header against
 * the consensus light client and the storage proof against that header's state root.
 */
function heliosProofSource(request: RpcRequest): ProofSource {
  const base = rpcProofSource({ request });
  return {
    async getProof(log, slots) {
      const { block, values } = await base.getProof(log, slots);
      const { unverified: _dropped, ...verified } = block;
      return { block: verified, values };
    },
  };
}

const ethCall =
  (request: RpcRequest): EthCall =>
  async ({ to, data }) => {
    const out = await request({ method: "eth_call", params: [{ to, data }, "latest"] });
    if (!isHex(out)) throw new Error("eth_call did not return hex");
    return out;
  };

async function fetchList(cfg: EngineConfig, call: EthCall): Promise<SignedList | undefined> {
  const record = cfg.listRecord || (cfg.listName ? await resolveListRecord(call, cfg.listName) : undefined);
  if (!record) return undefined;
  try {
    return { record, document: await (await fetchWithTimeout(decodeListRecord(record).listURI)).json() };
  } catch {
    return undefined; // undecodable record or unreachable document: unverifiable, keep the pin
  }
}

const errorText = (e: unknown): string =>
  e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : String(e);

/**
 * Resolves and pins the list through Helios, proves every listed writer's head, syncs leaves, and
 * returns the next state. Never throws: failures land in `error`, and the previous sync stays.
 * A different maintainer is never accepted here; the extension has no confirm dialog, so the pin holds.
 */
export async function runSync(prev: EngineState, cfg: EngineConfig, t: Transports): Promise<EngineState> {
  if (!cfg.listName && !cfg.listRecord) return { ...prev, error: "no list name was set when this extension was built (TOCSIN_LIST_NAME)" };
  try {
    const call = ethCall(t.helios);
    const outcome = await acceptList({
      kind: "list",
      log: LOG,
      chainId: LOG_CHAIN_ID,
      fetched: await fetchList(cfg, call),
      ...(prev.persisted.pinned && { pinned: prev.persisted.pinned }),
    });
    const listStatus =
      outcome.status === "rejected"
        ? `rejected (${outcome.reason})`
        : outcome.status === "conflict"
          ? "a different maintainer signed a new version; keeping your pinned list"
          : outcome.status;
    const list = outcome.list;
    const pinned = outcome.status === "accepted" ? outcome.list.signed : prev.persisted.pinned;
    if (!list || !("entries" in list.list)) {
      return { ...prev, persisted: { ...prev.persisted, ...(pinned && { pinned }) }, listStatus, error: "no verified list for this name yet" };
    }
    const checkpoints = { ...prev.persisted.checkpoints };
    const result = await sync({
      log: LOG,
      writers: list.list.entries.map((e) => ({ writer: e.writer })),
      proofs: heliosProofSource(t.helios),
      leaves: rpcLeafSource({ request: t.leaves, log: LOG, fromBlock: cfg.fromBlock }),
      checkpoints: {
        get: async (k) => checkpoints[k],
        set: async (k, v) => {
          checkpoints[k] = v;
        },
      },
    });
    const names: Record<string, string> = {};
    await Promise.all(
      Object.keys(result.writers).map(async (w) => {
        const name = await reverseName(call, getAddress(w)).catch(() => undefined);
        if (name) names[getAddress(w)] = name;
      }),
    );
    return { persisted: { checkpoints, ...(pinned && { pinned }) }, sync: result, list, listStatus, names };
  } catch (error) {
    return { ...prev, error: errorText(error) };
  }
}

const CATEGORY: Record<number, string> = {
  1: "Poisoning operator",
  2: "Poisoning funder",
  3: "Drainer receiver",
  4: "Malicious delegate",
  5: "Malicious token",
  6: "Paid lookalike",
  7: "Drainer spender",
  8: "Theft proceeds",
};
const categoryName = (c: number): string => CATEGORY[c] ?? `Writer-defined category ${c}`;
const short = (a: string): string => `${a.slice(0, 6)}...${a.slice(-4)}`;

function whyUnavailable(s: WriterSync | undefined): string {
  if (!s) return "not synced yet";
  if (s.status === "synced") return `synced to sequence ${s.seq}`;
  if (s.divergedAt !== undefined) return `unverifiable, the leaf source disagrees with the chain at sequence ${s.divergedAt}`;
  return `unverifiable, the leaf source failed${s.error instanceof Error ? `: ${s.error.message}` : ""}`;
}

const RANK: Record<Verdict, number> = { clean: 0, unavailable: 1, warn: 2, block: 3 };

/** One report for every target of a held request, against the last sync. */
export function buildReport(state: EngineState, targets: readonly Target[], chainId: bigint | undefined, cfg: EngineConfig): Report {
  const { sync: last, list } = state;
  if (!last || !list) {
    return { verdict: "unavailable", reason: state.error ?? "Tocsin has not finished its first sync.", items: [], unavailable: [], trust: "No sync result to check against." };
  }
  const label = (w: Address): string => state.names[w] ?? short(w);
  const evaluations = targets.map((target) => ({
    target,
    evaluation: evaluate({
      subject: target.address,
      context: target.context,
      sync: last,
      lists: [{ list, blocking: true }], // one default list, marked blocking (spec, Trust lists)
      safelists: [],
      logChainId: LOG_CHAIN_ID,
      ...(chainId !== undefined && { chainId }),
    }),
  }));
  const verdict = evaluations.reduce<Verdict>((v, e) => (RANK[e.evaluation.verdict] > RANK[v] ? e.evaluation.verdict : v), "clean");
  const items: ReportItem[] = evaluations.map(({ target, evaluation }) => ({
    why: target.why,
    address: target.address,
    verdict: evaluation.verdict,
    findings: evaluation.findings.map((f) => ({ writer: label(f.writer), category: categoryName(f.category), evidence: f.evidence })),
  }));
  const writers = [...new Set(evaluations.flatMap((e) => e.evaluation.unavailable))];
  const listName = cfg.listName || "the configured record";
  const stale = state.error ? ` The last sync failed (${state.error}); this uses the sync before it.` : "";
  return {
    verdict,
    items,
    unavailable: writers.map((w) => ({ writer: label(w), why: whyUnavailable(last.writers[w]) })),
    trust:
      `Synced at block ${last.block.number}${last.block.unverified ? ", header unverified" : ", header and proofs verified by the Helios light client"}. ` +
      `RPC traffic ${cfg.transportLabel}. List ${listName}, maintainer ${short(list.maintainer)}, version ${list.version}, ${state.listStatus ?? "pinned"}.${stale}`,
  };
}
