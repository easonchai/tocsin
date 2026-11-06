// The reader wired to the Snap: one fetch-based RPC for header, proofs, ENS and leaves, and Snap
// state for pins and checkpoints. Mirrors dapp/packages/infra/src/evaluate-cli.ts.
import {
  type EthCall,
  type Evaluation,
  type RpcRequest,
  type SyncResult,
  type VerifiedList,
  acceptList,
  decodeListRecord,
  evaluate,
  resolveListRecord,
  reverseName,
  rpcLeafSource,
  rpcProofSource,
  sync,
} from "@tocsin/reader";
import { type Hex, getAddress, isHex } from "viem";
import type { Target } from "./decode";
import { FROM_BLOCK, LOG, LOG_CHAIN_ID, type ListState, RECORD_OVERRIDES, type State } from "./state";

const TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
  } catch (error) {
    throw new Error(`request to ${new URL(url).host} failed`, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

let rpcId = 0;
/** A plain JSON-RPC client over the Snap's fetch (endowment:network-access). */
export function rpcRequest(url: string): RpcRequest {
  return async ({ method, params = [] }) => {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message ?? "RPC error"}`);
    return body.result;
  };
}

const ethCall = (request: RpcRequest): EthCall => async ({ to, data }) => {
  const out = await request({ method: "eth_call", params: [{ to, data }, "latest"] });
  if (!isHex(out)) throw new Error("eth_call did not return hex");
  return out;
};

/** The current record and document for a list name, or undefined when either cannot be fetched (acceptList then reports stale). */
async function fetchList(name: string, call: EthCall): Promise<{ record: Hex; document: unknown } | undefined> {
  const record = RECORD_OVERRIDES[name] ?? (await resolveListRecord(call, name));
  if (!record) return undefined;
  try {
    const { listURI } = decodeListRecord(record);
    return { record, document: await (await fetchWithTimeout(listURI)).json() };
  } catch {
    return undefined; // undecodable record or unreachable document: unverifiable, keep the pin
  }
}


type Usable = { next: ListState; list?: VerifiedList };

/**
 * Applies acceptList's pinning to one list name. A list signed by a new maintainer is held in
 * `pending` and the list is excluded until the user accepts it on the home page; no dialog here,
 * so a cron tick never interrupts the user.
 */
async function syncList(name: string, prev: ListState, call: EthCall): Promise<Usable> {
  const outcome = await acceptList({
    kind: "list",
    log: LOG,
    chainId: LOG_CHAIN_ID,
    fetched: await fetchList(name, call),
    ...(prev.pinned && { pinned: prev.pinned }),
  });
  if (outcome.status === "conflict") return { next: { ...prev, pending: outcome.candidate.signed, status: "maintainer changed" } };
  const { pending: _, ...rest } = prev;
  const next: ListState = {
    ...rest,
    status: outcome.status === "rejected" ? `rejected (${outcome.reason})` : outcome.status,
    ...(outcome.status === "accepted" && { pinned: outcome.list.signed }),
  };
  return { next, ...(outcome.list && "entries" in outcome.list.list && { list: outcome.list }) };
}

/** Live and dead FLAG leaves across synced writers: what "N flags" means on screen. */
export const flagCount = (sync: SyncResult): number =>
  Object.values(sync.writers).reduce((n, w) => n + (w.status === "synced" ? w.leaves.filter((l) => l.leaf.op === 0).length : 0), 0);

export const errorText = (error: unknown): string =>
  error instanceof Error ? (error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message) : String(error);

/**
 * Resolves and pins every followed list, proves every listed writer's head through the RPC in one
 * call, syncs leaves from the same RPC, and returns the next state. Never throws: failures land in
 * `status.error`.
 */
export async function runSync(state: State): Promise<State> {
  const { rpcUrl } = state.settings;
  const request = rpcRequest(rpcUrl);
  const call = ethCall(request);
  const at = Date.now();
  const followed = Object.keys(state.lists).filter((n) => state.lists[n]!.followed);
  if (followed.length === 0) return { ...state, status: { at, error: "follow at least one list" } };
  try {
    const chainId = await request({ method: "eth_chainId" });
    if (!isHex(chainId) || BigInt(chainId) !== LOG_CHAIN_ID) throw new Error(`the RPC at ${new URL(rpcUrl).host} is not Sepolia (chain ${String(chainId)})`);
    const lists = { ...state.lists };
    const verified: VerifiedList[] = [];
    for (const name of followed) {
      const { next, list } = await syncList(name, lists[name]!, call);
      lists[name] = next;
      if (list) verified.push(list);
    }
    const base = { ...state, lists };
    if (verified.length === 0) return { ...base, status: { at, error: "no usable list for the followed names yet" } };

    // A writer on two lists is proved and synced once.
    const writers = [...new Set(verified.flatMap((l) => ("entries" in l.list ? l.list.entries.map((e) => getAddress(e.writer)) : [])))];
    const checkpoints = { ...state.checkpoints };
    const result = await sync({
      log: LOG,
      writers: writers.map((writer) => ({ writer })),
      proofs: rpcProofSource({ request }),
      leaves: rpcLeafSource({ request, log: LOG, fromBlock: FROM_BLOCK }),
      checkpoints: {
        get: async (k) => checkpoints[k],
        set: async (k, v) => {
          checkpoints[k] = v;
        },
      },
    });
    const names = { ...state.names };
    await Promise.all(
      Object.keys(result.writers).map(async (w) => {
        const name = await reverseName(call, getAddress(w));
        if (name) names[getAddress(w)] = name;
        else delete names[getAddress(w)];
      }),
    );
    const all = Object.values(result.writers);
    const lastGood = all.every((w) => w.status === "synced")
      ? { flags: flagCount(result), writers: all.length, block: result.block.number, at }
      : state.lastGood;
    return { ...base, checkpoints, sync: result, syncedAt: at, names, status: { at }, ...(lastGood && { lastGood }) };
  } catch (error) {
    return { ...state, status: { at, error: errorText(error) } };
  }
}

/** A changed RPC drops checkpoints so the next sync replays the new source from genesis instead of trusting the old one's tail. */
export const clearCheckpoints = (state: State): State => ({ ...state, checkpoints: {} });

/** A list a user is about to add: fetched and verified, not pinned yet. */
export async function fetchCandidate(state: State, name: string): Promise<VerifiedList | string> {
  try {
    const outcome = await acceptList({ kind: "list", log: LOG, chainId: LOG_CHAIN_ID, fetched: await fetchList(name, ethCall(rpcRequest(state.settings.rpcUrl))) });
    if (outcome.status === "accepted" && "entries" in outcome.list.list) return outcome.list;
    return outcome.status === "rejected" ? `The list at ${name} failed verification (${outcome.reason}).` : `No Tocsin list found at ${name}.`;
  } catch (error) {
    return `Could not read ${name}: ${errorText(error)}.`;
  }
}

/** Every finding's list name, in `evaluation.findings` order. */
export type Assessment = { target: Target; evaluation: Evaluation; listOf: string[] };

export type NamedList = { name: string; list: VerifiedList };

/** Followed lists with an accepted pin and no pending maintainer change, re-verified from state. */
export async function pinnedLists(state: State): Promise<NamedList[]> {
  const out: NamedList[] = [];
  for (const [name, l] of Object.entries(state.lists)) {
    if (!l.followed || !l.pinned || l.pending) continue;
    const { list } = await acceptList({ kind: "list", log: LOG, chainId: LOG_CHAIN_ID, pinned: l.pinned });
    if (list && "entries" in list.list) out.push({ name, list });
  }
  return out;
}

/** The verified list a pin holds, for showing its maintainer and writers. */
export async function verifiedPin(pinned: ListState["pinned"]): Promise<VerifiedList | undefined> {
  if (!pinned) return undefined;
  return (await acceptList({ kind: "list", log: LOG, chainId: LOG_CHAIN_ID, pinned }).catch(() => undefined))?.list;
}

/** Evaluates each target against the last sync under the user's policy. Undefined when there is nothing to evaluate against yet. */
export async function assess(state: State, targets: readonly Target[], chainId: bigint): Promise<Assessment[] | undefined> {
  const lists = await pinnedLists(state);
  if (lists.length === 0 || !state.sync) return undefined;
  const sync = state.sync;
  const { threshold, warnOnly, checkApprovals } = state.policy;
  return targets.filter((t) => checkApprovals || t.context !== "spender").map((target) => {
    const evaluation = evaluate({
      subject: target.address,
      context: target.context,
      sync,
      // Every followed list is marked blocking (spec, Trust lists); escalation is OR across them.
      lists: lists.map(({ list }) => ({ list, blocking: true })),
      safelists: [],
      logChainId: LOG_CHAIN_ID,
      chainId,
      policy: { threshold, warnOnly },
    });
    const listOf = evaluation.findings.map((f) => lists.find((l) => l.list === f.list)?.name ?? "");
    return { target, evaluation, listOf };
  });
}
