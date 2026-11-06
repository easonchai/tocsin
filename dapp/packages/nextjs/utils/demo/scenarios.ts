// The demo board's scenario table. Labels, lists, categories and verdicts are copied from
// docs/plan/demo/test-addresses.tsv; scenarios.test.ts fails when they drift apart.
// Imports stay relative and type-only (besides viem) so `node --test` can load this file directly.
import { type Address, type Hex, encodeFunctionData, parseAbi, parseEther } from "viem";

export const SNAP_ID = "local:http://localhost:8080";
export const POISON_RPC = "http://127.0.0.1:8550";
export const HONEST_RPC = "https://0xrpc.io/sep";

export const DEMO_ACCOUNT: Address = "0xE0DFbd2B761929D02b30f2173C3386f0ec4B3cca";
export const REAL_USDC: Address = "0xf53749FD5e85d4169E95E18FeD40b9A5219FC039";
export const FAKE_USDC: Address = "0x2Ba2B2F4bd18D04C3bA92DB9F73a49d19c87b4B8";
// Checked on Sepolia 2026-11-06: SwapRouter02.WETH9() returns SEPOLIA_WETH, factory() is the v3 factory
// 0x0227628f3F023bb0B980b67D528571c95c6DaC1c, and the bytecode carries the exactInputSingle selector.
export const SWAP_ROUTER_02: Address = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
export const SEPOLIA_WETH: Address = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

const ETH_AMOUNT = parseEther("0.00001");
const ONE_USDC = 1_000_000n; // MockToken has 6 decimals
const SWAP_FEE = 3000;

export type Verdict = "clean" | "warn" | "block";
export type TrustList = "tocsin.eth" | "harborwatch.eth" | "lanterndao.eth";
export type Group = "Send ETH" | "Send token" | "Approve" | "Swap";

// "connected" resolves to the connected account when the button is pressed.
export type ScenarioTx =
  | { kind: "eth"; to: Address }
  | { kind: "transfer"; token: Address; to: Address }
  | { kind: "approve"; token: Address; spender: Address }
  | { kind: "swap"; recipient: Address | "connected" };

export type Scenario = {
  id: string;
  title: string;
  group: Group;
  // A label from the tsv, or a name for a subject the tsv does not list.
  subjectLabel: string;
  subject: Address | "connected";
  lists: TrustList[];
  // The tsv type column; null when nothing flags the subject.
  category: string | null;
  expected: Verdict;
  snapOnly: boolean;
  note?: string;
  tx: ScenarioTx;
};

const DRAINER_RECEIVER_1: Address = "0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537";

export const SCENARIOS: Scenario[] = [
  {
    id: "send-clean",
    title: "Send ETH to the demo account",
    group: "Send ETH",
    subjectLabel: "demo account",
    subject: DEMO_ACCOUNT,
    lists: [],
    category: null,
    expected: "clean",
    snapOnly: false,
    tx: { kind: "eth", to: DEMO_ACCOUNT },
  },
  {
    id: "send-poisoning-operator-1",
    title: "Send ETH to a poisoning operator",
    group: "Send ETH",
    subjectLabel: "poisoning-operator-1",
    subject: "0x5126633bCFdb9E4A2FE7AB445394AE0a217f9120",
    lists: ["tocsin.eth", "lanterndao.eth"],
    category: "POISONING_OPERATOR",
    expected: "warn",
    snapOnly: false,
    note: "Two weight-1 writers on two lists still warn: lists do not add up to a block.",
    tx: { kind: "eth", to: "0x5126633bCFdb9E4A2FE7AB445394AE0a217f9120" },
  },
  {
    id: "send-drainer-receiver-1",
    title: "Send ETH to the drainer receiver",
    group: "Send ETH",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    lists: ["tocsin.eth", "harborwatch.eth", "lanterndao.eth"],
    category: "DRAINER_RECEIVER",
    expected: "block",
    snapOnly: false,
    note: "With poison RPC: unverifiable, chain mismatch at sequence 1.",
    tx: { kind: "eth", to: DRAINER_RECEIVER_1 },
  },
  {
    id: "send-paid-lookalike-1",
    title: "Send ETH to a paid lookalike",
    group: "Send ETH",
    subjectLabel: "paid-lookalike-1",
    subject: "0x8B075F39Bb2bFd0125e6599d879B994b813530b1",
    lists: ["tocsin.eth", "lanterndao.eth"],
    category: "PAID_LOOKALIKE",
    expected: "block",
    snapOnly: false,
    tx: { kind: "eth", to: "0x8B075F39Bb2bFd0125e6599d879B994b813530b1" },
  },
  {
    id: "send-theft-proceeds-1",
    title: "Send ETH to theft proceeds",
    group: "Send ETH",
    subjectLabel: "theft-proceeds-1",
    subject: "0xCd2698C9c9b2b69625DD2a56252190647F34913d",
    lists: ["tocsin.eth"],
    category: "THEFT_PROCEEDS",
    expected: "warn",
    snapOnly: false,
    note: "Category 8 never blocks a send.",
    tx: { kind: "eth", to: "0xCd2698C9c9b2b69625DD2a56252190647F34913d" },
  },
  {
    id: "send-lantern-poisoning-operator-1",
    title: "Send ETH to a lanterndao-only operator",
    group: "Send ETH",
    subjectLabel: "lantern-poisoning-operator-1",
    subject: "0xd59557f9a8f3574f58FDc8ea63E4f9B1F7486B22",
    lists: ["lanterndao.eth"],
    category: "POISONING_OPERATOR",
    expected: "warn",
    snapOnly: true,
    note: "Snap policy set to 1 writer: block.",
    tx: { kind: "eth", to: "0xd59557f9a8f3574f58FDc8ea63E4f9B1F7486B22" },
  },
  {
    id: "send-poisoning-funder-1",
    title: "Send ETH to a poisoning funder",
    group: "Send ETH",
    subjectLabel: "poisoning-funder-1",
    subject: "0xC6c795A123830c94299c35ecDa2539E039D85908",
    lists: ["lanterndao.eth"],
    category: "POISONING_FUNDER",
    expected: "warn",
    snapOnly: true,
    note: "warn-only category; toggle in Snap policy",
    tx: { kind: "eth", to: "0xC6c795A123830c94299c35ecDa2539E039D85908" },
  },
  {
    id: "send-harbor-drainer-receiver-1",
    title: "Send ETH to a harborwatch-only drainer",
    group: "Send ETH",
    subjectLabel: "harbor-drainer-receiver-1",
    subject: "0x43F13e6b61E179FD0227749499E87e28fC1e46F7",
    lists: ["harborwatch.eth"],
    category: "DRAINER_RECEIVER",
    expected: "block",
    snapOnly: true,
    note: "One weight-255 writer blocks alone.",
    tx: { kind: "eth", to: "0x43F13e6b61E179FD0227749499E87e28fC1e46F7" },
  },
  {
    id: "send-paid-lookalike-retracted",
    title: "Send ETH to a retracted lookalike",
    group: "Send ETH",
    subjectLabel: "paid-lookalike-retracted",
    subject: "0x9dF85792C46Ff0D052090AB6d911C9651F44CF34",
    lists: [],
    category: "PAID_LOOKALIKE",
    expected: "clean",
    snapOnly: false,
    note: "Tombstoned.",
    tx: { kind: "eth", to: "0x9dF85792C46Ff0D052090AB6d911C9651F44CF34" },
  },
  {
    id: "transfer-real-usdc-drainer",
    title: "Send 1 realUSDC to the drainer receiver",
    group: "Send token",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    lists: ["tocsin.eth", "harborwatch.eth", "lanterndao.eth"],
    category: "DRAINER_RECEIVER",
    expected: "block",
    snapOnly: false,
    note: "The recipient sits inside the ERC-20 transfer calldata.",
    tx: { kind: "transfer", token: REAL_USDC, to: DRAINER_RECEIVER_1 },
  },
  {
    id: "transfer-fake-usdc",
    title: "Send 1 fakeUSDC to the demo account",
    group: "Send token",
    subjectLabel: "fakeUSDC",
    subject: FAKE_USDC,
    lists: ["tocsin.eth"],
    category: "MALICIOUS_TOKEN",
    expected: "block",
    snapOnly: true,
    note: "The token contract itself is flagged, so the verdict names the token.",
    tx: { kind: "transfer", token: FAKE_USDC, to: DEMO_ACCOUNT },
  },
  {
    id: "approve-drainer-spender-1",
    title: "Approve a drainer spender for 1 realUSDC",
    group: "Approve",
    subjectLabel: "drainer-spender-1",
    subject: "0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e",
    lists: ["tocsin.eth", "harborwatch.eth"],
    category: "DRAINER_SPENDER",
    expected: "block",
    snapOnly: false,
    tx: { kind: "approve", token: REAL_USDC, spender: "0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e" },
  },
  {
    id: "approve-swap-router",
    title: "Approve SwapRouter02 for 1 realUSDC",
    group: "Approve",
    subjectLabel: "SwapRouter02",
    subject: SWAP_ROUTER_02,
    lists: [],
    category: null,
    expected: "clean",
    snapOnly: false,
    note: "Run this before the clean swap.",
    tx: { kind: "approve", token: REAL_USDC, spender: SWAP_ROUTER_02 },
  },
  {
    id: "swap-drainer-receiver-1",
    title: "Swap 1 realUSDC for WETH, paid to the drainer receiver",
    group: "Swap",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    lists: ["tocsin.eth", "harborwatch.eth", "lanterndao.eth"],
    category: "DRAINER_RECEIVER",
    expected: "block",
    snapOnly: false,
    note: "The recipient sits inside the exactInputSingle params.",
    tx: { kind: "swap", recipient: DRAINER_RECEIVER_1 },
  },
  {
    id: "swap-clean",
    title: "Swap 1 realUSDC for WETH, paid to you",
    group: "Swap",
    subjectLabel: "connected account",
    subject: "connected",
    lists: [],
    category: null,
    expected: "clean",
    snapOnly: false,
    note: "Needs the pool.",
    tx: { kind: "swap", recipient: "connected" },
  },
];

export const GROUPS: Group[] = ["Send ETH", "Send token", "Approve", "Swap"];

const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const swapRouterAbi = parseAbi([
  "struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)",
]);

/** The call a scenario's button sends. No lookups: the wallet does all the checking. */
export const buildTx = (tx: ScenarioTx, connected: Address): { to: Address; data?: Hex; value?: bigint } => {
  switch (tx.kind) {
    case "eth":
      return { to: tx.to, value: ETH_AMOUNT };
    case "transfer":
      return {
        to: tx.token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [tx.to, ONE_USDC] }),
      };
    case "approve":
      return {
        to: tx.token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [tx.spender, ONE_USDC] }),
      };
    case "swap":
      return {
        to: SWAP_ROUTER_02,
        data: encodeFunctionData({
          abi: swapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: REAL_USDC,
              tokenOut: SEPOLIA_WETH,
              fee: SWAP_FEE,
              recipient: tx.recipient === "connected" ? connected : tx.recipient,
              amountIn: ONE_USDC,
              amountOutMinimum: 0n,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      };
  }
};
