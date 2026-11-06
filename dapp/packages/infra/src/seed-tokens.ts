// Usage: TEST_WALLET=0x… yarn seed-tokens   (run `forge build` in packages/foundry first)
// Deploys two MockToken contracts, fakeUSDC and realUSDC, both with symbol USDC, mints 1,000 of each to
// TEST_WALLET, and has the manual writer (tocsin.eth, weight 255) flag fakeUSDC as MALICIOUS_TOKEN with the
// deployment transaction as evidence. realUSDC stays unflagged as the control.
// Writes tokens-manifest.<chainId>.json.
import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { type Abi, type Address, type Hash, type Hex, getAddress, isAddress, parseAbi, zeroHash } from "viem";
import { OP, threatFlagLogAbi } from "./abi.js";
import { type Sender, type Target, accountFrom, connect, required, senderFor } from "./env.js";

const MALICIOUS_TOKEN = 5;
const MINT = 1_000_000_000n; // 1,000 tokens at 6 decimals
const tokenAbi = parseAbi(["constructor(string name, string symbol)", "function mint(address to, uint256 value)"]);

async function bytecode(): Promise<Hex> {
  const path = fileURLToPath(new URL("../../foundry/out/MockToken.sol/MockToken.json", import.meta.url));
  try {
    const { bytecode } = JSON.parse(await readFile(path, "utf8")) as { bytecode: { object: Hex } };
    return bytecode.object;
  } catch (error) {
    throw new Error(`cannot read ${path}; run \`forge build\` in packages/foundry`, { cause: error });
  }
}

async function confirmed(target: Target, hash: Hash, what: string) {
  const receipt = await target.public.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${what} ${hash} reverted`);
  return receipt;
}

async function deploy(target: Target, deployer: Sender, code: Hex, name: string): Promise<{ address: Address; tx: Hash }> {
  const tx = await deployer.deployContract({ abi: tokenAbi as Abi, bytecode: code, args: [name, "USDC"] });
  const receipt = await confirmed(target, tx, `deploy ${name}`);
  if (!receipt.contractAddress) throw new Error(`deploy ${name} ${tx} created no contract`);
  const address = getAddress(receipt.contractAddress);
  console.log(`${name}: ${address} (tx ${tx})`);
  return { address, tx };
}

async function main() {
  const wallet = required("TEST_WALLET");
  if (!isAddress(wallet, { strict: false })) throw new Error("TEST_WALLET is not an address");
  const to = getAddress(wallet);
  const target = await connect();
  const code = await bytecode();
  const deployerAcct = accountFrom("RELAYER_PRIVATE_KEY");
  const manualAcct = accountFrom("MANUAL_WRITER_PRIVATE_KEY");

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `Deployer ${deployerAcct.address} deploys fakeUSDC and realUSDC and mints 1,000 of each to ${to}; manual writer ${manualAcct.address} flags fakeUSDC. 5 transactions on chain ${target.chainId}. Type SEED to continue: `,
  );
  rl.close();
  if (answer.trim() !== "SEED") throw new Error("aborted");

  const deployer = senderFor(target, deployerAcct);
  const fake = await deploy(target, deployer, code, "fakeUSDC");
  const real = await deploy(target, deployer, code, "realUSDC");
  for (const t of [fake, real]) {
    const hash = await deployer.writeContract({ address: t.address, abi: tokenAbi, functionName: "mint", args: [to, MINT] });
    await confirmed(target, hash, `mint on ${t.address}`);
  }
  console.log(`minted 1,000 of each to ${to}`);

  const head = await target.public.getBlockNumber();
  const leaf = {
    chainId: BigInt(target.chainId),
    subject: fake.address,
    category: MALICIOUS_TOKEN,
    op: OP.FLAG,
    evidence: fake.tx, // ERC, Categories: the deployment's transaction hash
    seenBlock: head,
    refLeaf: zeroHash,
  };
  const manual = senderFor(target, manualAcct);
  const { request } = await target.public.simulateContract({ account: manualAcct, address: target.log, abi: threatFlagLogAbi, functionName: "append", args: [[leaf]] });
  const flagTx = await manual.writeContract(request);
  await confirmed(target, flagTx, "append");
  console.log(`flagged fakeUSDC as MALICIOUS_TOKEN: tx ${flagTx}`);

  const path = fileURLToPath(new URL(`../tokens-manifest.${target.chainId}.json`, import.meta.url));
  const manifest = { chainId: target.chainId, wallet: to, fakeUSDC: fake, realUSDC: real, flagTx };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest written to ${path}`);
}

main().catch((err) => {
  console.error("seed-tokens failed:", err);
  process.exit(1);
});
