// Usage: yarn workspace @tocsin/infra wallet <command>, the key and chain steps of ../../../bootstrap.sh.
//   new                      print a fresh private key
//   address <key>            the address of a key
//   balance <address>        balance in ETH, through RPC_URL
//   block                    the current block number
//   send <key> <to> <eth>    send ETH, wait for the receipt, print the transaction hash
// Only `new` ever prints a key. Errors name the argument, never its value.
import { type Address, type Hex, formatEther, getAddress, isAddress, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { connectChain, senderFor } from "./env.js";

const keyArg = (v: string | undefined, what: string) => {
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${what} must be a 0x-prefixed 32-byte hex private key`);
  return privateKeyToAccount(v as Hex); // SAFETY: format checked on the line above
};
const addressArg = (v: string | undefined, what: string): Address => {
  if (!v || !isAddress(v, { strict: false })) throw new Error(`${what} is not an address`);
  return getAddress(v);
};

async function main(): Promise<string> {
  const [cmd, a, b, c] = process.argv.slice(2);
  switch (cmd) {
    case "new":
      return generatePrivateKey();
    case "address":
      return keyArg(a, "key").address;
    case "balance":
      return formatEther(await (await connectChain()).public.getBalance({ address: addressArg(a, "address") }));
    case "block":
      return (await (await connectChain()).public.getBlockNumber()).toString();
    case "send": {
      const target = await connectChain();
      const from = senderFor(target, keyArg(a, "key"));
      if (!c) throw new Error("amount in ETH is missing");
      const hash = await from.sendTransaction({ to: addressArg(b, "to"), value: parseEther(c) });
      const receipt = await target.public.waitForTransactionReceipt({ hash, timeout: 180_000 });
      if (receipt.status !== "success") throw new Error(`send ${hash} reverted`);
      return hash;
    }
    default:
      throw new Error("usage: wallet new | address <key> | balance <address> | block | send <key> <to> <eth>");
  }
}

main().then(
  (out) => console.log(out),
  (err) => {
    console.error("wallet failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
