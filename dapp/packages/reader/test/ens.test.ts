import {
  type Address,
  type Hex,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  isAddressEqual,
  parseAbi,
  zeroAddress,
} from "viem";
import { namehash } from "viem/ens";
import { describe, expect, it } from "vitest";
import { type EthCall, UNIVERSAL_RESOLVER, resolveListRecord, reverseName, universalResolverAbi } from "../src/ens.ts";
import { LIST_RECORD_KEY, SAFELIST_RECORD_KEY, encodeListRecord } from "../src/lists/index.ts";

const resolverAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
]);
const offchainLookupAbi = parseAbi([
  "error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData)",
]);

const RESOLVER: Address = "0x1111111111111111111111111111111111111111";
const WRITER: Address = "0x2222222222222222222222222222222222222222";
const OTHER: Address = "0x3333333333333333333333333333333333333333";

const RECORD = encodeListRecord({
  root: `0x${"ab".repeat(32)}`,
  version: 3n,
  signature: `0x${"cd".repeat(65)}`,
  listURI: "https://example.org/lists/default.json",
});

type Name = { texts?: Record<string, string>; addr?: Address; offchain?: boolean };

/** A Universal Resolver that answers from in-memory records and reverts the way the real one does. */
function fakeUniversalResolver(names: Record<string, Name>, primary: Record<Address, string> = {}) {
  const calls: { to: Address; data: Hex }[] = [];
  const byNode = new Map(Object.entries(names).map(([n, r]) => [namehash(n), r]));
  const call: EthCall = async req => {
    calls.push(req);
    if (!isAddressEqual(req.to, UNIVERSAL_RESOLVER)) throw new Error("wrong contract");
    const { functionName, args } = decodeFunctionData({ abi: universalResolverAbi, data: req.data });
    if (functionName === "reverseWithGateways") {
      const [addr, coinType, gateways] = args;
      expect(coinType).toBe(60n);
      expect(gateways).toEqual([]);
      const name = Object.entries(primary).find(([a]) => isAddressEqual(a as Address, addr))?.[1] ?? "";
      return encodeFunctionResult({
        abi: universalResolverAbi,
        functionName: "reverseWithGateways",
        result: [name, RESOLVER, RESOLVER],
      });
    }
    const [, inner, gateways] = args;
    expect(gateways).toEqual([]); // CCIP-read off: never hand the resolver a gateway
    const q = decodeFunctionData({ abi: resolverAbi, data: inner });
    const record = byNode.get(q.args[0]);
    if (!record) throw Object.assign(new Error("execution reverted"), { data: "0x77209fe8" }); // ResolverNotFound
    if (record.offchain)
      throw Object.assign(new Error("execution reverted"), {
        data: encodeErrorResult({
          abi: offchainLookupAbi,
          errorName: "OffchainLookup",
          args: [RESOLVER, ["https://gateway.example/{sender}/{data}.json"], inner, "0x12345678", "0x"],
        }),
      });
    const result =
      q.functionName === "text"
        ? encodeFunctionResult({ abi: resolverAbi, functionName: "text", result: record.texts?.[q.args[1]] ?? "" })
        : encodeFunctionResult({ abi: resolverAbi, functionName: "addr", result: record.addr ?? zeroAddress });
    return encodeFunctionResult({
      abi: universalResolverAbi,
      functionName: "resolveWithGateways",
      result: [result, RESOLVER],
    });
  };
  return { call, calls };
}

describe("resolveListRecord", () => {
  it("returns the list record of a name, normalising the name first", async () => {
    const { call, calls } = fakeUniversalResolver({ "tocsin.eth": { texts: { [LIST_RECORD_KEY]: RECORD } } });
    expect(await resolveListRecord(call, "Tocsin.eth")).toBe(RECORD);
    expect(calls).toHaveLength(1);
  });

  it("reads the safelist key for kind safelist", async () => {
    const { call } = fakeUniversalResolver({ "tocsin.eth": { texts: { [SAFELIST_RECORD_KEY]: RECORD } } });
    expect(await resolveListRecord(call, "tocsin.eth", "safelist")).toBe(RECORD);
    expect(await resolveListRecord(call, "tocsin.eth", "list")).toBeUndefined();
  });

  it("treats an OffchainLookup revert as unverifiable and makes no further call", async () => {
    const { call, calls } = fakeUniversalResolver({ "tocsin.eth": { offchain: true } });
    expect(await resolveListRecord(call, "tocsin.eth")).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it("is unverifiable when the name has no resolver, no record, or a non-hex value", async () => {
    const { call } = fakeUniversalResolver({
      "empty.eth": {},
      "junk.eth": { texts: { [LIST_RECORD_KEY]: "not hex" } },
    });
    expect(await resolveListRecord(call, "missing.eth")).toBeUndefined();
    expect(await resolveListRecord(call, "empty.eth")).toBeUndefined();
    expect(await resolveListRecord(call, "junk.eth")).toBeUndefined();
  });

  it("throws on a name that is not valid ENSIP-15", async () => {
    const { call } = fakeUniversalResolver({});
    await expect(resolveListRecord(call, "a..eth")).rejects.toThrow();
  });
});

describe("reverseName", () => {
  it("returns the primary name when the forward addr matches", async () => {
    const { call } = fakeUniversalResolver({ "manual.tocsin.eth": { addr: WRITER } }, { [WRITER]: "manual.tocsin.eth" });
    expect(await reverseName(call, WRITER)).toBe("manual.tocsin.eth");
  });

  it("drops the name when the forward record points elsewhere", async () => {
    const { call } = fakeUniversalResolver({ "manual.tocsin.eth": { addr: OTHER } }, { [WRITER]: "manual.tocsin.eth" });
    expect(await reverseName(call, WRITER)).toBeUndefined();
  });

  it("drops the name when there is no primary name, the forward lookup reverts, or the name is not normalised", async () => {
    const { call } = fakeUniversalResolver(
      { "off.tocsin.eth": { offchain: true } },
      { [WRITER]: "off.tocsin.eth", [OTHER]: "Manual.tocsin.eth" },
    );
    expect(await reverseName(call, "0x4444444444444444444444444444444444444444")).toBeUndefined();
    expect(await reverseName(call, WRITER)).toBeUndefined();
    expect(await reverseName(call, OTHER)).toBeUndefined();
  });
});
