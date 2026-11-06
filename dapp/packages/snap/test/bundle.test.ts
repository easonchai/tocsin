// node --test against the built dist/bundle.js (run `yarn build` first). Fakes only the outside: the
// `snap` global (state, dialogs, interfaces) and `fetch` (a Sepolia JSON-RPC, a lying RPC, the list
// host, the mirror). Everything inside, the reader included, is the shipped bundle.
// Fixtures are built with the reader's own chain and list helpers so the hashes cannot drift.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertJSXElement } from "@metamask/snaps-sdk/jsx";
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
const SUSPECT = getAddress("0x5005000000000000000000000000000000000bad");
const EVIDENCE: Hex = `0x${"ee".repeat(32)}`;

// --- the log: two FLAG leaves from the manual writer (weight 255), one from the detector (weight 1)
type Raw = { blockNumber: bigint; topics: Hex[]; data: Hex; writer: Address; writerSeq: bigint };
const appended = threatFlagLogAbi.find((x) => x.type === "event" && x.name === "Appended")!;
const dataParams = appended.inputs.filter((i) => !("indexed" in i));
const logs: Raw[] = [];
const heads: Record<Address, { head: Hex; seq: bigint }> = { [MANUAL]: { head: zeroHash, seq: 0n }, [DETECTOR]: { head: zeroHash, seq: 0n } };
for (const [i, [writer, subject, category]] of ([[MANUAL, DRAINER, 3], [MANUAL, SPENDER, 7], [DETECTOR, SUSPECT, 3]] as const).entries()) {
  const h = heads[writer]!;
  const writerSeq = h.seq + 1n;
  const globalSeq = BigInt(i + 1);
  const blockNumber = 101n + BigInt(i);
  const leaf = { chainId: 11155111n, subject, category, op: 0, evidence: EVIDENCE, seenBlock: 100n, refLeaf: zeroHash };
  const lh = leafHash({ writer, blockNumber, writerSeq, globalSeq, leaf });
  heads[writer] = { head: foldHead(h.head, lh), seq: writerSeq };
  logs.push({
    blockNumber,
    writer,
    writerSeq,
    topics: encodeEventTopics({ abi: threatFlagLogAbi, eventName: "Appended", args: { writer, writerSeq } }) as Hex[],
    data: encodeAbiParameters(dataParams, [globalSeq, lh, heads[writer]!.head, heads[writer]!.head, leaf]),
  });
}
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
async function signedList(key: Hex, version: bigint, entries = [entry(MANUAL, 255), entry(DETECTOR, 1)], listURI = "https://lists.test/default.json") {
  const maintainer = privateKeyToAccount(key);
  const list = { log: LOG, chainId: 11155111n, maintainer: maintainer.address, version, entries };
  const root = listRoot(list);
  const signature = await maintainer.signTypedData(listRootTypedData(list, root));
  const document = JSON.parse(JSON.stringify(list, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return { record: encodeListRecord({ root, version, signature, listURI }), document, listURI, maintainer: maintainer.address };
}

// --- fake network -----------------------------------------------------------------------------
const urAbi = parseAbi([
  "function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)",
  "function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string name, address resolver, address reverseResolver)",
]);
const resolverAbi = parseAbi(["function text(bytes32 node, string key) view returns (string)", "function addr(bytes32 node) view returns (address)"]);
const RESOLVER = getAddress("0x0000000000000000000000000000000000000e45");

type Signed = Awaited<ReturnType<typeof signedList>>;
/** `list` is tocsin.eth's; `others` holds the lists of any other name. */
type World = { list: Signed; others: Record<string, Signed>; requests: string[] };
const world = { requests: [], others: {} } as unknown as World;
const listOf = (name: string): Signed | undefined => (name === "tocsin.eth" ? world.list : world.others[name]);
/** DNS wire format, as the Universal Resolver takes names. */
function dnsName(h: Hex): string {
  const b = Buffer.from(h.slice(2), "hex");
  const labels: string[] = [];
  for (let i = 0; b[i]; i += b[i]! + 1) labels.push(b.subarray(i + 1, i + 1 + b[i]!).toString());
  return labels.join(".");
}
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
      .filter((l) => !(lying && l.writer === MANUAL && l.writerSeq === 1n)) // the lying RPC drops the manual writer's first leaf
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
    const [name, inner, gateways] = decodeFunctionData({ abi: urAbi, data }).args as [Hex, Hex, string[]];
    assert.deepEqual(gateways, [], "CCIP-read stays off");
    const call = decodeFunctionData({ abi: resolverAbi, data: inner });
    const named = listOf(dnsName(name));
    if (call.functionName === "text" && !named) throw Object.assign(new Error("execution reverted"), { rpc: true }); // no such name
    const result =
      call.functionName === "text"
        ? encodeFunctionResult({ abi: resolverAbi, functionName: "text", result: named!.record })
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
  if (url.host === "lists.test") return json([world.list, ...Object.values(world.others)].find((l) => l.listURI === url.href)!.document);
  if (url.host === "mirror.test") {
    const w = url.pathname.slice(1, -".json".length);
    return json(logs.filter((l) => l.writer === getAddress(w)).map((l) => ({ blockNumber: l.blockNumber.toString(), topics: l.topics, data: l.data })));
  }
  return new Response("not found", { status: 404 });
}

// --- fake snap ------------------------------------------------------------------------------
let stored: unknown = null;
const dialogs: { type: string; content: unknown }[] = [];
let dialogAnswer = false;
const interfaces = new Map<string, { ui: unknown; context: unknown }>();
const snap = {
  async request({ method, params }: { method: string; params: any }) {
    if (method === "snap_manageState") {
      if (params.operation === "get") return stored;
      stored = JSON.parse(JSON.stringify(params.newState)); // only JSON survives, like the real store
      return null;
    }
    // MetaMask rejects UI that fails the SDK's own schema; so does this fake.
    if (params?.ui) assertJSXElement(params.ui);
    if (params?.content) assertJSXElement(params.content);
    if (method === "snap_dialog") {
      dialogs.push(params);
      return params.type === "confirmation" ? dialogAnswer : null;
    }
    if (method === "snap_createInterface") {
      const id = `ui-${interfaces.size + 1}`;
      interfaces.set(id, { ui: params.ui, context: params.context ?? null });
      return id;
    }
    if (method === "snap_updateInterface") {
      interfaces.set(params.id, { ...interfaces.get(params.id)!, ui: params.ui });
      return null;
    }
    throw new Error(`unexpected ${method}`);
  },
};

const code = readFileSync(new URL("../dist/bundle.js", import.meta.url), "utf8");
const mod = { exports: {} as Record<string, (args: unknown) => Promise<any>> };
new Function("module", "exports", "snap", "fetch", code)(mod, mod.exports, snap, fakeFetch);
const h = mod.exports;

const text = (x: unknown) => JSON.stringify(x);
const uiOf = (id: string) => text(interfaces.get(id)!.ui);
/** Sends an event the way MetaMask does: with the context the interface was created with. */
const input = (id: string, event: Record<string, unknown>) => h.onUserInput!({ id, event, context: interfaces.get(id)!.context });

let homeId = "";
const home = async () => {
  homeId = (await h.onHomePage!(undefined)).id;
  return uiOf(homeId);
};
const click = async (name: string) => {
  await input(homeId, { type: "ButtonClickEvent", name });
  return uiOf(homeId);
};
const submit = async (name: string, value: Record<string, unknown>) => {
  await input(homeId, { type: "FormSubmitEvent", name, value });
  return uiOf(homeId);
};
const setRpc = (rpcUrl: string) => submit("network", { rpcUrl });
const addList = (listName: string, answer = true) => {
  dialogAnswer = answer;
  return submit("add", { listName });
};
const follow = async (name: string, on: boolean) => {
  await input(homeId, { type: "InputChangeEvent", name: `follow:${name}`, value: on });
  return uiOf(homeId);
};

/** The transaction panel: severity plus the rendered interface. */
async function send(to: Address, data = "0x", chainId = "eip155:11155111") {
  const r = await h.onTransaction!({ transaction: { to, data, from: CLEAN }, chainId });
  assertJSXElement(interfaces.get(r.id)!.ui);
  return { id: r.id as string, severity: r.severity as string | undefined, ui: uiOf(r.id) };
}
const sign = (spender: Address) =>
  h.onSignature!({
    signature: {
      from: CLEAN,
      signatureMethod: "eth_signTypedData_v4",
      data: { primaryType: "Permit", domain: { chainId: 11155111 }, message: { owner: CLEAN, spender, value: "1" } },
    },
  });
const has = (s: string, parts: string[]) => {
  for (const p of parts) assert.ok(s.includes(p), `missing "${p}"`);
};

test("exports exactly the handlers the manifest permits", () => {
  assert.deepEqual(Object.keys(h).sort(), ["onCronjob", "onHomePage", "onInstall", "onSettingsPage", "onSignature", "onTransaction", "onUserInput"]);
});

test("install with no list: the alert says the first sync failed, and the panel is unverifiable, never clean", async () => {
  world.list = await signedList(generatePrivateKey(), 1n);
  await h.onInstall!({ origin: "metamask", originMetadata: null }); // the default build has no list name
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0]!.type, "alert");
  has(text(dialogs[0]), ["Tocsin is on", "First sync failed: follow at least one list"]);
  const r = await send(DRAINER);
  assert.equal(r.severity, undefined);
  has(r.ui, ["Unverifiable", "Tocsin has not synced yet", "Retry sync", "best effort, not a light client"]);
  assert.doesNotMatch(r.ui, /No flags/);
});

test("adding a list asks first with its maintainer and writer count; a no pins nothing", async () => {
  await home();
  await setRpc("https://rpc.test/");
  const ui = await addList("tocsin.eth", false);
  assert.equal(dialogs.length, 2);
  has(text(dialogs[1]), ["Pin tocsin.eth?", world.list.maintainer, '"children":"2"']);
  assert.match(ui, /No lists yet/);
});

test("beat 1: a yes pins and syncs; the drainer receiver is blocked with writer, category and evidence", async () => {
  const ui = await addList("tocsin.eth");
  has(ui, ["tocsin.eth", `maintainer ${world.list.maintainer.slice(0, 6)}`, "2 writers", "3 across 2 writers", "Follow this list"]);
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  has(r.ui, [
    "Blocked",
    "Reject this transaction.",
    "Drainer receiver",
    "DRAINER_RECEIVER",
    "manual.tocsin.eth",
    `https://sepolia.etherscan.io/tx/${EVIDENCE}`,
    "block 100",
    "header and proof from rpc.test · best effort, not a light client",
    "Checked on this device. Nothing was sent to anyone.",
  ]);
  for (const banned of ["safe", "clean", "verified", "anonymised"]) assert.doesNotMatch(r.ui, new RegExp(`\\b${banned}\\b`, "i"));
});

test("the detector shows as a shortened address without a verified name", async () => {
  assert.match((await send(SUSPECT)).ui, /0x0000…e7ec/);
});

test("an address no list flags shows No flags with what was checked", async () => {
  const r = await send(CLEAN);
  assert.equal(r.severity, undefined);
  has(r.ui, ["No flags", "Not on any list you follow", "Checked against 1 list, 3 flags", "recipient 0xc1ea…0001", "tocsin.eth"]);
});

test("one weight-1 writer is a warning, and the banner says why it is not a block", async () => {
  const r = await send(SUSPECT);
  assert.equal(r.severity, undefined);
  has(r.ui, ["Warning", "Check this address before you continue.", "Flagged by 1 writer on tocsin.eth", "Your policy blocks only on a weight-255 writer or two independent writers."]);
});

test("on another chain a Sepolia-only flag does not count, and the panel names the chain", async () => {
  const r = await send(DRAINER, "0x", "eip155:1");
  assert.equal(r.severity, undefined);
  assert.match(r.ui, /on chain 1, not Sepolia/);
  assert.doesNotMatch((await send(CLEAN)).ui, /not Sepolia/);
});

test("signatures: a flagged spender is critical with 'Reject this signature', a warn too; unflagged and non-permit get nothing", async () => {
  const r = await sign(SPENDER);
  assertJSXElement(r.content);
  assert.equal(r.severity, "critical");
  has(text(r.content), ["Reject this signature.", "DRAINER_SPENDER", "EIP-2612 permit spender"]);
  const w = await sign(SUSPECT);
  assert.equal(w.severity, "critical");
  assert.match(text(w.content), /Warning/);
  assert.equal(await sign(CLEAN), null);
  assert.equal(await h.onSignature!({ signature: { from: CLEAN, signatureMethod: "personal_sign", data: "0x00" } }), null);
});

test("an approve to a flagged spender is blocked in the transaction", async () => {
  const r = await send(CLEAN, `0x095ea7b3${pad(SPENDER).slice(2)}${"f".repeat(64)}`);
  assert.equal(r.severity, "critical");
  assert.match(r.ui, /ERC-20 approve spender/);
});

test("policy: one writer blocks at threshold 1, a warn-only category warns, approvals can be skipped", async () => {
  const change = async (name: string, value: unknown) => {
    await input(homeId, { type: "InputChangeEvent", name, value });
    return uiOf(homeId);
  };
  has(await home(), ["Block when flagged by", "2 independent writers", "POISONING_FUNDER · warn only", "THEFT_PROCEEDS · warn only", "Check approvals, permits and 7702 delegates"]);
  await change("threshold", "1");
  assert.equal((await send(SUSPECT)).severity, "critical");
  await change("threshold", "2");
  assert.equal((await send(SUSPECT)).severity, undefined);

  await change("warnOnly:3", true);
  has((await send(DRAINER)).ui, ["Warning", "Your policy makes DRAINER_RECEIVER warn only."]);
  await change("warnOnly:3", false);
  assert.equal((await send(DRAINER)).severity, "critical");

  const approve = `0x095ea7b3${pad(SPENDER).slice(2)}${"f".repeat(64)}`;
  await change("checkApprovals", false);
  assert.equal((await send(CLEAN, approve)).severity, undefined);
  await change("checkApprovals", true);
  assert.equal((await send(CLEAN, approve)).severity, "critical");
});

let drainerPanel = "";
test("beat 2: with the lying RPC the panel is unverifiable at the dropped sequence, never green or red", async () => {
  await home();
  const ui = await setRpc("https://liar.test/");
  assert.ok(world.requests.includes("liar.test"));
  assert.match(ui, /chain mismatch at sequence 1/);
  for (const subject of [DRAINER, CLEAN]) {
    const r = await send(subject);
    assert.equal(r.severity, undefined);
    has(r.ui, ["Unverifiable", "The RPC's data does not match Ethereum", "manual.tocsin.eth · chain mismatch at sequence 1", "last good", "liar.test", "Retry sync"]);
    assert.doesNotMatch(r.ui, /No flags|Blocked/);
    if (subject === DRAINER) drainerPanel = r.id;
  }
});

test("beat 3: switch back, Retry sync on the open panel, Blocked again", async () => {
  await home();
  await setRpc("https://rpc.test/");
  await input(drainerPanel, { type: "ButtonClickEvent", name: "retry" });
  has(uiOf(drainerPanel), ["Blocked", "manual.tocsin.eth"]);
  assert.doesNotMatch(uiOf(drainerPanel), /Unverifiable/);
});

test("a changed maintainer: no dialog from the cron, the list is excluded, and Review asks", async () => {
  const before = world.list.maintainer;
  const asked = dialogs.length;
  world.list = await signedList(generatePrivateKey(), 2n);
  await h.onCronjob!({ request: { method: "sync" } });
  assert.equal(dialogs.length, asked, "the cron never opens a dialog");
  const ui = await home();
  has(ui, ["Maintainer changed", `Was ${before.slice(0, 6)}`, `now ${world.list.maintainer.slice(0, 6)}`, "Excluded until you review", "review:tocsin.eth"]);
  const r = await send(DRAINER);
  assert.equal(r.severity, undefined);
  has(r.ui, ["Unverifiable", "No list to check against", "Not checked: tocsin.eth (its maintainer changed"]);

  dialogAnswer = false;
  await click("review:tocsin.eth");
  assert.equal(dialogs.length, asked + 1);
  has(text(dialogs.at(-1)), ["List maintainer changed", before, world.list.maintainer]);
  assert.equal((await send(DRAINER)).severity, undefined, "a no keeps it excluded");

  dialogAnswer = true;
  const after = await click("review:tocsin.eth");
  assert.doesNotMatch(after, /Maintainer changed/);
  assert.match(after, new RegExp(`maintainer ${world.list.maintainer.slice(0, 6)}`));
  assert.equal((await send(DRAINER)).severity, "critical");
});

test("bigints survive the JSON-only state store, and no checked address is stored", () => {
  assert.match(JSON.stringify(stored), /"\$n":"512"/);
  assert.doesNotMatch(JSON.stringify(stored).toLowerCase(), new RegExp(CLEAN.slice(2).toLowerCase()));
});

test("an RPC on another chain fails the sync; the panel keeps the last result and says so", async () => {
  chainId = "0x1";
  await h.onCronjob!({ request: { method: "sync" } });
  chainId = "0xaa36a7";
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  has(r.ui, ["is not Sepolia (chain 0x1)", "uses the sync before it"]);
});

test("bad input shows a field error and changes nothing", async () => {
  await home();
  const before = JSON.stringify(stored);
  assert.match(await setRpc("http://rpc.test/"), /Enter an https URL/);
  assert.match(await addList("nodot"), /is not an ENS name/);
  assert.match(await addList("tocsin.eth"), /already in your lists/);
  assert.match(await addList("missing.eth"), /No Tocsin list found at missing\.eth/);
  assert.equal(JSON.stringify(stored), before);
});

test("typing in a text field does not redraw the page", async () => {
  await home();
  const before = uiOf(homeId);
  interfaces.set(homeId, { ...interfaces.get(homeId)!, ui: "sentinel" });
  await input(homeId, { type: "InputChangeEvent", name: "listName", value: "tocs" });
  assert.equal(interfaces.get(homeId)!.ui, "sentinel");
  interfaces.set(homeId, { ...interfaces.get(homeId)!, ui: JSON.parse(before) });
});

test("walkaway: with the team's name, list host and mirror gone, the pinned list plus the log still block", async () => {
  teamGone = true;
  await home();
  // A different RPC URL drops checkpoints, so this replays every leaf from the log itself.
  const ui = await setRpc("https://rpc.test/replay");
  has(ui, ["Could not fetch the latest list. Using the pinned copy.", world.list.maintainer.slice(0, 6), "3 across 2 writers"]);
  const r = await send(DRAINER);
  assert.equal(r.severity, "critical");
  assert.doesNotMatch(r.ui, /uses the sync before it/);
  assert.match(r.ui, /0x0000…11cE/, "without the team's reverse record the writer shows as a short address");
  teamGone = false;
});

test("two lists: a block from either blocks; unfollowing drops one out and following again keeps its pin", async () => {
  world.others["other.eth"] = await signedList(generatePrivateKey(), 1n, [entry(DETECTOR, 1)], "https://lists.test/other.json");
  await home();
  const ui = await addList("other.eth");
  has(ui, ["other.eth", world.others["other.eth"]!.maintainer.slice(0, 6)]);
  assert.equal((await send(DRAINER)).severity, "critical");

  const asked = dialogs.length;
  await follow("tocsin.eth", false);
  const r = await send(DRAINER);
  assert.equal(r.severity, undefined);
  has(r.ui, ["No flags", "Checked against 1 list"]);
  await follow("tocsin.eth", true);
  assert.equal((await send(DRAINER)).severity, "critical");
  assert.equal(dialogs.length, asked, "the kept pin is the same maintainer");
});

test("Remove drops the list from the page and from evaluation", async () => {
  await home();
  const ui = await click("remove:other.eth");
  assert.doesNotMatch(ui, /other\.eth/);
  has((await send(CLEAN)).ui, ["Checked against 1 list"]);
});

test("install after a good sync says what is now checked", async () => {
  await h.onInstall!({ origin: "metamask", originMetadata: null });
  has(text(dialogs.at(-1)), ["Tocsin is on", "Every transaction and permit is now checked against 1 list, 3 flags, on this device."]);
});

test("the settings page is the home page", async () => {
  const { id } = await h.onSettingsPage!(undefined);
  has(uiOf(id), ["STATUS", "LISTS", "POLICY", "NETWORK", "ABOUT", "Read the standard"]);
});
