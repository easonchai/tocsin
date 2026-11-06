// Snap state: the RPC, the lists, checkpoints, and the last sync. snap_manageState holds JSON only,
// so bigints are stored as {"$n":"<decimal>"} and Errors as their message. Nothing about an
// evaluated address is ever stored (snap-ui spec, section 7).
import type { Json } from "@metamask/snaps-sdk";
import type { SignedList, SyncResult, WriterCheckpoint } from "@tocsin/reader";
import type { Address, Hex } from "viem";

export type Settings = {
  /** Header, proofs, ENS and leaves all come from this one RPC. */
  rpcUrl: string;
};

/** The home page's Policy section (snap-ui spec 5.3). */
export type SnapPolicy = {
  threshold: 1 | 2;
  /** Categories that warn and never block. */
  warnOnly: number[];
  /** Evaluate approve, permit and setApprovalForAll spenders. */
  checkApprovals: boolean;
};

/** POISONING_FUNDER and THEFT_PROCEEDS warn, everything else blocks on two independent writers. */
export const DEFAULT_POLICY: SnapPolicy = { threshold: 2, warnOnly: [2, 8], checkApprovals: true };

export type SyncStatus = {
  at: number;
  /** Why the last sync could not run (no list, RPC down). */
  error?: string;
};

/** One list name. Kept while unfollowed, so following it again keeps the first-use pin. */
export type ListState = {
  followed: boolean;
  pinned?: SignedList;
  /** A list signed by a new maintainer. The list is excluded until the user accepts it on the home page. */
  pending?: SignedList;
  /** acceptList's status at the last sync, plus the reject reason. */
  status?: string;
};

/** The last sync where every writer synced. Shown when the current one is unverifiable. */
export type LastGood = { flags: number; writers: number; block: bigint; at: number };

export type State = {
  settings: Settings;
  policy: SnapPolicy;
  lists: Record<string, ListState>;
  checkpoints: Record<string, WriterCheckpoint>;
  sync?: SyncResult;
  /** When `sync` was taken. */
  syncedAt?: number;
  lastGood?: LastGood;
  /** Forward-checked ENS names of writers. */
  names: Record<Address, string>;
  status?: SyncStatus;
  /** Start of the running sync. Panels show "updating…" while it is recent. */
  syncingSince?: number;
};

export const LOG: Address = "0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14";
export const LOG_CHAIN_ID = 11155111n;
/** The log's deployment block, where eth_getLogs scans start. Build-time only. */
export const FROM_BLOCK = BigInt(process.env.TOCSIN_LOG_FROM_BLOCK || "0");

const csv = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const DEFAULT_LISTS = csv(process.env.TOCSIN_LIST_NAME);

export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: process.env.TOCSIN_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
};
/**
 * Record hex per name that replaces the ENS lookup, for a rehearsal before the name exists:
 * `TOCSIN_LIST_RECORDS=a.eth=0x…,b.eth=0x…`, and `TOCSIN_LIST_RECORD` for the first default name.
 */
export const RECORD_OVERRIDES: Record<string, Hex> = Object.fromEntries([
  ...(DEFAULT_LISTS[0] && process.env.TOCSIN_LIST_RECORD ? [[DEFAULT_LISTS[0], process.env.TOCSIN_LIST_RECORD]] : []),
  ...csv(process.env.TOCSIN_LIST_RECORDS).map((pair) => pair.split("=").map((x) => x.trim())),
]);

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
  const fresh: State = {
    settings: DEFAULT_SETTINGS,
    policy: DEFAULT_POLICY,
    lists: Object.fromEntries(DEFAULT_LISTS.map((n) => [n, { followed: true }])),
    checkpoints: {},
    names: {},
  };
  if (!raw) return fresh;
  // SAFETY: only this module writes the state, always through toJson(State). Earlier builds had no
  // `followed` flag; their lists were all applied.
  const s = fromJson<State>(raw);
  const lists = Object.fromEntries(Object.entries(s.lists ?? fresh.lists).map(([n, l]) => [n, { ...l, followed: l.followed ?? true }]));
  return { ...fresh, ...s, policy: { ...DEFAULT_POLICY, ...s.policy }, settings: { ...DEFAULT_SETTINGS, rpcUrl: s.settings?.rpcUrl ?? DEFAULT_SETTINGS.rpcUrl }, lists };
}

export async function saveState(state: State): Promise<void> {
  // SAFETY: toJson of an object is an object.
  const newState = toJson(state) as Record<string, Json>;
  await snap.request({ method: "snap_manageState", params: { operation: "update", newState } });
}
