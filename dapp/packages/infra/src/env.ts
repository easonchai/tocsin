import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  isAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Variables already set in the process win over the file, so a one-off run can override it.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)) });

export type KeyVar =
  | "MANUAL_WRITER_PRIVATE_KEY"
  | "DETECTOR_PRIVATE_KEY"
  | "RELAYER_PRIVATE_KEY"
  | "ENS_OWNER_PRIVATE_KEY"
  | "MAINTAINER_PRIVATE_KEY";

export type Target = {
  chainId: number;
  log: Address;
  chain: Chain;
  public: PublicClient<Transport, Chain>;
};

export type Sender = WalletClient<Transport, Chain, Account>;

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set; see dapp/packages/infra/.env.example`);
  return value;
}

/** Reads a key by variable name. The error names the variable, never the value. */
export function accountFrom(name: KeyVar): Account {
  const key = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`${name} must be a 0x-prefixed 32-byte hex private key`);
  return privateKeyToAccount(key as Hex); // SAFETY: format checked on the line above
}

/**
 * Connects to RPC_URL and refuses to go on unless the node's chain id equals CHAIN_ID
 * and LOG_ADDRESS holds code. Every broadcast in this package goes through a Target.
 */
export async function connect(): Promise<Target> {
  const logRaw = required("LOG_ADDRESS");
  if (!isAddress(logRaw, { strict: false })) throw new Error("LOG_ADDRESS is not an address");
  const log = getAddress(logRaw);
  const target = await connectChain();
  const code = await target.public.getCode({ address: log });
  if (!code || code === "0x") throw new Error(`No contract code at LOG_ADDRESS ${log} on chain ${target.chainId}`);
  return { ...target, log };
}

/** The chain-id check of `connect` without the log, for scripts that never touch the log (ENS setup). */
export async function connectChain(): Promise<Omit<Target, "log">> {
  const url = required("RPC_URL");
  const expected = Number(required("CHAIN_ID"));
  if (!Number.isSafeInteger(expected) || expected <= 0) throw new Error("CHAIN_ID must be a positive integer");

  const chain = defineChain({
    id: expected,
    name: expected === 11155111 ? "Sepolia" : `chain ${expected}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [url] } },
  });
  const client = createPublicClient({ chain, transport: http(url, { timeout: 30_000 }) });

  const actual = await client.getChainId();
  if (actual !== expected) throw new Error(`RPC_URL answers chain id ${actual}, CHAIN_ID says ${expected}; refusing to broadcast`);
  return { chainId: actual, chain, public: client };
}

export function senderFor(target: Target, account: Account): Sender {
  return createWalletClient({ account, chain: target.chain, transport: http(target.chain.rpcUrls.default.http[0], { timeout: 30_000 }) });
}
