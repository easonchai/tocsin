// node --test: the built dist/page.js, run in a fresh VM context with a fake wallet on
// window.ethereum and a fake bridge on the message channel. Run `node build.mjs` first.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const PAGE = readFileSync(new URL("../dist/page.js", import.meta.url), "utf8");
const ORIGIN = "https://dapp.example";

type Msg = { tocsin?: string; id?: string; method?: string; proceed?: boolean };

/** A page with a recording wallet, the built proxy, and a bridge that answers every ask with `answer`. */
function page(answer: boolean, crypto: Pick<Crypto, "getRandomValues"> = globalThis.crypto) {
  const win = new EventTarget() as EventTarget & { ethereum?: { request(a: { method: string; params?: unknown }): Promise<unknown> }; postMessage(d: unknown, o: string): void };
  const posted: { data: Msg; origin: string }[] = [];
  win.postMessage = (data, origin) => {
    posted.push({ data: data as Msg, origin });
    // Async, like the real window.postMessage, and with the page as the source.
    setTimeout(() => win.dispatchEvent(Object.assign(new Event("message"), { data: structuredClone(data), source: win })), 0);
  };
  const seen: string[] = [];
  win.ethereum = {
    async request({ method }) {
      seen.push(method);
      return method === "eth_chainId" ? "0xaa36a7" : "0xhash";
    },
  };
  // The fake bridge: what bridge.js does, minus the overlay.
  win.addEventListener("message", (e) => {
    const d = (e as unknown as { data: Msg }).data;
    if (d.tocsin === "ask") win.postMessage({ tocsin: "verdict", id: d.id, proceed: answer }, ORIGIN);
  });
  vm.runInNewContext(PAGE, { window: win, location: { origin: ORIGIN }, crypto, CustomEvent, Event, setTimeout });
  return { win, posted, seen };
}

test("built proxy: pass-through methods never cross to the bridge", async () => {
  const { win, posted, seen } = page(false);
  assert.equal(await win.ethereum!.request({ method: "eth_accounts" }), "0xhash");
  assert.deepEqual(posted, []);
  assert.deepEqual(seen, ["eth_accounts"]);
});

test("built proxy: a send is held, asked over postMessage to the page origin, and released on a yes", async () => {
  const { win, posted, seen } = page(true);
  const tx = { to: "0xbad0000000000000000000000000000000000bad" };
  assert.equal(await win.ethereum!.request({ method: "eth_sendTransaction", params: [tx] }), "0xhash");
  const ask = posted.find((p) => p.data.tocsin === "ask");
  assert.equal(ask?.origin, ORIGIN);
  assert.equal(ask?.data.method, "eth_sendTransaction");
  assert.deepEqual(seen, ["eth_chainId", "eth_sendTransaction"]);
});

test("built proxy: a no rejects with 4001 before the wallet sees the send", async () => {
  const { win, seen } = page(false);
  await assert.rejects(win.ethereum!.request({ method: "eth_sendTransaction", params: [{}] }), (e: { code?: number }) => e.code === 4001);
  assert.deepEqual(seen, ["eth_chainId"]);
});

test("built proxy: a verdict for another id does not release the request", async () => {
  const { win, seen } = page(true);
  // Swap the bridge's answer for one with the wrong id: the request must stay held.
  const real = win.postMessage;
  win.postMessage = (d, o) => real((d as Msg).tocsin === "verdict" ? { ...(d as Msg), id: "forged" } : d, o);
  const held = win.ethereum!.request({ method: "wallet_sendCalls", params: [{}] });
  const outcome = await Promise.race([held.then(() => "released"), new Promise((r) => setTimeout(() => r("held"), 50))]);
  assert.equal(outcome, "held");
  assert.deepEqual(seen, ["eth_chainId"]);
});

test("built proxy: on a plain-http page (no crypto.randomUUID) a send is still asked and released", async () => {
  const { win, seen } = page(true, { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) });
  assert.equal(await win.ethereum!.request({ method: "eth_sendTransaction", params: [{ to: "0xbad0000000000000000000000000000000000bad" }] }), "0xhash");
  assert.deepEqual(seen, ["eth_chainId", "eth_sendTransaction"]);
});
