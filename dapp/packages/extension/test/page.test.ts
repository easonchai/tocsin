// node --test: the proxy's pass-through vs intercept decision, against a recording fake wallet.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type Ask, type PageWindow, type Provider, install, shouldIntercept, wrapProvider } from "../src/page.ts";

/** A wallet that records every request it receives and answers with the method name. */
class RecordingWallet implements Provider {
  seen: string[] = [];
  isMetaMask = true;
  #listeners: string[] = []; // private field: a method reached through a Proxy receiver would throw on it
  async request({ method }: { method: string; params?: unknown }): Promise<unknown> {
    this.seen.push(method);
    return method === "eth_chainId" ? "0xaa36a7" : `result of ${method}`;
  }
  on(event: string): this {
    this.#listeners.push(event);
    return this;
  }
  listenerCount(): number {
    return this.#listeners.length;
  }
}

/** An ask that records what it was asked and answers a fixed yes or no. */
const recordingAsk = (answer: boolean) => {
  const asked: { method: string; params: unknown; chainId: unknown }[] = [];
  const ask: Ask = async (method, params, chainId) => {
    asked.push({ method, params, chainId });
    return answer;
  };
  return { ask, asked };
};

test("only the three signing methods are intercepted", () => {
  for (const m of ["eth_sendTransaction", "eth_signTypedData_v4", "wallet_sendCalls"]) assert.equal(shouldIntercept(m), true, m);
  for (const m of ["eth_requestAccounts", "eth_chainId", "personal_sign", "eth_signTypedData_v3", "eth_sendRawTransaction", "eth_call", "wallet_switchEthereumChain", "", 42, undefined])
    assert.equal(shouldIntercept(m), false, String(m));
});

test("a pass-through goes straight to the wallet and never asks", async () => {
  const wallet = new RecordingWallet();
  const { ask, asked } = recordingAsk(false);
  const p = wrapProvider(wallet, ask);
  assert.equal(await p.request({ method: "eth_requestAccounts" }), "result of eth_requestAccounts");
  assert.equal(await p.request({ method: "personal_sign", params: ["0x00", "0x01"] }), "result of personal_sign");
  assert.deepEqual(asked, []);
  assert.deepEqual(wallet.seen, ["eth_requestAccounts", "personal_sign"]);
});

test("a held request reaches the wallet only after a yes, with the wallet's chain id", async () => {
  const wallet = new RecordingWallet();
  const { ask, asked } = recordingAsk(true);
  const tx = { to: "0xbad0000000000000000000000000000000000bad", value: "0x1" };
  assert.equal(await wrapProvider(wallet, ask).request({ method: "eth_sendTransaction", params: [tx] }), "result of eth_sendTransaction");
  assert.deepEqual(asked, [{ method: "eth_sendTransaction", params: [tx], chainId: "0xaa36a7" }]);
  assert.deepEqual(wallet.seen, ["eth_chainId", "eth_sendTransaction"]);
});

test("a no stops the request with EIP-1193 code 4001 and the wallet never sees it", async () => {
  for (const method of ["eth_sendTransaction", "eth_signTypedData_v4", "wallet_sendCalls"]) {
    const wallet = new RecordingWallet();
    const { ask } = recordingAsk(false);
    await assert.rejects(wrapProvider(wallet, ask).request({ method, params: [] }), (e: { code?: number }) => e.code === 4001);
    assert.deepEqual(wallet.seen, ["eth_chainId"], method);
  }
});

test("other properties and methods pass through, bound to the real wallet", () => {
  const wallet = new RecordingWallet();
  const p = wrapProvider(wallet, recordingAsk(true).ask);
  assert.equal(p.isMetaMask, true);
  p.on("accountsChanged");
  assert.equal(wallet.listenerCount(), 1);
  assert.equal(p.on, p.on, "stable identity");
  assert.equal(wrapProvider(wallet, recordingAsk(true).ask), p, "one proxy per wallet");
  assert.equal(wrapProvider(p, recordingAsk(true).ask), p, "a proxy is not wrapped twice");
});

const fakeWindow = (): PageWindow => new EventTarget() as PageWindow;

test("window.ethereum is wrapped whether the wallet injected before or after the proxy", async () => {
  const before = fakeWindow();
  const early = new RecordingWallet();
  before.ethereum = early;
  const a = recordingAsk(false);
  install(before, a.ask);
  await assert.rejects(before.ethereum!.request({ method: "eth_sendTransaction", params: [{}] }));
  assert.equal(a.asked.length, 1);

  const after = fakeWindow();
  const b = recordingAsk(false);
  install(after, b.ask);
  assert.equal(after.ethereum, undefined);
  const late = new RecordingWallet();
  after.ethereum = late; // what MetaMask's inpage script does
  await assert.rejects(after.ethereum!.request({ method: "wallet_sendCalls", params: [{}] }));
  assert.equal(b.asked.length, 1);
  assert.deepEqual(late.seen, ["eth_chainId"]);
});

test("a wallet that locks window.ethereum, before or after the proxy, is still held, and asks once via EIP-6963 too", async () => {
  const lock = (win: PageWindow, wallet: Provider) => Object.defineProperty(win, "ethereum", { value: wallet, configurable: false, writable: false });

  const before = fakeWindow();
  const early = new RecordingWallet();
  lock(before, early);
  const a = recordingAsk(false);
  install(before, a.ask);
  await assert.rejects(before.ethereum!.request({ method: "eth_sendTransaction", params: [{}] }));
  assert.equal(a.asked.length, 1);
  assert.deepEqual(early.seen, ["eth_chainId"]);

  const after = fakeWindow();
  const b = recordingAsk(false);
  install(after, b.ask);
  const late = new RecordingWallet();
  lock(after, late); // replaces the proxy's configurable accessor
  after.dispatchEvent(new Event("ethereum#initialized"));
  await assert.rejects(after.ethereum!.request({ method: "eth_sendTransaction", params: [{}] }));
  assert.equal(b.asked.length, 1);

  let announced: Provider | undefined;
  after.addEventListener("eip6963:announceProvider", (e) => (announced = (e as CustomEvent<{ provider: Provider }>).detail.provider));
  after.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: {}, provider: late }) }));
  await assert.rejects(announced!.request({ method: "eth_signTypedData_v4", params: ["0x0", "{}"] }));
  assert.equal(b.asked.length, 2, "one ask per request, not one per wrapper layer");
  assert.deepEqual(late.seen, ["eth_chainId", "eth_chainId"]);
});

test("EIP-6963: the dapp only ever receives the wrapped provider, once per announcement", async () => {
  const win = fakeWindow();
  const { ask, asked } = recordingAsk(false);
  install(win, ask);
  const received: Provider[] = [];
  win.addEventListener("eip6963:announceProvider", (e) => received.push((e as CustomEvent<{ provider: Provider }>).detail.provider));

  const wallet = new RecordingWallet();
  const info = { uuid: "1", name: "Fake", icon: "data:,", rdns: "test.fake" };
  win.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider: wallet }) }));

  assert.equal(received.length, 1);
  assert.notEqual(received[0], wallet);
  await assert.rejects(received[0]!.request({ method: "eth_signTypedData_v4", params: ["0x0", "{}"] }));
  assert.equal(asked.length, 1);
  assert.deepEqual(wallet.seen, ["eth_chainId"]);
});
