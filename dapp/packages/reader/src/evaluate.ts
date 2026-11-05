import { type Address, type Hex, getAddress, isAddressEqual, size, zeroHash } from "viem";
import type { ListEntry, VerifiedList } from "./lists";
import type { Leaf, SyncResult, VerifiedLeaf } from "./types";

export type Context = "recipient" | "spender" | "delegate" | "incomingSender";
export type Verdict = "clean" | "warn" | "block" | "unavailable";

/** A trust list the host applies, and whether the host marked it as blocking (ERC, Reader policy, rule 2). */
export type AppliedList = { list: VerifiedList; blocking: boolean };

export type EvaluateInput = {
  subject: Address;
  context: Context;
  /** The host's own account code, read through the verified state root (rule 9). */
  ownCode?: Hex;
  /** One sync result, reused across every evaluate call until the next sync. */
  sync: SyncResult;
  /** `ListOutcome.list` of each trust list, with the host's blocking flag. */
  lists: readonly AppliedList[];
  /** `ListOutcome.list` of each pinned safelist. */
  safelists: readonly VerifiedList[];
  /** The chain the log is deployed on. */
  logChainId: bigint;
  /** The chain the subject is used on. Defaults to `logChainId`. */
  chainId?: bigint;
};

/** One live `FLAG` leaf that applied to the subject under one list entry. */
export type Finding = {
  writer: Address;
  category: number;
  evidence: Hex;
  leaf: VerifiedLeaf;
  list: VerifiedList;
  weight: number;
  /** `COUNTER` leaves against this flag from independent listed writers (rule 7). */
  counters: VerifiedLeaf[];
};

export type Evaluation = {
  /** Includes `ownDelegate`'s verdict when that is worse. */
  verdict: Verdict;
  subject: Address;
  context: Context;
  findings: Finding[];
  /** Each applied trust list's own verdict before the safelist cap. Escalation is OR across them (rule 5). */
  lists: { list: VerifiedList; verdict: "clean" | "warn" | "block" }[];
  /** Safelists that name the subject, capping it at `warn` (rule 4). */
  safelistedBy: VerifiedList[];
  /** The subject's own `DISPUTE` leaves. Presentation only (rule 6). */
  disputes: VerifiedLeaf[];
  /** Pinned writers whose leaves are unavailable (rule 8). */
  unavailable: Address[];
  /** Rule 9: the delegate behind an `0xef0100` designator in `ownCode`, evaluated as a category 4 subject. */
  ownDelegate?: Evaluation;
};

const FLAG = 0;
const TOMBSTONE = 1;
const COUNTER = 2;
const DISPUTE = 3;

/** ERC, Leaf: categories whose `chainId = 0` means every chain. */
const ANY_CHAIN = new Set([1, 2, 6, 8]);

/**
 * Which categories apply in each context, from each category's subject in the ERC's Categories
 * table. Noisy categories (128 to 255) are writer-defined, so they apply in every context once a
 * list entry sets their bit. Reserved categories 9 to 127 apply nowhere.
 */
const CONTEXT_CATEGORIES: Record<Context, ReadonlySet<number>> = {
  // Anything a victim pays: poisoners, their funders, drainer receivers and spenders, paid lookalikes, theft proceeds.
  recipient: new Set([1, 2, 3, 6, 7, 8]),
  // Approvals and permits.
  spender: new Set([3, 7]),
  // EIP-7702 authorizations and the account's own delegate.
  delegate: new Set([4]),
  // Activity list: the incoming `tx.from` and the token contract.
  incomingSender: new Set([1, 3, 5, 6, 8]),
};

const RANK: Record<Verdict, number> = { clean: 0, unavailable: 1, warn: 2, block: 3 };
const worse = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);

type Index = {
  /** FLAG and DISPUTE leaves by checksummed subject. */
  bySubject: Map<Address, VerifiedLeaf[]>;
  /** TOMBSTONE and COUNTER leaves by lowercase `refLeaf`. */
  byRef: Map<Hex, VerifiedLeaf[]>;
  /** Every leaf by its recomputed `writerHead`, for head pins. */
  byHead: Map<Hex, VerifiedLeaf>;
};

// Built once per sync result, so evaluate costs only the subject's leaves.
const indexes = new WeakMap<SyncResult, Index>();

function indexOf(sync: SyncResult): Index {
  const cached = indexes.get(sync);
  if (cached) return cached;
  const idx: Index = { bySubject: new Map(), byRef: new Map(), byHead: new Map() };
  const push = <K>(m: Map<K, VerifiedLeaf[]>, k: K, l: VerifiedLeaf) => m.set(k, [...(m.get(k) ?? []), l]);
  for (const w of Object.values(sync.writers)) {
    if (w.status !== "synced") continue;
    for (const raw of w.leaves) {
      // The source's writer spelling is untrusted; sync checked it equals `w.writer`.
      const l = raw.writer === w.writer ? raw : { ...raw, writer: w.writer };
      idx.byHead.set(l.writerHead.toLowerCase() as Hex, l);
      if (l.leaf.op === FLAG || l.leaf.op === DISPUTE) push(idx.bySubject, getAddress(l.leaf.subject), l);
      else push(idx.byRef, l.leaf.refLeaf.toLowerCase() as Hex, l);
    }
  }
  indexes.set(sync, idx);
  return idx;
}

/** Bit i trusts category i; bit 0 trusts 1 to 127; noisy categories need their own bit. */
const trusts = (categories: bigint, c: number): boolean =>
  c >= 1 && c <= 255 && (((categories >> BigInt(c)) & 1n) === 1n || (c <= 127 && (categories & 1n) === 1n));

const appliesOn = (l: Leaf, chainId: bigint, logChainId: bigint): boolean =>
  l.chainId === chainId || (l.chainId === 0n && (ANY_CHAIN.has(l.category) || chainId === logChainId));

/** The entry's leaf filter (block range and head pin), or undefined when its head pin matches no leaf. */
function windowOf(e: ListEntry, writer: Address, idx: Index): ((l: VerifiedLeaf) => boolean) | undefined {
  let maxSeq: bigint | undefined;
  if (e.headPin !== zeroHash) {
    const pinned = idx.byHead.get(e.headPin.toLowerCase() as Hex);
    if (!pinned || pinned.writer !== writer) return undefined;
    maxSeq = pinned.writerSeq;
  }
  return l =>
    (maxSeq === undefined || l.writerSeq <= maxSeq) &&
    l.blockNumber >= e.fromBlock &&
    (e.toBlock === 0n || l.blockNumber <= e.toBlock);
}

/**
 * Entries sharing a writer, an operator, or a non-zero upstream are one writer when counting
 * independent writers. Returns a group id per entry index.
 */
function groups(entries: readonly ListEntry[]): number[] {
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<string, number>();
  entries.forEach((e, i) => {
    const keys = [`w${getAddress(e.writer)}`, `o${e.operator.toLowerCase()}`];
    if (e.upstream !== zeroHash) keys.push(`u${e.upstream.toLowerCase()}`);
    for (const k of keys) {
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  return entries.map((_, i) => find(i));
}

/**
 * Evaluates one subject in one context against the synced leaves and the applied lists.
 *
 * Policy: the ERC's recommended Reader policy, rules 1 to 9, with no extensions. Where the ERC
 * leaves a choice open, this reader:
 * - counts a weight-0 entry toward warnings only, never toward a block ("counts toward nothing");
 * - applies rule 7: a flagging writer whose every live flag on the subject has a `COUNTER` from an
 *   independent listed writer drops out of the two-independent-writers count. Counters never remove
 *   a warning (rule 5) and never undo the weight-255 block;
 * - in the recipient context, counts category 8 toward a warning only (ERC, Categories);
 * - applies an entry's block range and head pin to every leaf of that writer, tombstones included;
 * - returns `block` or `warn` when some writer reached it even if another pinned writer is
 *   unavailable, and names the unavailable writers. `clean` needs every pinned writer synced, and
 *   zero pinned writers is `unavailable`.
 *
 * Pure and synchronous. The first call for a sync result indexes its leaves; later calls with the
 * same object reuse the index.
 */
export function evaluate(input: EvaluateInput): Evaluation {
  const { context, sync, logChainId } = input;
  const subject = getAddress(input.subject);
  const chainId = input.chainId ?? logChainId;
  const idx = indexOf(sync);
  const candidates = (idx.bySubject.get(subject) ?? []).filter(
    l =>
      l.leaf.op === FLAG &&
      (l.leaf.category >= 128 || CONTEXT_CATEGORIES[context].has(l.leaf.category)) &&
      appliesOn(l.leaf, chainId, logChainId),
  );

  const unavailable = new Set<Address>();
  let applied = 0;
  const findings: Finding[] = [];
  const lists: Evaluation["lists"] = [];

  for (const { list, blocking } of input.lists) {
    if (!("entries" in list.list)) continue;
    const { entries } = list.list;
    const group = groups(entries);
    const windows = entries.map(e => {
      const w = getAddress(e.writer);
      const s = sync.writers[w];
      if (s?.status !== "synced") {
        unavailable.add(w);
        return undefined;
      }
      const win = windowOf(e, w, idx);
      if (win) applied++;
      return win;
    });
    const live = (l: VerifiedLeaf, i: number) =>
      !(idx.byRef.get(l.leafHash) ?? []).some(
        t => t.leaf.op === TOMBSTONE && t.writer === l.writer && windows[i]!(t),
      );

    const here: Finding[] = [];
    const counted = new Set<number>(); // groups toward the two-writer threshold
    let heavy = false; // weight 255 in a blocking list
    entries.forEach((e, i) => {
      const win = windows[i];
      if (!win) return;
      const w = getAddress(e.writer);
      for (const l of candidates) {
        if (l.writer !== w || !win(l) || !trusts(e.categories, l.leaf.category) || !live(l, i)) continue;
        const counters = (idx.byRef.get(l.leafHash) ?? []).filter(c =>
          c.leaf.op === COUNTER &&
          entries.some((ce, j) => ce.weight > 0 && group[j] !== group[i] && isAddressEqual(ce.writer, c.writer) && windows[j]?.(c) && live(c, j)),
        );
        here.push({ writer: w, category: l.leaf.category, evidence: l.leaf.evidence, leaf: l, list, weight: e.weight, counters });
        if (context === "recipient" && l.leaf.category === 8) continue;
        if (e.weight === 255 && blocking) heavy = true;
        if (e.weight > 0 && counters.length === 0) counted.add(group[i]!);
      }
    });
    findings.push(...here);
    lists.push({ list, verdict: heavy || counted.size >= 2 ? "block" : here.length ? "warn" : "clean" });
  }

  const safelistedBy = input.safelists.filter(s => "subjects" in s.list && s.list.subjects.some(a => isAddressEqual(a, subject)));
  let verdict: Verdict = lists.reduce<Verdict>((v, l) => worse(v, l.verdict), "clean");
  if (verdict === "block" && safelistedBy.length) verdict = "warn";
  if (verdict === "clean" && (unavailable.size || applied === 0)) verdict = "unavailable";

  const disputes = (idx.bySubject.get(subject) ?? []).filter(l => l.leaf.op === DISPUTE && l.writer === subject);

  // EIP-7702 designator: 0xef0100 followed by the 20-byte delegate, 23 bytes in all.
  // SAFETY: lowercasing a hex string leaves it hex.
  const code = input.ownCode?.toLowerCase() as Hex | undefined;
  const ownDelegate =
    code?.startsWith("0xef0100") && size(code) === 23
      ? evaluate({ ...input, subject: getAddress(`0x${code.slice(8)}`), context: "delegate", ownCode: undefined })
      : undefined;
  if (ownDelegate) verdict = worse(verdict, ownDelegate.verdict);

  return {
    verdict,
    subject,
    context,
    findings,
    lists,
    safelistedBy,
    disputes,
    unavailable: [...unavailable],
    ...(ownDelegate && { ownDelegate }),
  };
}
