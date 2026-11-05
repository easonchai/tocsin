// Snap state: settings, the pinned list, checkpoints, and the last sync. snap_manageState holds JSON
// only, so bigints are stored as {"$n":"<decimal>"} and Errors as their message.
import type { Json } from "@metamask/snaps-sdk";
import type { SignedList, SyncResult, WriterCheckpoint } from "@tocsin/reader";
import type { Address, Hex } from "viem";

export type LeafSourceKind = "rpc" | "custom" | "snapshot";

export type Settings = {
  /** Proofs, the header, ENS, and (for `rpc`) leaves. */
  rpcUrl: string;
  /** Team ENS name holding `erc-threat-flag-log.list`. */
  listName: string;
  leafSource: LeafSourceKind;
  /** Leaf RPC for `custom`, for example the lying proxy. */
  customUrl: string;
  /** The log's deployment block, where eth_getLogs scans start. */
  fromBlock: bigint;
};

export type SyncStatus = {
  at: number;
  /** Why the last sync could not run (no list, proof RPC down). */
  error?: string;
  /** acceptList's status for the list name, plus the reject reason. */
  list?: string;
  /** Root of a maintainer change the user declined; not prompted again. */
  declinedRoot?: Hex;
};

export type State = {
  settings: Settings;
  pinned?: SignedList;
  checkpoints: Record<string, WriterCheckpoint>;
  sync?: SyncResult;
  /** Forward-checked ENS names of writers. */
  names: Record<Address, string>;
  status?: SyncStatus;
};

export const LOG: Address = "0xC5616bb2FDCcdD761aa969c5C0dFb3D5c7d93865";
export const LOG_CHAIN_ID = 11155111n;

// Build-time defaults from snap.config.ts.
export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: process.env.TOCSIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  listName: process.env.TOCSIN_LIST_NAME || "",
  leafSource: "rpc",
  customUrl: process.env.TOCSIN_PROXY_URL || "http://127.0.0.1:8550",
  fromBlock: BigInt(process.env.TOCSIN_LOG_FROM_BLOCK || "0"),
};
/** Optional record hex that replaces the ENS lookup, for a rehearsal before the name exists. */
export const RECORD_OVERRIDE = (process.env.TOCSIN_LIST_RECORD || "") as Hex | "";

export function toJson(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) =>
      typeof v === "bigint" ? { $n: v.toString() } : v instanceof Error ? (v.cause instanceof Error ? `${v.message}: ${v.cause.message}` : v.message) : v,
    ),
  ) as Json;
}

export function fromJson<T>(json: Json): T {
  return JSON.parse(JSON.stringify(json), (_k, v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 1 && typeof (v as { $n?: unknown }).$n === "string"
      ? BigInt((v as { $n: string }).$n)
      : v,
  ) as T;
}

export async function loadState(): Promise<State> {
  const raw = await snap.request({ method: "snap_manageState", params: { operation: "get" } });
  if (!raw) return { settings: DEFAULT_SETTINGS, checkpoints: {}, names: {} };
  // SAFETY: only this module writes the state, always through toJson(State).
  const s = fromJson<State>(raw);
  return { ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
}

export async function saveState(state: State): Promise<void> {
  // SAFETY: toJson of an object is an object.
  const newState = toJson(state) as Record<string, Json>;
  await snap.request({ method: "snap_manageState", params: { operation: "update", newState } });
}
