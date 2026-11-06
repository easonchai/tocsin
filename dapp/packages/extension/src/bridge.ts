// Isolated-world content script: takes each held request from the page-world proxy, asks the
// service worker for a report, shows the overlay, and answers the proxy. Requests are handled
// one at a time so two overlays never stack.
import { showOverlay } from "./overlay.ts";
import { type Report, unavailableReport } from "./report.ts";

type Ask = { tocsin: "ask"; id: string; method: string; params: unknown; chainId: unknown };
const isAsk = (d: unknown): d is Ask =>
  typeof d === "object" && d !== null && (d as Ask).tocsin === "ask" && typeof (d as Ask).id === "string" && typeof (d as Ask).method === "string";

async function report(a: Ask): Promise<Report> {
  try {
    const r = await chrome.runtime.sendMessage<Report | undefined>({ kind: "evaluate", method: a.method, params: a.params, chainId: a.chainId });
    return r ?? unavailableReport("the Tocsin background worker did not answer");
  } catch {
    return unavailableReport("the Tocsin background worker is not running (reload the page after reloading the extension)");
  }
}

let queue: Promise<void> = Promise.resolve();

window.addEventListener("message", (e) => {
  if (e.source !== window || !isAsk(e.data)) return;
  const a = e.data;
  queue = queue.then(async () => {
    // An overlay that cannot render stops the request rather than letting a flagged one through unseen.
    const proceed = await report(a).then(showOverlay).catch(() => false);
    window.postMessage({ tocsin: "verdict", id: a.id, proceed }, location.origin);
  });
});
