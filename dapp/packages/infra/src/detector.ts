// Pure detection logic for the category 1 detector. No RPC here; detect-cli.ts feeds it blocks.
//
// Role signal (ERC, Categories, forged-evidence bullet). The subject of every leaf is the account that
// authorized the transaction: the signer `tx.from`, or, inside an ERC-4337 bundle, the `sender` of the
// UserOperationEvent that a known EntryPoint itself emitted (log address checked). A Transfer event's
// `from` and `to` only pick which address was planted in whose history; neither ever becomes a subject.
// Counterparty history is recorded only from transfers whose `from` is that same authorizer, so a
// contract emitting fake Transfer events cannot plant a "counterparty" either.
import { type Address, type Hash, getAddress, isAddressEqual, parseAbi, zeroHash } from "viem";
import { OP } from "./abi.js";
import type { Leaf } from "./batch.js";

export const CATEGORY_POISONING_OPERATOR = 1;

/** ERC-4337 EntryPoint v0.6, v0.7, v0.8. Same address on every chain; all three hold code on Sepolia (checked 2026-11-06). */
export const ENTRY_POINTS: readonly Address[] = [
  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
];

export const watchedEvents = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  // Identical in EntryPoint v0.6 to v0.8.
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  "event BeforeExecution()",
]);

export type Tx = { hash: Hash; from: Address; to: Address | null; value: bigint };

/** A decoded log in the shape viem's getLogs returns for `watchedEvents`, trimmed to what we read. */
export type WatchedLog =
  | { eventName: "Transfer"; address: Address; transactionHash: Hash; logIndex: number; args: { from: Address; to: Address; value: bigint } }
  | { eventName: "UserOperationEvent"; address: Address; transactionHash: Hash; logIndex: number; args: { sender: Address } }
  | { eventName: "BeforeExecution"; address: Address; transactionHash: Hash; logIndex: number; args: Record<string, never> };

export type Authorizer = { address: Address; via: "tx" | "userOp" };

export type Transfer = {
  txHash: Hash;
  blockNumber: bigint;
  asset: "native" | Address;
  from: Address;
  to: Address;
  value: bigint;
  /** null when the authorizer cannot be resolved; such a transfer is ignored. */
  authorizer: Authorizer | null;
};

export type Config = {
  prefixHex: number;
  suffixHex: number;
  /** A native transfer below this many wei, and above zero, is dust. */
  dustWei: bigint;
  /** shortcut: one raw-unit threshold for every token regardless of decimals; per-token thresholds if false positives show up. */
  dustTokenUnits: bigint;
};

const isEntryPoint = (a: Address | null) => a !== null && ENTRY_POINTS.some((e) => isAddressEqual(e, a));

/** Same first `prefixHex` and last `suffixHex` hex characters, different address. */
export function isLookalike(a: Address, b: Address, prefixHex: number, suffixHex: number): boolean {
  const x = a.slice(2).toLowerCase();
  const y = b.slice(2).toLowerCase();
  if (x === y) return false;
  return x.slice(0, prefixHex) === y.slice(0, prefixHex) && x.slice(40 - suffixHex) === y.slice(40 - suffixHex);
}

/**
 * Who authorized the log at `logIndex` (or the top-level value transfer when `logIndex` is null).
 * In a bundle (target is an EntryPoint, or the tx carries an EntryPoint's UserOperationEvent) the bundler is
 * `tx.from` and is never returned. A log belongs to the first UserOperationEvent after it, provided it falls
 * after BeforeExecution, so validation-phase logs and top-level value stay unresolved.
 */
export function resolveAuthorizer(tx: Tx, txLogs: readonly WatchedLog[], logIndex: number | null): Authorizer | null {
  const fromEntryPoint = txLogs.filter((l) => l.eventName !== "Transfer" && isEntryPoint(l.address));
  const ops = fromEntryPoint.filter((l) => l.eventName === "UserOperationEvent");
  if (!isEntryPoint(tx.to) && ops.length === 0) return { address: getAddress(tx.from), via: "tx" };
  if (logIndex === null) return null;
  const start = fromEntryPoint.find((l) => l.eventName === "BeforeExecution");
  if (start && logIndex < start.logIndex) return null;
  const op = ops.filter((l) => l.logIndex > logIndex).sort((a, b) => a.logIndex - b.logIndex)[0];
  return op && op.eventName === "UserOperationEvent" ? { address: getAddress(op.args.sender), via: "userOp" } : null;
}

/**
 * Value transfers in a block, in order, each with its resolved authorizer.
 * shortcut: native value moved inside a UserOperation or any internal call needs traces and is not seen; add debug_traceBlock if the demo needs it.
 */
export function transfersIn(blockNumber: bigint, txs: readonly Tx[], logs: readonly WatchedLog[]): Transfer[] {
  const byTx = new Map<string, WatchedLog[]>();
  for (const l of logs) byTx.set(l.transactionHash, [...(byTx.get(l.transactionHash) ?? []), l]);
  return txs.flatMap((tx) => {
    const txLogs = byTx.get(tx.hash) ?? [];
    const out: Transfer[] = [];
    if (tx.to !== null && tx.value > 0n) {
      out.push({ txHash: tx.hash, blockNumber, asset: "native", from: getAddress(tx.from), to: getAddress(tx.to), value: tx.value, authorizer: resolveAuthorizer(tx, txLogs, null) });
    }
    for (const l of txLogs) {
      if (l.eventName !== "Transfer") continue;
      out.push({
        txHash: tx.hash, blockNumber, asset: getAddress(l.address), from: getAddress(l.args.from), to: getAddress(l.args.to),
        value: l.args.value, authorizer: resolveAuthorizer(tx, txLogs, l.logIndex),
      });
    }
    return out;
  });
}

/**
 * Bounded memory of the addresses each account recently paid. Least recently touched accounts are evicted
 * first; each account keeps its `perAccount` most recent payees.
 */
export class Counterparties {
  private readonly paid = new Map<string, Address[]>();
  constructor(private readonly maxAccounts = 50_000, private readonly perAccount = 8) {}

  record(payer: Address, payee: Address): void {
    const key = payer.toLowerCase();
    const prev = (this.paid.get(key) ?? []).filter((a) => !isAddressEqual(a, payee));
    this.paid.delete(key); // re-insert so Map order tracks recency
    this.paid.set(key, [payee, ...prev].slice(0, this.perAccount));
    if (this.paid.size > this.maxAccounts) this.paid.delete(this.paid.keys().next().value as string);
  }

  of(account: Address): readonly Address[] {
    return this.paid.get(account.toLowerCase()) ?? [];
  }

  get size(): number {
    return this.paid.size;
  }
}

export type Detection = {
  subject: Address;
  via: Authorizer["via"];
  txHash: Hash;
  blockNumber: bigint;
  lookalike: Address;
  imitates: Address;
  receiver: Address;
};

const isDust = (t: Transfer, cfg: Config) => (t.asset === "native" ? t.value > 0n && t.value < cfg.dustWei : t.value < cfg.dustTokenUnits);

/**
 * Feeds transfers through the counterparty memory in order and returns the dust that plants a lookalike.
 * A non-dust transfer the payer authorized records the payee as the payer's counterparty. A dust transfer to R
 * from L, where L looks like an address R paid, yields a detection whose subject is the dust's authorizer.
 */
export function scan(transfers: readonly Transfer[], memory: Counterparties, cfg: Config): Detection[] {
  const found: Detection[] = [];
  for (const t of transfers) {
    if (!t.authorizer || isAddressEqual(t.from, t.to)) continue;
    if (!isDust(t, cfg)) {
      if (isAddressEqual(t.authorizer.address, t.from)) memory.record(t.from, t.to);
      continue;
    }
    const imitates = memory.of(t.to).find((c) => isLookalike(t.from, c, cfg.prefixHex, cfg.suffixHex));
    if (imitates) {
      found.push({ subject: t.authorizer.address, via: t.authorizer.via, txHash: t.txHash, blockNumber: t.blockNumber, lookalike: t.from, imitates, receiver: t.to });
    }
  }
  return found;
}

/**
 * Category 1 FLAG leaf. `chainId = 0` (every EVM chain, allowed for category 1 by the ERC) only when the
 * subject signed the transaction, which makes it an EOA. A UserOperation sender is a contract account whose address
 * can belong to someone else on another chain, so it gets this chain's id.
 */
export function toLeaf(d: Detection, chainId: number): Leaf {
  return {
    chainId: d.via === "tx" ? 0n : BigInt(chainId),
    subject: d.subject,
    category: CATEGORY_POISONING_OPERATOR,
    op: OP.FLAG,
    evidence: d.txHash,
    seenBlock: d.blockNumber,
    refLeaf: zeroHash,
  };
}

export type Offer = "queued" | "duplicate" | "capped";

/**
 * Pending leaves with a fixed leaves-per-hour cap and per-writer subject dedupe. Times are block timestamps in
 * seconds. The cap counts every accepted detection in the trailing hour, sent or not, so a dropped batch does
 * not refund it.
 * shortcut: dedupe lives in memory, so a restart can flag a subject again; load the writer's past leaves at start if restarts become routine.
 */
export class Batcher {
  private readonly flagged = new Set<string>();
  private accepted: bigint[] = [];
  private pending: Detection[] = [];
  constructor(private readonly perHour: number) {}

  offer(d: Detection, now: bigint): Offer {
    const key = d.subject.toLowerCase();
    if (this.flagged.has(key)) return "duplicate";
    this.accepted = this.accepted.filter((t) => t > now - 3600n);
    if (this.accepted.length >= this.perHour) return "capped";
    this.accepted = [...this.accepted, now];
    this.flagged.add(key);
    this.pending = [...this.pending, d];
    return "queued";
  }

  /** Removes and returns up to `max` pending detections. */
  take(max: number): Detection[] {
    const out = this.pending.slice(0, max);
    this.pending = this.pending.slice(max);
    return out;
  }

  /** Lets a subject be flagged again, for a batch the relayer dropped without sending. */
  release(ds: readonly Detection[]): void {
    for (const d of ds) this.flagged.delete(d.subject.toLowerCase());
  }

  get queued(): number {
    return this.pending.length;
  }
}
