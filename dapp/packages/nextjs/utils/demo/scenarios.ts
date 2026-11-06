// The demo page's scenario table: the three lists, their writers, and who flagged each subject.
// Labels, lists, categories and verdicts follow docs/plan/demo/test-addresses.tsv and the seed list
// documents; scenarios.test.ts and explain.test.ts fail when they drift apart.
// Imports stay relative and type-only (besides viem) so `node --test` can load this file directly.
import { type Address, type Hex, encodeFunctionData, parseAbi, parseEther } from "viem";

// `yarn start` installs from the local Snap server (mm-snap serve); a production build installs the published
// package, named as in snap.manifest.json. NEXT_PUBLIC_SNAP_ID overrides either, e.g. a local build pointed at :8080.
export const SNAP_ID =
  process.env.NEXT_PUBLIC_SNAP_ID ||
  (process.env.NODE_ENV === "production" ? "npm:@tocsin/snap" : "local:http://localhost:8080");
export const SNAP_IS_LOCAL = SNAP_ID.startsWith("local:");
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

export type Verdict = "clean" | "warn" | "block" | "unverifiable";
export type ListName = "core.tocsin.eth" | "blockaid.tocsin.eth" | "scamsniffer.tocsin.eth";
export type Group = "Send ETH" | "Send token" | "Approve" | "Swap";
export type Context = "recipient" | "spender" | "token";
export type Category =
  | "POISONING_OPERATOR"
  | "POISONING_FUNDER"
  | "DRAINER_RECEIVER"
  | "MALICIOUS_DELEGATE"
  | "MALICIOUS_TOKEN"
  | "PAID_LOOKALIKE"
  | "DRAINER_SPENDER"
  | "THEFT_PROCEEDS";

export type WriterId = "core" | "detector" | "blockaid" | "scamsniffer";
export type Writer = { id: WriterId; label: string; address: Address; weight: 0 | 1 | 255; operator: Hex };
export type List = { name: ListName; short: string; role: string; writers: Writer[] };

const CORE_OPERATOR: Hex = "0x50d9caca575dee80d39cc3050164ec8e74728ee8b47ab646b3e4914a12dd8c37";

// Pinned to docs/plan/demo/seed/*.list.json by explain.test.ts. Every list is followed as blocking.
export const LISTS: List[] = [
  {
    name: "core.tocsin.eth",
    short: "core",
    role: "us",
    writers: [
      {
        id: "core",
        label: "core",
        address: "0x36a279136adDde960599fcA356369C04A96D387E",
        weight: 255,
        operator: CORE_OPERATOR,
      },
      {
        id: "detector",
        label: "detector",
        address: "0xe3a9678eD0992416C5230f52E3B1fF9775CCA999",
        weight: 1,
        operator: CORE_OPERATOR,
      },
    ],
  },
  {
    name: "blockaid.tocsin.eth",
    short: "blockaid",
    role: "security vendor",
    writers: [
      {
        id: "blockaid",
        label: "blockaid",
        address: "0x6f1524F5A1152d6b08ef8833E42E4311151e904F",
        weight: 255,
        operator: "0xe7a041cfbddd178dbe1f2f90ab480ec79c67c283fd72107f250a18e69b13ae41",
      },
    ],
  },
  {
    name: "scamsniffer.tocsin.eth",
    short: "scamsniffer",
    role: "phishing researchers",
    writers: [
      {
        id: "scamsniffer",
        label: "scamsniffer",
        address: "0x3a05D06949b9890aEAD4700AA5ECEbf4D1BA0Ba0",
        weight: 1,
        operator: "0xa4e730f9bd2fa8f2cdd06a3c4170a70a906e328c94f77ba9bbb7c29b98d95efd",
      },
    ],
  },
];

// "connected" resolves to the connected account when the button is pressed.
export type ScenarioTx =
  | { kind: "eth"; to: Address }
  | { kind: "transfer"; token: Address; to: Address }
  | { kind: "approve"; token: Address; spender: Address }
  | { kind: "swap"; recipient: Address | "connected" };

// One leaf a writer put on the log for this subject. A tombstoned flag was retracted by the same writer.
export type Flag = { writer: WriterId; tombstoned?: true };

export type Scenario = {
  id: string;
  title: string;
  desc: string;
  group: Group;
  // A label from the tsv, or a name for a subject the tsv does not list.
  subjectLabel: string;
  subject: Address | "connected";
  // The contract the call goes to when it is not the subject, shown on the stage.
  via?: { label: string; address: Address };
  // The tsv type column; null when nothing flags the subject.
  category: Category | null;
  flags: Flag[];
  expected: Verdict;
  // Runbook beat 2: the Snap reads leaves through the lying proxy at POISON_RPC.
  poison?: true;
  snapOnly: boolean;
  tag?: string;
  tx: ScenarioTx;
};

const DRAINER_RECEIVER_1: Address = "0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537";
const DRAINER_FLAGS: Flag[] = [{ writer: "core" }, { writer: "blockaid" }, { writer: "scamsniffer" }];

export const SCENARIOS: Scenario[] = [
  {
    id: "send-clean",
    title: "Clean send",
    desc: "A normal transfer to an address nobody has flagged.",
    group: "Send ETH",
    subjectLabel: "demo account",
    subject: DEMO_ACCOUNT,
    category: null,
    flags: [],
    expected: "clean",
    snapOnly: false,
    tx: { kind: "eth", to: DEMO_ACCOUNT },
  },
  {
    id: "send-poisoning-operator-1",
    title: "Poisoning operator",
    desc: "Sends dust from a lookalike address so you copy it later.",
    group: "Send ETH",
    subjectLabel: "poisoning-operator-1",
    subject: "0x5126633bCFdb9E4A2FE7AB445394AE0a217f9120",
    category: "POISONING_OPERATOR",
    flags: [{ writer: "detector" }, { writer: "scamsniffer" }],
    expected: "warn",
    snapOnly: false,
    tx: { kind: "eth", to: "0x5126633bCFdb9E4A2FE7AB445394AE0a217f9120" },
  },
  {
    id: "send-drainer-receiver-1",
    title: "Drainer receiver",
    desc: "The address a drainer kit sweeps victims' funds into.",
    group: "Send ETH",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    category: "DRAINER_RECEIVER",
    flags: DRAINER_FLAGS,
    expected: "block",
    snapOnly: false,
    tx: { kind: "eth", to: DRAINER_RECEIVER_1 },
  },
  {
    // Only core flags drainer-receiver-4, so the proxy's dropped core leaf (seq 93) leaves nothing
    // else to block on. drainer-receiver-1 still reads Blocked here through blockaid's flag.
    id: "send-drainer-receiver-4-poison",
    title: "Drainer receiver, lying RPC",
    desc: "The RPC hides one of core's entries. Watch the fold not add up.",
    group: "Send ETH",
    subjectLabel: "drainer-receiver-4",
    subject: "0xe25d04e7a7B357179eBf53b16f4C5304c6818fb9",
    category: "DRAINER_RECEIVER",
    flags: [{ writer: "core" }],
    expected: "unverifiable",
    poison: true,
    snapOnly: false,
    tag: "beat 2",
    tx: { kind: "eth", to: "0xe25d04e7a7B357179eBf53b16f4C5304c6818fb9" },
  },
  {
    id: "send-sniffer-poisoning-operator-1",
    title: "One list, weight 1",
    desc: "Warns by default. Blocks when the policy is one writer.",
    group: "Send ETH",
    subjectLabel: "lantern-poisoning-operator-1",
    subject: "0xd59557f9a8f3574f58FDc8ea63E4f9B1F7486B22",
    category: "POISONING_OPERATOR",
    flags: [{ writer: "scamsniffer" }],
    expected: "warn",
    snapOnly: false,
    tx: { kind: "eth", to: "0xd59557f9a8f3574f58FDc8ea63E4f9B1F7486B22" },
  },
  {
    id: "send-theft-proceeds-1",
    title: "Theft proceeds",
    desc: "Where stolen funds went. This category warns, never blocks.",
    group: "Send ETH",
    subjectLabel: "theft-proceeds-1",
    subject: "0xCd2698C9c9b2b69625DD2a56252190647F34913d",
    category: "THEFT_PROCEEDS",
    flags: [{ writer: "core" }],
    expected: "warn",
    snapOnly: false,
    tx: { kind: "eth", to: "0xCd2698C9c9b2b69625DD2a56252190647F34913d" },
  },
  {
    id: "send-paid-lookalike-retracted",
    title: "Retracted lookalike",
    desc: "Flagged, then retracted with a tombstone. Both entries stay.",
    group: "Send ETH",
    subjectLabel: "paid-lookalike-retracted",
    subject: "0x9dF85792C46Ff0D052090AB6d911C9651F44CF34",
    category: "PAID_LOOKALIKE",
    flags: [{ writer: "core", tombstoned: true }],
    expected: "clean",
    snapOnly: false,
    tx: { kind: "eth", to: "0x9dF85792C46Ff0D052090AB6d911C9651F44CF34" },
  },
  {
    id: "send-paid-lookalike-1",
    title: "Paid lookalike",
    desc: "A vanity address bought to look like one you trust.",
    group: "Send ETH",
    subjectLabel: "paid-lookalike-1",
    subject: "0x8B075F39Bb2bFd0125e6599d879B994b813530b1",
    category: "PAID_LOOKALIKE",
    flags: [{ writer: "core" }, { writer: "scamsniffer" }],
    expected: "block",
    snapOnly: false,
    tx: { kind: "eth", to: "0x8B075F39Bb2bFd0125e6599d879B994b813530b1" },
  },
  {
    id: "send-poisoning-funder-1",
    title: "Poisoning funder",
    desc: "Pays for a poisoning campaign's gas. This category warns by default.",
    group: "Send ETH",
    subjectLabel: "poisoning-funder-1",
    subject: "0xC6c795A123830c94299c35ecDa2539E039D85908",
    category: "POISONING_FUNDER",
    flags: [{ writer: "scamsniffer" }],
    expected: "warn",
    snapOnly: false,
    tx: { kind: "eth", to: "0xC6c795A123830c94299c35ecDa2539E039D85908" },
  },
  {
    id: "send-blockaid-drainer-receiver-1",
    title: "One vendor, weight 255",
    desc: "Only the security vendor flagged it. One heavy writer is enough.",
    group: "Send ETH",
    subjectLabel: "harbor-drainer-receiver-1",
    subject: "0x43F13e6b61E179FD0227749499E87e28fC1e46F7",
    category: "DRAINER_RECEIVER",
    flags: [{ writer: "blockaid" }],
    expected: "block",
    snapOnly: false,
    tx: { kind: "eth", to: "0x43F13e6b61E179FD0227749499E87e28fC1e46F7" },
  },
  {
    id: "transfer-real-usdc-drainer",
    title: "realUSDC to a drainer",
    desc: "The recipient sits inside the ERC-20 transfer calldata.",
    group: "Send token",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    via: { label: "realUSDC", address: REAL_USDC },
    category: "DRAINER_RECEIVER",
    flags: DRAINER_FLAGS,
    expected: "block",
    snapOnly: false,
    tx: { kind: "transfer", token: REAL_USDC, to: DRAINER_RECEIVER_1 },
  },
  {
    id: "transfer-fake-usdc",
    title: "fakeUSDC to a clean address",
    desc: "The token contract itself is the flagged thing.",
    group: "Send token",
    subjectLabel: "fakeUSDC",
    subject: FAKE_USDC,
    category: "MALICIOUS_TOKEN",
    flags: [{ writer: "core" }],
    expected: "block",
    snapOnly: false,
    tx: { kind: "transfer", token: FAKE_USDC, to: DEMO_ACCOUNT },
  },
  {
    id: "approve-drainer-spender-1",
    title: "Approve a drainer spender",
    desc: "The spender of your allowance is the subject, not the token.",
    group: "Approve",
    subjectLabel: "drainer-spender-1",
    subject: "0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e",
    via: { label: "realUSDC", address: REAL_USDC },
    category: "DRAINER_SPENDER",
    flags: [{ writer: "core" }, { writer: "blockaid" }],
    expected: "block",
    snapOnly: false,
    tx: { kind: "approve", token: REAL_USDC, spender: "0x7d77cf49d8c1851781C3cEfCdD9Bd9871366782e" },
  },
  {
    id: "approve-swap-router",
    title: "Approve SwapRouter02",
    desc: "A real router. Run this before the clean swap.",
    group: "Approve",
    subjectLabel: "SwapRouter02",
    subject: SWAP_ROUTER_02,
    via: { label: "realUSDC", address: REAL_USDC },
    category: null,
    flags: [],
    expected: "clean",
    snapOnly: false,
    tx: { kind: "approve", token: REAL_USDC, spender: SWAP_ROUTER_02 },
  },
  {
    id: "swap-drainer-receiver-1",
    title: "Swap, recipient drainer",
    desc: "The decoder reads through SwapRouter02 to the recipient.",
    group: "Swap",
    subjectLabel: "drainer-receiver-1",
    subject: DRAINER_RECEIVER_1,
    via: { label: "SwapRouter02", address: SWAP_ROUTER_02 },
    category: "DRAINER_RECEIVER",
    flags: DRAINER_FLAGS,
    expected: "block",
    snapOnly: false,
    tx: { kind: "swap", recipient: DRAINER_RECEIVER_1 },
  },
  {
    id: "swap-clean",
    title: "Swap, paid to you",
    desc: "1 realUSDC for WETH, back to your own account. Needs the approval first.",
    group: "Swap",
    subjectLabel: "connected account",
    subject: "connected",
    via: { label: "SwapRouter02", address: SWAP_ROUTER_02 },
    category: null,
    flags: [],
    expected: "clean",
    snapOnly: false,
    tx: { kind: "swap", recipient: "connected" },
  },
];

export const GROUPS: Group[] = ["Send ETH", "Send token", "Approve", "Swap"];

/** Which role the subject plays in the call: the spender of an approve, the token itself, or the payee. */
export const contextOf = (s: Scenario): Context =>
  s.tx.kind === "approve" ? "spender" : s.tx.kind === "transfer" && s.subject === s.tx.token ? "token" : "recipient";

export const writerById = (id: WriterId, lists: readonly List[] = LISTS): { writer: Writer; list: List } => {
  for (const list of lists) {
    const writer = list.writers.find(w => w.id === id);
    if (writer) return { writer, list };
  }
  throw new Error(`writer ${id} is on no list`);
};

/** The lists with a live (not tombstoned) flag on the subject, in LISTS order. */
export const listsOf = (s: Scenario): ListName[] =>
  LISTS.filter(l => s.flags.some(f => !f.tombstoned && l.writers.some(w => w.id === f.writer))).map(l => l.name);

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
