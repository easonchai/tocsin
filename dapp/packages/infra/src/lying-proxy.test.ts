import { type Address, type Hex, encodeEventTopics, getAddress, numberToHex, pad } from "viem";
import { describe, expect, it } from "vitest";
import { threatFlagLogAbi } from "./abi.js";
import { lie } from "./lying-proxy.js";

const MANUAL = getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
const DETECTOR = getAddress("0x60b2aC09cA9429B85e9377ee6173204cf009d8cf");
const target = { writer: MANUAL, seq: 2n };

// Lowercase and padded, as nodes return topics.
const appended = (writer: Address, seq: bigint) => ({
  address: "0xb639d15a0e7ae24e4c32e851fbe0e57585565b14",
  topics: encodeEventTopics({ abi: threatFlagLogAbi, eventName: "Appended", args: { writer, writerSeq: seq } }).map((t) => (t as Hex).toLowerCase()),
  data: "0x",
  blockNumber: numberToHex(seq + 1n),
});
const other = { address: "0xb639d15a0e7ae24e4c32e851fbe0e57585565b14", topics: [pad("0x1234"), pad(MANUAL.toLowerCase() as Hex), pad("0x2")], data: "0x" };
const getLogs = (id: unknown) => ({ jsonrpc: "2.0", id, method: "eth_getLogs", params: [{}] });

describe("lie", () => {
  const logs = [appended(MANUAL, 1n), appended(MANUAL, 2n), appended(MANUAL, 3n), appended(DETECTOR, 2n), other];

  it("drops only the target writer's Appended log at the target sequence", () => {
    const { response, dropped } = lie(getLogs(1), { jsonrpc: "2.0", id: 1, result: logs }, target);
    expect(dropped).toBe(1);
    expect((response as { result: unknown[] }).result).toEqual([logs[0], logs[2], logs[3], other]);
  });

  it("passes other methods and error responses through untouched", () => {
    const res = { jsonrpc: "2.0", id: 7, result: logs };
    expect(lie({ jsonrpc: "2.0", id: 7, method: "eth_getBlockByNumber", params: [] }, res, target)).toEqual({ response: res, dropped: 0 });
    const err = { jsonrpc: "2.0", id: 1, error: { code: -32005, message: "range too large" } };
    expect(lie(getLogs(1), err, target)).toEqual({ response: err, dropped: 0 });
  });

  it("filters only the eth_getLogs entries of a batch, matched by id", () => {
    const request = [{ jsonrpc: "2.0", id: "a", method: "eth_blockNumber" }, getLogs("b"), getLogs(3)];
    // Batch responses may come back in any order.
    const response = [
      { jsonrpc: "2.0", id: 3, result: [logs[1]] },
      { jsonrpc: "2.0", id: "a", result: "0x10" },
      { jsonrpc: "2.0", id: "b", result: logs },
    ];
    const out = lie(request, response, target);
    expect(out.dropped).toBe(2);
    expect(out.response).toEqual([
      { jsonrpc: "2.0", id: 3, result: [] },
      { jsonrpc: "2.0", id: "a", result: "0x10" },
      { jsonrpc: "2.0", id: "b", result: [logs[0], logs[2], logs[3], other] },
    ]);
  });
});
