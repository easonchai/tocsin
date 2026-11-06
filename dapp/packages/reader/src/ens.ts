// ENS lookups for trust lists and writer names (ERC, Trust lists, publication method (b) and the
// verified-lookup bullet). Every read is one eth_call to the Universal Resolver through the injected
// `call`, so a host routes it through Helios and the result is as verified as the log. CCIP-read is
// off: no gateway URLs are passed and an OffchainLookup revert is never followed.
import {
  type Address,
  type Hex,
  decodeFunctionResult,
  encodeFunctionData,
  isAddressEqual,
  isHex,
  parseAbi,
  toHex,
} from "viem";
import { namehash, normalize, packetToBytes } from "viem/ens";
import { LIST_RECORD_KEY, type ListKind, SAFELIST_RECORD_KEY } from "./lists";

/** `eth_call` against latest verified state. Rejects on revert, OffchainLookup included, and on transport failure. */
export type EthCall = (request: { to: Address; data: Hex }) => Promise<Hex>;

/** ENS UpgradableUniversalResolverProxy, same address on mainnet and Sepolia (docs.ens.domains/learn/deployments). */
export const UNIVERSAL_RESOLVER: Address = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";

const ETH_COIN_TYPE = 60n;

export const universalResolverAbi = parseAbi([
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)",
  "function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string name, address resolver, address reverseResolver)",
]);
const resolverAbi = parseAbi([
  "function text(bytes32 node, string key) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
]);

/** Runs one resolver call for `name` through the Universal Resolver and returns the resolver's raw answer. */
async function resolve(call: EthCall, name: string, resolverCall: Hex, ur: Address): Promise<Hex> {
  const data = encodeFunctionData({
    abi: universalResolverAbi,
    functionName: "resolveWithGateways",
    args: [toHex(packetToBytes(name)), resolverCall, []],
  });
  const out = await call({ to: ur, data });
  const [result] = decodeFunctionResult({ abi: universalResolverAbi, functionName: "resolveWithGateways", data: out });
  return result;
}

async function resolveText(call: EthCall, name: string, key: string, ur: Address): Promise<string> {
  const req = encodeFunctionData({ abi: resolverAbi, functionName: "text", args: [namehash(name), key] });
  return decodeFunctionResult({ abi: resolverAbi, functionName: "text", data: await resolve(call, name, req, ur) });
}

async function resolveAddr(call: EthCall, name: string, ur: Address): Promise<Address> {
  const req = encodeFunctionData({ abi: resolverAbi, functionName: "addr", args: [namehash(name)] });
  return decodeFunctionResult({ abi: resolverAbi, functionName: "addr", data: await resolve(call, name, req, ur) });
}

/**
 * The `tocsin.list` (or `tocsin.safelist`) record of `name`, as the `record` of a `SignedList`.
 * `undefined` means unverifiable: any revert (OffchainLookup, no resolver, no record), a failed call, or a
 * value that is not hex. Pass it to `acceptList` as `fetched: undefined` so the last verified pin shows stale.
 * Throws only on a name that is not valid ENSIP-15, which is a settings error, not a lookup result.
 */
export async function resolveListRecord(
  call: EthCall,
  name: string,
  kind: ListKind = "list",
  universalResolver: Address = UNIVERSAL_RESOLVER,
): Promise<Hex | undefined> {
  const normalized = normalize(name);
  const key = kind === "list" ? LIST_RECORD_KEY : SAFELIST_RECORD_KEY;
  try {
    const value = await resolveText(call, normalized, key, universalResolver);
    return value !== "" && isHex(value) ? value : undefined;
  } catch {
    return undefined; // unverifiable by definition: we never follow a gateway or trust a failed read
  }
}

/**
 * The primary name of `address`, returned only if the name's forward `addr` record, read through the same
 * `call`, equals `address`. `undefined` means show the shortened address.
 */
export async function reverseName(
  call: EthCall,
  address: Address,
  universalResolver: Address = UNIVERSAL_RESOLVER,
): Promise<string | undefined> {
  try {
    const out = await call({
      to: universalResolver,
      data: encodeFunctionData({
        abi: universalResolverAbi,
        functionName: "reverseWithGateways",
        args: [address, ETH_COIN_TYPE, []],
      }),
    });
    const [name] = decodeFunctionResult({ abi: universalResolverAbi, functionName: "reverseWithGateways", data: out });
    if (!name || normalize(name) !== name) return undefined;
    return isAddressEqual(await resolveAddr(call, name, universalResolver), address) ? name : undefined;
  } catch {
    return undefined;
  }
}
