// The reader wired to the Snap: one fetch-based RPC for header, proofs and ENS, a switchable leaf
// source, and Snap state for pins and checkpoints. Mirrors dapp/packages/infra/src/evaluate-cli.ts.
import {
  type EthCall,
  type Evaluation,
  type LeafSource,
  type ListEntry,
  type ListOutcome,
  type RpcRequest,
  type VerifiedList,
  acceptList,
  decodeListRecord,
  evaluate,
  resolveListRecord,
  reverseName,
  rpcLeafSource,
  rpcProofSource,
  snapshotLeafSource,
  sync,
} from "@tocsin/reader";
import { type Address, type Hex, getAddress, isHex } from "viem";
import type { Target } from "./decode";
import { LOG, LOG_CHAIN_ID, RECORD_OVERRIDE, type State } from "./state";

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

/** One snapshot per writer from its entry's snapshotURI. A failed fetch makes that writer's source throw, so sync says why. */
async function mirrorSource(entries: readonly ListEntry[]): Promise<LeafSource> {
  const byWriter = new Map<Address, LeafSource>();
  for (const { writer, snapshotURI } of entries) {
    const fail = (cause: unknown) => async (): Promise<never> => {
      throw new Error(`snapshot for ${writer} unavailable`, { cause });
    };
    try {
      if (!snapshotURI) throw new Error("entry has no snapshotURI");
      byWriter.set(getAddress(writer), snapshotLeafSource(await (await fetchWithTimeout(snapshotURI)).text()));
    } catch (error) {
      byWriter.set(getAddress(writer), { getLeaves: fail(error), getAnchorHead: fail(error) });
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

/** The current record and document for the team's name, or undefined when either cannot be fetched (acceptList then reports stale). */
async function fetchList(state: State, call: EthCall): Promise<{ record: Hex; document: unknown } | undefined> {
  const record = RECORD_OVERRIDE || (state.settings.listName ? await resolveListRecord(call, state.settings.listName) : undefined);
  if (!record) return undefined;
  try {
    const { listURI } = decodeListRecord(record);
    return { record, document: await (await fetchWithTimeout(listURI)).json() };
  } catch {
    return undefined; // undecodable record or unreachable document: unverifiable, keep the pin
  }
}

/** Asks before replacing the pinned maintainer. Never applied without a yes. */
export type ConfirmMaintainer = (current: VerifiedList, candidate: VerifiedList) => Promise<boolean>;

/**
 * Resolves and pins the list, proves every listed writer's head through the RPC, syncs leaves from
 * the selected source, and returns the next state. Never throws: failures land in `status.error`.
 */
export async function runSync(state: State, confirm: ConfirmMaintainer): Promise<State> {
  const { settings } = state;
  const request = rpcRequest(settings.rpcUrl);
  const call = ethCall(request);
  const at = Date.now();
  if (!settings.listName && !RECORD_OVERRIDE) return { ...state, status: { ...state.status, at, error: "set the list's ENS name in settings" } };
  try {
    const chainId = await request({ method: "eth_chainId" });
    if (!isHex(chainId) || BigInt(chainId) !== LOG_CHAIN_ID) throw new Error(`the RPC at ${new URL(settings.rpcUrl).host} is not Sepolia (chain ${String(chainId)})`);
    const outcome: ListOutcome = await acceptList({
      kind: "list",
      log: LOG,
      chainId: LOG_CHAIN_ID,
      fetched: await fetchList(state, call),
      ...(state.pinned && { pinned: state.pinned }),
    });
    let pinned = state.pinned;
    let list = outcome.list;
    let declinedRoot = state.status?.declinedRoot;
    let listStatus = outcome.status === "rejected" ? `rejected (${outcome.reason})` : outcome.status;
    if (outcome.status === "accepted") pinned = outcome.list.signed;
    if (outcome.status === "conflict") {
      if (outcome.candidate.root !== declinedRoot && (await confirm(outcome.list, outcome.candidate))) {
        pinned = outcome.candidate.signed;
        list = outcome.candidate;
        declinedRoot = undefined;
        listStatus = "accepted, new maintainer confirmed";
      } else {
        declinedRoot = outcome.candidate.root;
        listStatus = "conflict, new maintainer declined";
      }
    }
    const base = { ...state, ...(pinned && { pinned }) };
    const status = { at, list: listStatus, ...(declinedRoot && { declinedRoot }) };
    if (!list || !("entries" in list.list)) {
      return { ...base, status: { ...status, error: "no verified list for this name yet" } };
    }

    const entries = list.list.entries;
    const leaves =
      settings.leafSource === "snapshot"
        ? await mirrorSource(entries)
        : rpcLeafSource({
            request: settings.leafSource === "custom" ? rpcRequest(settings.customUrl) : request,
            log: LOG,
            fromBlock: settings.fromBlock,
          });
    const checkpoints = { ...state.checkpoints };
    const result = await sync({
      log: LOG,
      writers: entries.map((e) => ({ writer: e.writer })),
      proofs: rpcProofSource({ request }),
      leaves,
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
    return { ...base, checkpoints, sync: result, names, status };
  } catch (error) {
    const msg = error instanceof Error ? (error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message) : String(error);
    return { ...state, status: { ...state.status, at, error: msg } };
  }
}

/** A source switch drops checkpoints so the next sync replays the new source from genesis instead of trusting the old one's tail. */
export const clearCheckpoints = (state: State): State => ({ ...state, checkpoints: {} });

export type Assessment = { target: Target; evaluation: Evaluation };

/** The pinned list re-verified from state. Undefined before the first accepted list. */
export async function pinnedList(state: State): Promise<VerifiedList | undefined> {
  if (!state.pinned) return undefined;
  return (await acceptList({ kind: "list", log: LOG, chainId: LOG_CHAIN_ID, pinned: state.pinned })).list;
}

/** Evaluates each target against the last sync. Undefined when there is nothing to evaluate against yet. */
export async function assess(state: State, targets: readonly Target[], chainId: bigint): Promise<Assessment[] | undefined> {
  const list = await pinnedList(state);
  if (!list || !state.sync) return undefined;
  const sync = state.sync;
  return targets.map((target) => ({
    target,
    evaluation: evaluate({
      subject: target.address,
      context: target.context,
      sync,
      // One default list, marked blocking (spec, Trust lists).
      lists: [{ list, blocking: true }],
      safelists: [],
      logChainId: LOG_CHAIN_ID,
      chainId,
    }),
  }));
}
