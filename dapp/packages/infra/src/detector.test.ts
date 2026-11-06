import { describe, expect, it } from "vitest";
import { type Address, type Hash, getAddress, zeroHash } from "viem";
import {
  Batcher,
  type Config,
  Counterparties,
  type Detection,
  ENTRY_POINTS,
  type Tx,
  type WatchedLog,
  isLookalike,
  resolveAuthorizer,
  scan,
  toLeaf,
  transfersIn,
} from "./detector.js";

const a = (hex: string): Address => getAddress(`0x${hex.padStart(40, "0")}`);
const h = (n: number): Hash => `0x${n.toString(16).padStart(64, "0")}` as Hash; // SAFETY: padded to 64 hex chars

const VICTIM = a("1111111111111111111111111111111111111111");
const PAYEE = a("abcd000000000000000000000000000000001234"); // an address the victim really paid
const LOOKALIKE = a("abcd999999999999999999999999999999991234");
const STRANGER = a("2222222222222222222222222222222222222222");
const OPERATOR = a("3333333333333333333333333333333333333333");
const BUNDLER = a("4444444444444444444444444444444444444444");
const SMART_ACCOUNT = a("5555555555555555555555555555555555555555");
const TOKEN = a("6666666666666666666666666666666666666666");
const EP = ENTRY_POINTS[1] as Address; // SAFETY: the list has three entries

const cfg: Config = { prefixHex: 4, suffixHex: 4, dustWei: 1000n, dustTokenUnits: 100n };

const tx = (n: number, from: Address, to: Address | null, value = 0n): Tx => ({ hash: h(n), from, to, value });
const transfer = (txN: number, logIndex: number, token: Address, from: Address, to: Address, value: bigint): WatchedLog => ({
  eventName: "Transfer", address: token, transactionHash: h(txN), logIndex, args: { from, to, value },
});
const userOp = (txN: number, logIndex: number, sender: Address, address: Address = EP): WatchedLog => ({
  eventName: "UserOperationEvent", address, transactionHash: h(txN), logIndex, args: { sender },
});
const beforeExecution = (txN: number, logIndex: number): WatchedLog => ({
  eventName: "BeforeExecution", address: EP, transactionHash: h(txN), logIndex, args: {},
});

describe("isLookalike", () => {
  it("matches same prefix and suffix on a different address, any case", () => {
    expect(isLookalike(LOOKALIKE, PAYEE, 4, 4)).toBe(true);
    expect(isLookalike(LOOKALIKE.toUpperCase().replace("0X", "0x") as Address, PAYEE, 4, 4)).toBe(true);
  });
  it("rejects the same address, a prefix miss, and a suffix miss", () => {
    expect(isLookalike(PAYEE, PAYEE, 4, 4)).toBe(false);
    expect(isLookalike(a("abce999999999999999999999999999999991234"), PAYEE, 4, 4)).toBe(false);
    expect(isLookalike(a("abcd999999999999999999999999999999991235"), PAYEE, 4, 4)).toBe(false);
  });
  it("honours the configured lengths", () => {
    const near = a("abcd999999999999999999999999999999991299");
    expect(isLookalike(near, PAYEE, 4, 4)).toBe(false);
    expect(isLookalike(near, PAYEE, 4, 2)).toBe(false);
    expect(isLookalike(a("ab99999999999999999999999999999999999934"), PAYEE, 2, 2)).toBe(true);
  });
});

describe("resolveAuthorizer", () => {
  it("returns the signer for an ordinary transaction", () => {
    expect(resolveAuthorizer(tx(1, OPERATOR, TOKEN), [], 0)).toEqual({ address: OPERATOR, via: "tx" });
  });

  it("returns the UserOperation sender, never the bundler, for a log inside a bundle", () => {
    const logs = [beforeExecution(1, 0), transfer(1, 1, TOKEN, LOOKALIKE, VICTIM, 0n), userOp(1, 2, SMART_ACCOUNT)];
    expect(resolveAuthorizer(tx(1, BUNDLER, EP), logs, 1)).toEqual({ address: SMART_ACCOUNT, via: "userOp" });
  });

  it("attributes each log to the op whose UserOperationEvent follows it in a multi-op bundle", () => {
    const logs = [beforeExecution(1, 0), transfer(1, 1, TOKEN, STRANGER, VICTIM, 0n), userOp(1, 2, OPERATOR), transfer(1, 3, TOKEN, LOOKALIKE, VICTIM, 0n), userOp(1, 4, SMART_ACCOUNT)];
    expect(resolveAuthorizer(tx(1, BUNDLER, EP), logs, 1)?.address).toBe(OPERATOR);
    expect(resolveAuthorizer(tx(1, BUNDLER, EP), logs, 3)?.address).toBe(SMART_ACCOUNT);
  });

  it("leaves validation-phase logs, trailing logs, and top-level value unresolved in a bundle", () => {
    const logs = [transfer(1, 0, TOKEN, LOOKALIKE, VICTIM, 0n), beforeExecution(1, 1), userOp(1, 2, SMART_ACCOUNT), transfer(1, 3, TOKEN, LOOKALIKE, VICTIM, 0n)];
    expect(resolveAuthorizer(tx(1, BUNDLER, EP), logs, 0)).toBeNull();
    expect(resolveAuthorizer(tx(1, BUNDLER, EP), logs, 3)).toBeNull();
    expect(resolveAuthorizer(tx(1, BUNDLER, EP, 5n), logs, null)).toBeNull();
  });

  it("treats a bundle sent through a wrapper contract as a bundle when the EntryPoint emitted UserOperationEvent", () => {
    const logs = [beforeExecution(1, 0), transfer(1, 1, TOKEN, LOOKALIKE, VICTIM, 0n), userOp(1, 2, SMART_ACCOUNT)];
    expect(resolveAuthorizer(tx(1, BUNDLER, STRANGER), logs, 1)).toEqual({ address: SMART_ACCOUNT, via: "userOp" });
  });

  it("ignores a UserOperationEvent emitted by a contract that is not an EntryPoint", () => {
    const logs = [transfer(1, 0, TOKEN, LOOKALIKE, VICTIM, 0n), userOp(1, 1, SMART_ACCOUNT, TOKEN)];
    expect(resolveAuthorizer(tx(1, OPERATOR, TOKEN), logs, 0)).toEqual({ address: OPERATOR, via: "tx" });
  });
});

describe("transfersIn", () => {
  it("emits native value and Transfer logs in order with their authorizers", () => {
    const txs = [tx(1, VICTIM, PAYEE, 5000n), tx(2, OPERATOR, TOKEN)];
    const out = transfersIn(7n, txs, [transfer(2, 0, TOKEN, LOOKALIKE, VICTIM, 1n)]);
    expect(out).toMatchObject([
      { txHash: h(1), asset: "native", from: VICTIM, to: PAYEE, value: 5000n, authorizer: { address: VICTIM, via: "tx" }, blockNumber: 7n },
      { txHash: h(2), asset: TOKEN, from: LOOKALIKE, to: VICTIM, value: 1n, authorizer: { address: OPERATOR, via: "tx" } },
    ]);
  });
  it("skips zero-value calls and contract creations as native transfers", () => {
    expect(transfersIn(1n, [tx(1, VICTIM, PAYEE), tx(2, VICTIM, null, 9n)], [])).toEqual([]);
  });
});

describe("Counterparties", () => {
  it("keeps at most perAccount payees, most recent first, without duplicates", () => {
    const m = new Counterparties(10, 2);
    m.record(VICTIM, PAYEE);
    m.record(VICTIM, STRANGER);
    m.record(VICTIM, PAYEE);
    m.record(VICTIM, OPERATOR);
    expect(m.of(VICTIM)).toEqual([OPERATOR, PAYEE]);
  });
  it("evicts the least recently touched account past maxAccounts", () => {
    const m = new Counterparties(2, 4);
    m.record(VICTIM, PAYEE);
    m.record(STRANGER, PAYEE);
    m.record(VICTIM, OPERATOR); // touches VICTIM, so STRANGER is now oldest
    m.record(OPERATOR, PAYEE);
    expect(m.size).toBe(2);
    expect(m.of(STRANGER)).toEqual([]);
    expect(m.of(VICTIM)).toEqual([OPERATOR, PAYEE]);
  });
});

describe("scan", () => {
  const nativeT = (n: number, from: Address, to: Address, value: bigint) => transfersIn(1n, [tx(n, from, to, value)], []);

  it("flags the sender of native dust that imitates an address the receiver paid", () => {
    const m = new Counterparties();
    const found = scan([...nativeT(1, VICTIM, PAYEE, 5000n), ...nativeT(2, LOOKALIKE, VICTIM, 1n)], m, cfg);
    expect(found).toEqual([{ subject: LOOKALIKE, via: "tx", txHash: h(2), blockNumber: 1n, lookalike: LOOKALIKE, imitates: PAYEE, receiver: VICTIM }]);
  });

  it("ignores dust from an unrelated address, from the real payee, and above-threshold payments from a lookalike", () => {
    const m = new Counterparties();
    const history = nativeT(1, VICTIM, PAYEE, 5000n);
    expect(scan([...history, ...nativeT(2, STRANGER, VICTIM, 1n), ...nativeT(3, PAYEE, VICTIM, 1n), ...nativeT(4, LOOKALIKE, VICTIM, 1000n)], m, cfg)).toEqual([]);
  });

  it("does not learn counterparties from dust or from payments in the other direction", () => {
    const m = new Counterparties();
    // PAYEE paid VICTIM, and VICTIM sent PAYEE only dust: VICTIM never paid PAYEE.
    expect(scan([...nativeT(1, PAYEE, VICTIM, 5000n), ...nativeT(2, VICTIM, PAYEE, 1n), ...nativeT(3, LOOKALIKE, VICTIM, 1n)], m, cfg)).toEqual([]);
  });

  it("flags the transaction signer, not the event's from, for a fake-token Transfer", () => {
    const m = new Counterparties();
    const t = transfersIn(1n, [tx(1, VICTIM, PAYEE, 5000n), tx(2, OPERATOR, TOKEN)], [transfer(2, 0, TOKEN, LOOKALIKE, VICTIM, 0n)]);
    expect(scan(t, m, cfg).map((d) => [d.subject, d.lookalike])).toEqual([[OPERATOR, LOOKALIKE]]);
  });

  it("does not learn a counterparty from an event whose from did not authorize it", () => {
    const m = new Counterparties();
    // OPERATOR's contract emits Transfer(VICTIM -> PAYEE, large): VICTIM did not sign it, so PAYEE is not VICTIM's counterparty.
    const t = transfersIn(1n, [tx(1, OPERATOR, TOKEN), tx(2, LOOKALIKE, VICTIM, 1n)], [transfer(1, 0, TOKEN, VICTIM, PAYEE, 10_000n)]);
    expect(scan(t, m, cfg)).toEqual([]);
    expect(m.of(VICTIM)).toEqual([]);
  });

  it("flags the UserOperation sender for token dust inside a bundle and skips unresolved logs", () => {
    const m = new Counterparties();
    const logs = [transfer(2, 0, TOKEN, LOOKALIKE, VICTIM, 0n), beforeExecution(2, 1), transfer(2, 2, TOKEN, LOOKALIKE, VICTIM, 0n), userOp(2, 3, SMART_ACCOUNT)];
    const found = scan(transfersIn(1n, [tx(1, VICTIM, PAYEE, 5000n), tx(2, BUNDLER, EP)], logs), m, cfg);
    expect(found.map((d) => [d.subject, d.via])).toEqual([[SMART_ACCOUNT, "userOp"]]);
  });
});

const detection = (subject: Address, n = 1): Detection => ({ subject, via: "tx", txHash: h(n), blockNumber: 9n, lookalike: subject, imitates: PAYEE, receiver: VICTIM });

describe("toLeaf", () => {
  it("builds a category 1 FLAG with the dust hash as evidence and chainId 0 for a transaction signer", () => {
    expect(toLeaf(detection(LOOKALIKE, 42), 11155111)).toEqual({ chainId: 0n, subject: LOOKALIKE, category: 1, op: 0, evidence: h(42), seenBlock: 9n, refLeaf: zeroHash });
  });
  it("pins a UserOperation sender to this chain", () => {
    expect(toLeaf({ ...detection(SMART_ACCOUNT), via: "userOp" }, 11155111).chainId).toBe(11155111n);
  });
});

describe("Batcher", () => {
  it("dedupes subjects already flagged by this writer, case-insensitively", () => {
    const b = new Batcher(10);
    expect(b.offer(detection(LOOKALIKE), 0n)).toBe("queued");
    expect(b.offer(detection(LOOKALIKE.toLowerCase() as Address, 2), 0n)).toBe("duplicate");
    expect(b.take(500)).toHaveLength(1);
    expect(b.offer(detection(LOOKALIKE, 3), 100n)).toBe("duplicate");
  });

  it("caps accepted leaves per trailing hour and frees slots as the hour rolls", () => {
    const b = new Batcher(2);
    expect(b.offer(detection(a("01")), 1000n)).toBe("queued");
    expect(b.offer(detection(a("02")), 1500n)).toBe("queued");
    expect(b.offer(detection(a("03")), 2000n)).toBe("capped");
    expect(b.offer(detection(a("03")), 4600n)).toBe("queued"); // first slot (1000) is out of the window
    expect(b.offer(detection(a("04")), 4600n)).toBe("capped");
  });

  it("does not mark a capped subject flagged, so it can be queued later", () => {
    const b = new Batcher(1);
    b.offer(detection(a("01")), 0n);
    expect(b.offer(detection(a("02")), 0n)).toBe("capped");
    expect(b.offer(detection(a("02")), 3600n)).toBe("queued");
  });

  it("takes in order up to the batch size and lets a dropped batch's subjects be flagged again", () => {
    const b = new Batcher(10);
    for (const s of ["01", "02", "03"]) b.offer(detection(a(s)), 0n);
    const first = b.take(2);
    expect(first.map((d) => d.subject)).toEqual([a("01"), a("02")]);
    expect(b.queued).toBe(1);
    b.release(first);
    expect(b.offer(detection(a("01")), 0n)).toBe("queued");
  });
});
