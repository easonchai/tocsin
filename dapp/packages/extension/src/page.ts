// The provider proxy. Runs in the page's own world at document_start (manifest "world": "MAIN"), so
// it wraps `window.ethereum` and every EIP-6963 announcement before a page script reads either.
// Everything passes through untouched except the three methods below, which wait for `ask`.

export const INTERCEPTED: ReadonlySet<string> = new Set(["eth_sendTransaction", "eth_signTypedData_v4", "wallet_sendCalls"]);

export const shouldIntercept = (method: unknown): method is string => typeof method === "string" && INTERCEPTED.has(method);

type RequestArgs = { method: string; params?: unknown };
export type Provider = { request(args: RequestArgs): Promise<unknown> };

/** Resolves true to hand the request to the wallet, false to stop it. Never sees anything but the held request. */
export type Ask = (method: string, params: unknown, chainId: unknown) => Promise<boolean>;

/** EIP-1193 4001, so dapps treat a stop like the user rejecting in the wallet. */
const stopped = (): Error => Object.assign(new Error("Tocsin stopped this request"), { code: 4001 });

const proxies = new WeakMap<object, object>();
const isProxy = new WeakSet<object>();

export function wrapProvider<P extends Provider>(provider: P, ask: Ask): P {
  if (isProxy.has(provider)) return provider;
  const known = proxies.get(provider);
  // SAFETY: proxies only maps a provider to the Proxy built over it below, which has the provider's type.
  if (known) return known as P;

  const request = (args: RequestArgs): Promise<unknown> => {
    // Not async: a pass-through returns the wallet's own promise, unchanged.
    if (!shouldIntercept(args?.method)) return provider.request(args);
    return (async () => {
      const chainId = await provider.request({ method: "eth_chainId" }).catch(() => undefined);
      if (!(await ask(args.method, args.params, chainId))) throw stopped();
      return provider.request(args);
    })();
  };

  // Bound to the real provider: wallets keep private fields that a Proxy receiver cannot reach.
  const bound = new Map<PropertyKey, unknown>();
  const proxy = new Proxy(provider, {
    get(target, prop) {
      if (prop === "request") return request;
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (!bound.has(prop)) bound.set(prop, value.bind(target));
      return bound.get(prop);
    },
  });
  proxies.set(provider, proxy);
  isProxy.add(proxy);
  return proxy;
}

type AnnounceDetail = { info: unknown; provider: Provider };
const isAnnounce = (d: unknown): d is AnnounceDetail =>
  typeof d === "object" && d !== null && typeof (d as { provider?: { request?: unknown } }).provider?.request === "function";

/** The bits of `window` the proxy touches, so a test can hand it an EventTarget. */
export type PageWindow = EventTarget & { ethereum?: Provider };

export function install(win: PageWindow, ask: Ask): void {
  // EIP-6963: swallow each wallet announcement and re-announce it wrapped. Capture on window,
  // registered before any page script, so dapp listeners only ever see the wrapped provider.
  win.addEventListener(
    "eip6963:announceProvider",
    (event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isAnnounce(detail) || isProxy.has(detail.provider)) return;
      event.stopImmediatePropagation();
      win.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ ...detail, provider: wrapProvider(detail.provider, ask) }) }),
      );
    },
    true,
  );

  // window.ethereum: an accessor, so a wallet that assigns it after us is wrapped too.
  const desc = Object.getOwnPropertyDescriptor(win, "ethereum");
  let raw = win.ethereum;
  if (!desc || desc.configurable) {
    Object.defineProperty(win, "ethereum", {
      configurable: true, // never block a wallet that redefines it; EIP-6963 still covers that wallet
      enumerable: true,
      get: () => (raw && typeof raw.request === "function" ? wrapProvider(raw, ask) : raw),
      set: (value: Provider | undefined) => {
        raw = value;
      },
    });
  } else if (desc.writable && raw) {
    win.ethereum = wrapProvider(raw, ask);
  }
  // shortcut: legacy `send` and `sendAsync` pass through unwrapped; wrap them if a target dapp still uses them.
}
