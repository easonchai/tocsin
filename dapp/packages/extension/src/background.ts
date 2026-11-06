// Service worker: owns the offscreen document (where the reader, Helios and Anon-RPC run), relays
// each held request to it, and keeps the pin and checkpoints in chrome.storage. The held request
// is only forwarded in memory; nothing here stores or logs it.
import { unavailableReport } from "./report.ts";

const OFFSCREEN = "offscreen.html";
const EVALUATE_TIMEOUT_MS = 10_000;

let creating: Promise<void> | undefined;
async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN,
      reasons: ["WORKERS", "IFRAME_SCRIPTING", "WEB_RTC"],
      justification: "Runs the Helios light client and the Anon-RPC worker that verify threat flags before a wallet signs.",
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const m = msg as { target?: unknown; kind?: unknown; persisted?: unknown } | null;
  if (!m || m.target === "offscreen" || sender.id !== chrome.runtime.id) return undefined;
  const fromOffscreen = sender.url === chrome.runtime.getURL(OFFSCREEN);

  if (m.kind === "evaluate" && sender.tab) {
    Promise.race([ensureOffscreen().then(() => chrome.runtime.sendMessage({ ...m, target: "offscreen" })), timeout(EVALUATE_TIMEOUT_MS)]).then(
      (report) => reply(report ?? unavailableReport("the Tocsin engine did not answer")),
      (e: unknown) => reply(unavailableReport(`the Tocsin engine did not answer (${e instanceof Error ? e.message : String(e)})`)),
    );
    return true;
  }
  if (m.kind === "load" && fromOffscreen) {
    chrome.storage.local.get("persisted").then((r) => reply(r.persisted ?? null), () => reply(null));
    return true;
  }
  if (m.kind === "save" && fromOffscreen) {
    chrome.storage.local.set({ persisted: m.persisted }).then(() => reply(true), () => reply(false));
    return true;
  }
  return undefined;
});

// Start syncing as soon as the browser or the extension starts, not on the first send.
chrome.runtime.onStartup.addListener(() => void ensureOffscreen());
chrome.runtime.onInstalled.addListener(() => void ensureOffscreen());
