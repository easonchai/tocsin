// Page-world entry: the proxy's `ask` crosses to the isolated-world bridge by window.postMessage and
// waits for its yes or no. The request stays in memory on both sides; nothing writes it anywhere.
import { type Ask, install } from "./page.ts";

const ask: Ask = (method, params, chainId) =>
  new Promise((resolve) => {
    // Not randomUUID: it exists only in secure contexts, and the proxy also runs on plain-http pages.
    const id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join("-");
    const onReply = (e: MessageEvent) => {
      if (e.source !== window || e.data?.tocsin !== "verdict" || e.data.id !== id) return;
      window.removeEventListener("message", onReply);
      resolve(e.data.proceed === true);
    };
    window.addEventListener("message", onReply);
    window.postMessage({ tocsin: "ask", id, method, params, chainId }, location.origin);
  });

// SAFETY: window is an EventTarget; `ethereum` is read and replaced only through install's accessor.
install(window as unknown as Parameters<typeof install>[0], ask);
