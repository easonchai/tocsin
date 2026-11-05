// Trust lists and safelists (ERC, Trust lists): document parsing, roots, the
// ListRoot signature, the name-record value, labels, and the reader's accept/pin rules.
import {
  type Address,
  type Hex,
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  isAddressEqual,
  keccak256,
  recoverTypedDataAddress,
  zeroHash,
} from "viem";
import { namehash, normalize } from "viem/ens";

export const LIST_RECORD_KEY = "erc-threat-flag-log.list";
export const SAFELIST_RECORD_KEY = "erc-threat-flag-log.safelist";

export type ListKind = "list" | "safelist";

export type ListEntry = {
  writer: Address;
  weight: number;
  operator: Hex;
  upstream: Hex;
  fromBlock: bigint;
  toBlock: bigint;
  headPin: Hex;
  categories: bigint;
  snapshotURI: string;
};

export type TrustList = {
  log: Address;
  chainId: bigint;
  maintainer: Address;
  version: bigint;
  entries: ListEntry[];
};

export type Safelist = {
  log: Address;
  chainId: bigint;
  maintainer: Address;
  version: bigint;
  subjects: Address[];
};

/** Decoded `abi.encode(root, version, signature, listURI)`. */
export type ListRecord = { root: Hex; version: bigint; signature: Hex; listURI: string };

/** What a host fetches and, once accepted, stores as its pin: the record value and the JSON document. */
export type SignedList = { record: Hex; document: unknown };

export type VerifiedList = {
  kind: ListKind;
  root: Hex;
  version: bigint;
  maintainer: Address;
  listURI: string;
  list: TrustList | Safelist;
  /** ENS name (normalised) to namehash, only labels that hash to an entry's operator or upstream. */
  labels: Record<string, Hex>;
  signed: SignedList;
};

export type RejectReason =
  | "malformed"
  | "wrong-log"
  | "hash-mismatch"
  | "version-mismatch"
  | "bad-signature"
  | "lower-version";

/** `list` is what the reader applies now; `undefined` means nothing for this list name. */
export type ListOutcome =
  | { status: "accepted"; list: VerifiedList }
  | { status: "stale"; list: VerifiedList }
  | { status: "rejected"; reason: RejectReason; list?: VerifiedList }
  | { status: "conflict"; list: VerifiedList; candidate: VerifiedList }
  | { status: "unavailable"; list?: undefined };

const entryComponents = [
  { name: "writer", type: "address" },
  { name: "weight", type: "uint8" },
  { name: "operator", type: "bytes32" },
  { name: "upstream", type: "bytes32" },
  { name: "fromBlock", type: "uint64" },
  { name: "toBlock", type: "uint64" },
  { name: "headPin", type: "bytes32" },
  { name: "categories", type: "uint256" },
  { name: "snapshotURI", type: "string" },
] as const;

const header = [
  { name: "log", type: "address" },
  { name: "chainId", type: "uint64" },
  { name: "maintainer", type: "address" },
  { name: "version", type: "uint64" },
] as const;

const trustListAbi = [
  { type: "tuple", components: [...header, { name: "entries", type: "tuple[]", components: entryComponents }] },
] as const;
const safelistAbi = [{ type: "tuple", components: [...header, { name: "subjects", type: "address[]" }] }] as const;
const recordAbi = [
  { name: "root", type: "bytes32" },
  { name: "version", type: "uint64" },
  { name: "signature", type: "bytes" },
  { name: "listURI", type: "string" },
] as const;

const int = (v: unknown): bigint => {
  if ((typeof v !== "number" && typeof v !== "string") || v === "") throw new Error(`not an integer: ${String(v)}`);
  return BigInt(v);
};
const str = <T extends string = string>(v: unknown): T => {
  if (typeof v !== "string") throw new Error(`not a string: ${String(v)}`);
  return v as T;
};
const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v !== "object" || v === null) throw new Error("not an object");
  return v as Record<string, unknown>;
};
const arr = (v: unknown): unknown[] => {
  if (!Array.isArray(v)) throw new Error("not an array");
  return v;
};

/**
 * Parses the JSON wire form. Integers may be JSON numbers or decimal/hex strings.
 * Address, bytes32 and range checks happen in the ABI encoder, so call `listRoot` before trusting the result.
 */
export function parseList(kind: "list", json: unknown): TrustList;
export function parseList(kind: "safelist", json: unknown): Safelist;
export function parseList(kind: ListKind, json: unknown): TrustList | Safelist;
export function parseList(kind: ListKind, json: unknown): TrustList | Safelist {
  const d = obj(json);
  const head = {
    log: str<Address>(d.log),
    chainId: int(d.chainId),
    maintainer: str<Address>(d.maintainer),
    version: int(d.version),
  };
  if (kind === "safelist") return { ...head, subjects: arr(d.subjects).map(s => str<Address>(s)) };
  return {
    ...head,
    entries: arr(d.entries).map(raw => {
      const e = obj(raw);
      return {
        writer: str<Address>(e.writer),
        weight: Number(int(e.weight)),
        operator: str<Hex>(e.operator),
        upstream: str<Hex>(e.upstream),
        fromBlock: int(e.fromBlock),
        toBlock: int(e.toBlock),
        headPin: str<Hex>(e.headPin),
        categories: int(e.categories),
        snapshotURI: str(e.snapshotURI),
      };
    }),
  };
}

/** `keccak256(abi.encode(list))` over the typed struct, never the JSON bytes. Throws on out-of-range fields. */
export function listRoot(list: TrustList | Safelist): Hex {
  return "entries" in list
    ? keccak256(encodeAbiParameters(trustListAbi, [list]))
    : keccak256(encodeAbiParameters(safelistAbi, [list]));
}

/** EIP-712 `ListRoot(bytes32 root,uint64 version)` in the log's domain (ThreatFlagLog.sol `_buildDomain`). */
export function listRootTypedData(list: TrustList | Safelist, root: Hex) {
  return {
    domain: { name: "ThreatFlagLog", version: "1", chainId: list.chainId, verifyingContract: list.log },
    types: {
      ListRoot: [
        { name: "root", type: "bytes32" },
        { name: "version", type: "uint64" },
      ],
    },
    primaryType: "ListRoot",
    message: { root, version: list.version },
  } as const;
}

export function encodeListRecord(r: ListRecord): Hex {
  return encodeAbiParameters(recordAbi, [r.root, r.version, r.signature, r.listURI]);
}

export function decodeListRecord(value: Hex): ListRecord {
  const [root, version, signature, listURI] = decodeAbiParameters(recordAbi, value);
  return { root, version, signature, listURI };
}

function verifyLabels(labels: unknown, list: TrustList | Safelist): Record<string, Hex> {
  const out: Record<string, Hex> = {};
  if (!("entries" in list) || typeof labels !== "object" || labels === null) return out;
  const known = new Set(
    list.entries.flatMap(e => [e.operator.toLowerCase(), e.upstream.toLowerCase()]).filter(h => h !== zeroHash),
  );
  for (const [name, hash] of Object.entries(labels)) {
    if (typeof hash !== "string") continue;
    let normalized: string;
    try {
      normalized = normalize(name);
    } catch {
      continue; // not a valid ENSIP-15 name
    }
    const h = namehash(normalized);
    if (h === hash.toLowerCase() && known.has(h)) out[normalized] = h;
  }
  return out;
}

type Expected = { kind: ListKind; log: Address; chainId: number | bigint };

async function verify(signed: SignedList, x: Expected): Promise<VerifiedList | RejectReason> {
  let record: ListRecord;
  let list: TrustList | Safelist;
  let root: Hex;
  try {
    record = decodeListRecord(signed.record);
    list = parseList(x.kind, signed.document);
    root = listRoot(list);
  } catch {
    return "malformed";
  }
  if (!isAddressEqual(list.log, x.log) || list.chainId !== BigInt(x.chainId)) return "wrong-log";
  if (root !== record.root.toLowerCase()) return "hash-mismatch";
  if (record.version !== list.version) return "version-mismatch";
  try {
    const signer = await recoverTypedDataAddress({ ...listRootTypedData(list, root), signature: record.signature });
    if (!isAddressEqual(signer, list.maintainer)) return "bad-signature";
  } catch {
    return "bad-signature";
  }
  return {
    kind: x.kind,
    root,
    version: list.version,
    maintainer: getAddress(list.maintainer),
    listURI: record.listURI,
    list,
    labels: verifyLabels(obj(signed.document).labels, list),
    signed,
  };
}

/**
 * Applies the ERC's reader rules for one list name. `fetched` is undefined when the current record
 * could not be verified (unverifiable gateway, failed lookup or fetch). `pinned` is the `signed` value
 * of the last accepted list, which the host stores. On `accepted` the host stores `list.signed`; on
 * `conflict` it stores `candidate.signed` only after the user confirms the new maintainer.
 */
export async function acceptList(input: Expected & { fetched?: SignedList; pinned?: SignedList }): Promise<ListOutcome> {
  let pinned: VerifiedList | undefined;
  if (input.pinned) {
    const v = await verify(input.pinned, input);
    if (typeof v === "string") throw new Error(`stored pin failed verification: ${v}`);
    pinned = v;
  }
  if (!input.fetched) return pinned ? { status: "stale", list: pinned } : { status: "unavailable" };

  const fresh = await verify(input.fetched, input);
  if (typeof fresh === "string") return { status: "rejected", reason: fresh, list: pinned };
  if (!pinned) return { status: "accepted", list: fresh };
  if (!isAddressEqual(fresh.maintainer, pinned.maintainer)) return { status: "conflict", list: pinned, candidate: fresh };
  // Equal version is accepted only as the same list; a different root at the same version counts as a downgrade.
  if (fresh.version < pinned.version || (fresh.version === pinned.version && fresh.root !== pinned.root))
    return { status: "rejected", reason: "lower-version", list: pinned };
  return { status: "accepted", list: fresh };
}

/** Union of writers across the trust lists being applied. Zero resolvable writers is `unavailable` (ERC, rule 8). */
export function resolveWriters(
  outcomes: readonly ListOutcome[],
): { status: "ok"; writers: Address[] } | { status: "unavailable" } {
  const writers = new Set<Address>();
  for (const o of outcomes)
    if (o.list && "entries" in o.list.list) for (const e of o.list.list.entries) writers.add(getAddress(e.writer));
  return writers.size ? { status: "ok", writers: [...writers] } : { status: "unavailable" };
}
