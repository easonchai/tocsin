// node --test against the built dist/bundle.js (run `yarn build` first). Fakes only the outside: the
// `snap` global (state, dialogs, interfaces) and `fetch` (a Sepolia JSON-RPC, a lying RPC, the list
// host, the mirror). Everything inside, the reader included, is the shipped bundle.
// Fixtures are built with the reader's own chain and list helpers so the hashes cannot drift.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  type Address,
  type Hex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  getAddress,
  hexToBigInt,
  numberToHex,
  pad,
  parseAbi,
  toFunctionSelector,
  zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foldHead, leafHash, threatFlagLogAbi, writerHeadSlot, writerSeqSlot } from "../../reader/src/chain.ts";
import { encodeListRecord, listRoot, listRootTypedData } from "../../reader/src/lists/index.ts";

const LOG = getAddress("0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14");
const UR = getAddress("0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe");
const MANUAL = getAddress("0x00000000000000000000000000000000000a11ce");
const DETECTOR = getAddress("0x00000000000000000000000000000000000de7ec");
const DRAINER = getAddress("0xd7a1000000000000000000000000000000000bad");
const SPENDER = getAddress("0x5bead00000000000000000000000000000000bad");
const CLEAN = getAddress("0xc1ea000000000000000000000000000000000001");
const EVIDENCE: Hex = `0x${"ee".repeat(32)}`;

// --- the log: two FLAG leaves from the manual writer, none from the detector -----------------
type Raw = { blockNumber: bigint; topics: Hex[]; data: Hex; writer: Address; writerSeq: bigint };
const appended = threatFlagLogAbi.find((x) => x.type === "event" && x.name === "Appended")!;
const dataParams = appended.inputs.filter((i) => !("indexed" in i));
const logs: Raw[] = [];
let head: Hex = zeroHash;
for (const [i, [subject, category]] of ([[DRAINER, 3], [SPENDER, 7]] as const).entries()) {
  const writerSeq = BigInt(i + 1);
  const blockNumber = 101n + BigInt(i);
  const leaf = { chainId: 11155111n, subject, category, op: 0, evidence: EVIDENCE, seenBlock: 100n, refLeaf: zeroHash };
  const lh = leafHash({ writer: MANUAL, blockNumber, writerSeq, globalSeq: writerSeq, leaf });
  head = foldHead(head, lh);
  logs.push({
    blockNumber,
    writer: MANUAL,
    writerSeq,
    topics: encodeEventTopics({ abi: threatFlagLogAbi, eventName: "Appended", args: { writer: MANUAL, writerSeq } }) as Hex[],
    data: encodeAbiParameters(dataParams, [writerSeq, lh, head, head, leaf]),
  });
}
const heads: Record<Address, { head: Hex; seq: bigint }> = { [MANUAL]: { head, seq: 2n }, [DETECTOR]: { head: zeroHash, seq: 0n } };
const slotValue = new Map<string, Hex>();
for (const [w, v] of Object.entries(heads) as [Address, (typeof heads)[Address]][]) {
  slotValue.set(writerHeadSlot(w), v.head);
  slotValue.set(writerSeqSlot(w), numberToHex(v.seq));
}

// --- the list -------------------------------------------------------------------------------
const entry = (writer: Address, weight: number) => ({
  writer,
  weight,
  operator: zeroHash,
  upstream: zeroHash,
  fromBlock: 0n,
  toBlock: 0n,
  headPin: zeroHash,
  categories: 1n, // bit 0: trust categories 1 to 127
  snapshotURI: `https://mirror.test/${writer}.json`,
});
async function signedList(key: Hex, version: bigint) {
  const maintainer = privateKeyToAccount(key);
  const list = { log: LOG, chainId: 11155111n, maintainer: maintainer.address, version, entries: [entry(MANUAL, 255), entry(DETECTOR, 1)] };
  const root = listRoot(list);
  const signature = await maintainer.signTypedData(listRootTypedData(list, root));
  const document = JSON.parse(JSON.stringify(list, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return { record: encodeListRecord({ root, version, signature, listURI: "https://lists.test/default.json" }), document, maintainer: maintainer.address };
}

// --- fake network -----------------------------------------------------------------------------
const urAbi = parseAbi([
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)",
  "function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string name, address resolver, address reverseResolver)",
]);
const resolverAbi = parseAbi(["function text(bytes32 node, string key) view returns (string)", "function addr(bytes32 node) view returns (address)"]);
const RESOLVER = getAddress("0x0000000000000000000000000000000000000e45");

type World = { list: Awaited<ReturnType<typeof signedList>>; requests: string[] };
const world = { requests: [] } as unknown as World;
let chainId = "0xaa36a7";
let teamGone = false; // walkaway: the team's ENS records, list host and mirror all stop answering

function rpc(method: string, params: any[], lying: boolean): unknown {
  if (method === "eth_chainId") return chainId;
  if (method === "eth_blockNumber") return "0x200";
  if (method === "eth_getBlockByNumber")
    return { number: params[0] === "finalized" ? "0x1f0" : "0x200", hash: pad("0x200", { size: 32 }), stateRoot: pad("0x5", { size: 32 }) };
  if (method === "eth_getProof")
    return { storageProof: (params[1] as Hex[]).map((key) => ({ key, value: slotValue.get(key) ?? "0x0", proof: [] })) };
  if (method === "eth_getLogs") {
    const [{ topics, fromBlock, toBlock }] = params;
    return logs
      .filter((l) => !(lying && l.writerSeq === 1n)) // the lying RPC drops the manual writer's first leaf
      .filter((l) => l.topics[1] === topics[1] && (!topics[2] || l.topics[2] === topics[2]))
      .filter((l) => l.blockNumber >= hexToBigInt(fromBlock) && l.blockNumber <= hexToBigInt(toBlock))
      .map((l) => ({ blockNumber: numberToHex(l.blockNumber), topics: l.topics, data: l.data, removed: false }));
  }
  if (method === "eth_call") {
    const { to, data } = params[0] as { to: Address; data: Hex };
    assert.equal(getAddress(to), UR, "every ENS read goes to the Universal Resolver");
    if (teamGone) throw Object.assign(new Error("execution reverted"), { rpc: true }); // name and records deleted
    if (data.startsWith(toFunctionSelector(urAbi[1]))) {
      const [lookup, , gateways] = decodeFunctionData({ abi: urAbi, data }).args as [Hex, bigint, string[]];
      assert.deepEqual(gateways, [], "CCIP-read stays off");
      if (getAddress(lookup) !== MANUAL) throw Object.assign(new Error("execution reverted"), { rpc: true });
      return encodeFunctionResult({ abi: urAbi, functionName: "reverseWithGateways", result: ["manual.tocsin.eth", RESOLVER, RESOLVER] });
    }
    const [, inner, gateways] = decodeFunctionData({ abi: urAbi, data }).args as [Hex, Hex, string[]];
    assert.deepEqual(gateways, [], "CCIP-read stays off");
    const call = decodeFunctionData({ abi: resolverAbi, data: inner });
    const result =
      call.functionName === "text"
        ? encodeFunctionResult({ abi: resolverAbi, functionName: "text", result: world.list.record })
        : encodeFunctionResult({ abi: resolverAbi, functionName: "addr", result: MANUAL });
    return encodeFunctionResult({ abi: urAbi, functionName: "resolveWithGateways", result: [result, RESOLVER] });
  }
  throw new Error(`unexpected ${method}`);
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
async function fakeFetch(input: string, init?: RequestInit): Promise<Response> {
  const url = new URL(input);
  world.requests.push(url.host);
  if (url.host === "rpc.test" || url.host === "liar.test") {
    const { id, method, params } = JSON.parse(String(init?.body));
    try {
      return json({ jsonrpc: "2.0", id, result: rpc(method, params, url.host === "liar.test") });
    } catch (e) {
      if (!(e as { rpc?: boolean }).rpc) throw e;
      return json({ jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted" } });
    }
  }
  if (teamGone && (url.host === "lists.test" || url.host === "mirror.test")) throw new TypeError("fetch failed");
  if (url.host === "lists.test") return json(world.list.document);
  if (url.host === "mirror.test") {
    const w = url.pathname.slice(1, -".json".length);
    return json(logs.filter((l) => l.writer === getAddress(w)).map((l) => ({ blockNumber: l.blockNumber.toString(), topics: l.topics, data: l.data })));
  }
  return new Response("not found", { status: 404 });
}

// --- fake snap ------------------------------------------------------------------------------
let stored: unknown = null;
const dialogs: unknown[] = [];
let dialogAnswer = false;
let ui: unknown;
const snap = {
  async request({ method, params }: { method: string; params: any }) {
    if (method === "snap_manageState") {
      if (params.operation === "get") return stored;
      stored = JSON.parse(JSON.stringify(params.newState)); // only JSON survives, like the real store
      return null;
    }
    if (method === "snap_dialog") {
      dialogs.push(params);
      return dialogAnswer;
    }
    if (method === "snap_createInterface" || method === "snap_updateInterface") {
      ui = params.ui;
      return "ui-1";
    }
    throw new Error(`unexpected ${method}`);
  },
};

const code = readFileSync(new URL("../dist/bundle.js", import.meta.url), "utf8");
const mod = { exports: {} as Record<string, (args: unknown) => Promise<any>> };
new Function("module", "exports", "snap", "fetch", code)(mod, mod.exports, snap, fakeFetch);
const h = mod.exports;

const text = (x: unknown) => JSON.stringify(x);
const submit = (fields: Record<string, string>) =>
  h.onUserInput!({
    id: "ui-1",
    context: null,
    event: {
      type: "FormSubmitEvent",
      name: "settings",
      value: { rpcUrl: "https://rpc.test/", listName: "tocsin.eth", leafSource: "rpc", customUrl: "https://liar.test/", fromBlock: "100", ...fields },
    },
  });
const send = (to: Address) => h.onTransaction!({ transaction: { to, data: "0x", from: CLEAN }, chainId: "eip155:11155111" });
const sign = (spender: Address) =>
  h.onSignature!({
    signature: {
      from: CLEAN,
      signatureMethod: "eth_signTypedData_v4",
      data: { primaryType: "Permit", domain: { chainId: 11155111 }, message: { owner: CLEAN, spender, value: "1" } },
    },
  });

test("exports exactly the handlers the manifest permits", () => {
  assert.deepEqual(Object.keys(h).sort(), ["onCronjob", "onInstall", "onSettingsPage", "onSignature", "onTransaction", "onUserInput"]);
});

test("before any list, the panel says it has not synced and does not claim clean", async () => {
  world.list = await signedList(generatePrivateKey(), 1n);
  await h.onInstall!({ origin: "metamask", originMetadata: null }); // the default build has no list name
  const r = await send(DRAINER);
  assert.equal(r.severity, undefined);
  assert.match(text(r.content), /not synced yet/);
  assert.match(text(r.content), /set the list's ENS name in settings/);
});

test("beat 1: honest RPC blocks the drainer receiver before confirm", async () => {
  await submit({});
  assert.match(text(ui), /synced to sequence 2/);
  assert.match(text(ui), new RegExp(world.list.maintainer));
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  const c = text(r.content);
  for (const s of ["Blocked by your pinned list", "manual.tocsin.eth", "Drainer receiver", `https://sepolia.etherscan.io/tx/${EVIDENCE}`, "best-effort", "unverified", "the RPC is not anonymised", "Whether the writer is right is your pinned list speaking"]) {
    assert.ok(c.includes(s), `panel lacks "${s}"`);
  }
});

test("the detector shows as a shortened address without a verified name", () => {
  assert.match(text(ui), /0x0000…e7ec/);
});

test("a clean address is clean only because every pinned writer synced", async () => {
  const r = await send(CLEAN);
  assert.equal(r.severity, undefined);
  assert.match(text(r.content), /No pinned writer flags this/);
});

test("on another chain a Sepolia-only flag does not count, and the panel names the chain", async () => {
  const r = await h.onTransaction!({ transaction: { to: DRAINER, data: "0x", from: CLEAN }, chainId: "eip155:1" });
  assert.equal(r.severity, undefined);
  assert.match(text(r.content), /on chain 1, not Sepolia/);
  assert.doesNotMatch(text(await send(CLEAN)), /not Sepolia/);
});

test("a permit for a flagged spender is blocked at signing; a non-permit signature gets no panel", async () => {
  const r = await sign(SPENDER);
  assert.equal(r.severity, "critical");
  assert.match(text(r.content), /Drainer spender/);
  assert.match(text(r.content), /EIP-2612 permit spender/);
  assert.equal(await h.onSignature!({ signature: { from: CLEAN, signatureMethod: "personal_sign", data: "0x00" } }), null);
});

test("an approve to a flagged spender is blocked in the transaction", async () => {
  const data = `0x095ea7b3${pad(SPENDER).slice(2)}${"f".repeat(64)}`;
  const r = await h.onTransaction!({ transaction: { to: CLEAN, data, from: CLEAN }, chainId: "eip155:11155111" });
  assert.equal(r.severity, "critical");
  assert.match(text(r.content), /ERC-20 approve spender/);
});

test("beat 2: the lying RPC makes the writer unverifiable at the dropped sequence, never clean", async () => {
  await submit({ leafSource: "custom" });
  assert.ok(world.requests.includes("liar.test"));
  for (const subject of [DRAINER, CLEAN]) {
    const r = await send(subject);
    assert.equal(r.severity, undefined);
    assert.match(text(r.content), /cannot vouch/);
    assert.match(text(r.content), /chain mismatch at sequence 1/);
  }
});

test("beat 3: the mirror restores the block", async () => {
  await submit({ leafSource: "snapshot" });
  assert.ok(world.requests.includes("mirror.test"));
  assert.equal((await send(DRAINER)).severity, "critical");
});

test("the cron job syncs; a changed maintainer asks, and a no keeps the pin and is not asked again", async () => {
  const before = world.list.maintainer;
  world.list = await signedList(generatePrivateKey(), 2n);
  dialogAnswer = false;
  await h.onCronjob!({ request: { method: "sync" } });
  assert.equal(dialogs.length, 1);
  assert.match(text(dialogs[0]), /List maintainer changed/);
  assert.match(text(dialogs[0]), new RegExp(world.list.maintainer));
  await h.onCronjob!({ request: { method: "sync" } });
  assert.equal(dialogs.length, 1, "a declined list is not prompted again");
  await h.onSettingsPage!(undefined);
  assert.match(text(ui), new RegExp(before));
  assert.match(text(ui), /was declined/);
  assert.equal((await send(DRAINER)).severity, "critical", "the old pin still applies");
});

test("a yes pins the new maintainer", async () => {
  world.list = await signedList(generatePrivateKey(), 3n);
  dialogAnswer = true;
  await h.onCronjob!({ request: { method: "sync" } });
  assert.equal(dialogs.length, 2);
  await h.onSettingsPage!(undefined);
  assert.match(text(ui), new RegExp(world.list.maintainer));
});

test("bigints survive the JSON-only state store", () => {
  assert.match(JSON.stringify(stored), /"\$n":"512"/);
});

test("an RPC on another chain fails the sync, and the panel says the result is from the sync before", async () => {
  chainId = "0x1";
  await h.onCronjob!({ request: { method: "sync" } });
  chainId = "0xaa36a7";
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  assert.match(text(r.content), /is not Sepolia \(chain 0x1\)/);
  assert.match(text(r.content), /uses the sync before it/);
});

test("invalid settings show field errors and change nothing", async () => {
  const before = JSON.stringify(stored);
  await submit({ rpcUrl: "http://rpc.test/" });
  assert.match(text(ui), /Enter an https URL/);
  assert.equal(JSON.stringify(stored), before);
});

test("a dead leaf source names its error right after Sync, not only after a reload", async () => {
  await submit({ leafSource: "custom", customUrl: "https://dead.test/" });
  assert.match(text(ui), /source failed: request to dead\.test failed: HTTP 404 from dead\.test/);
  await h.onSettingsPage!(undefined);
  assert.match(text(ui), /source failed: request to dead\.test failed: HTTP 404 from dead\.test/);
  assert.match(text(ui), /0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14 on Sepolia/);
});

test("walkaway: with the team's name, list host and mirror gone, the pinned list plus the log still block", async () => {
  teamGone = true;
  const pinnedMaintainer = world.list.maintainer;
  // Switching to the RPC source drops checkpoints, so this replays every leaf from the log itself.
  await submit({ leafSource: "rpc" });
  assert.match(text(ui), /stale/, "the list record is unverifiable, so the pin is kept and marked stale");
  assert.match(text(ui), new RegExp(pinnedMaintainer));
  assert.match(text(ui), /synced to sequence 2/);
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  const c = text(r.content);
  assert.match(c, /Drainer receiver/);
  assert.doesNotMatch(c, /uses the sync before it/, "a fresh sync succeeded; this is not a cached result");
  assert.match(c, /0x0000…11cE/,"without the team's reverse record the writer shows as a short address");
  teamGone = false;
});
