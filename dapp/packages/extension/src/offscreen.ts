// The offscreen document: Helios plus Anon-RPC and the reader. It lives here, not in the service
// worker, because the Anon-RPC harness needs a DOM (a sandboxed iframe that spawns a Worker), and
// service workers have neither `document` nor the Worker constructor. Offscreen documents only get
// chrome.runtime, so the pin and checkpoints are persisted through the service worker.
import type { RpcRequest } from "../../reader/src/index.ts";
import { type Transport, bootstrapAnonRpc, installFetchShim, startHelios } from "../../nextjs/utils/harness/anonHelios.ts";
import { type EngineConfig, type EngineState, type Persisted, buildReport, fromJson, rpcRequest, runSync, toJson } from "./engine.ts";
import { unavailableReport } from "./report.ts";
import { requestTargets } from "./targets.ts";

const SYNC_EVERY_MS = 5 * 60_000;
const cfg = __TOCSIN_CONFIG__;
const transport = cfg.transport === "nym" || cfg.transport === "direct" ? cfg.transport : "tor";

const engineCfg: EngineConfig = {
  listName: cfg.listName,
  // SAFETY: build.mjs passes TOCSIN_LIST_RECORD through only when it is 0x-hex or empty.
  listRecord: cfg.listRecord as EngineConfig["listRecord"],
  fromBlock: BigInt(cfg.fromBlock || "0"),
  transportLabel: transport === "direct" ? "direct to the RPC, not anonymised" : `through the ${transport} Anon-RPC worker`,
};

let state: EngineState = { persisted: { checkpoints: {} }, names: {} };
let stage = "starting";

const errorText = (e: unknown): string =>
  e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : String(e);

// Helios refuses "latest" when the consensus server's attested header is over a minute old (see
// the harness); the finalized block is still light-client verified, so fall back to it.
const heliosRequest =
  (h: { request(a: { method: string; params: unknown[] }): Promise<unknown> }): RpcRequest =>
  async ({ method, params = [] }) => {
    try {
      return await h.request({ method, params: [...params] });
    } catch (e) {
      if (!String(e).includes("out of sync") || !params.includes("latest")) throw e;
      return h.request({ method, params: params.map((p) => (p === "latest" ? "finalized" : p)) });
    }
  };

async function boot(): Promise<void> {
  const needed: (keyof typeof cfg)[] = ["sepoliaConsensus", "sepoliaExecution", ...(transport === "direct" ? [] : (["mainnetConsensus", "mainnetExecution"] as const))];
  const missing = needed.filter((k) => !cfg[k]);
  if (missing.length) throw new Error(`the extension was built without ${missing.join(", ")}`);
  state = { ...state, persisted: fromJson<Persisted | null>(await chrome.runtime.sendMessage({ kind: "load" })) ?? state.persisted };

  if (transport !== "direct") {
    stage = "syncing the mainnet light client that verifies the Anon-RPC worker";
    const mainnet = await startHelios("mainnet", { consensusRpc: cfg.mainnetConsensus, executionRpc: cfg.mainnetExecution });
    stage = `booting the ${transport} Anon-RPC worker`;
    const { worker } = await bootstrapAnonRpc({ transport: transport satisfies Transport, mainnetHelios: mainnet, torGateways: cfg.torGateways }).finally(
      () => void mainnet.shutdown(),
    );
    // Sepolia Helios's execution calls and the leaf scans both go to this URL, so both use the worker.
    installFetchShim(cfg.sepoliaExecution, worker.fetch);
  }
  stage = "syncing the Sepolia light client";
  const sepolia = await startHelios("sepolia", { consensusRpc: cfg.sepoliaConsensus, executionRpc: cfg.sepoliaExecution });
  const transports = { helios: heliosRequest(sepolia), leaves: rpcRequest(cfg.sepoliaExecution) };

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    stage = "syncing the pinned writers";
    try {
      state = await runSync(state, engineCfg, transports);
      await chrome.runtime.sendMessage({ kind: "save", persisted: toJson(state.persisted) });
    } finally {
      running = false;
    }
  };
  await tick();
  setInterval(() => void tick().catch((e: unknown) => (state = { ...state, error: errorText(e) })), SYNC_EVERY_MS);
}

boot().catch((e: unknown) => {
  state = { ...state, error: `startup failed: ${errorText(e)}` };
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const m = msg as { target?: unknown; kind?: unknown; method?: unknown; params?: unknown; chainId?: unknown } | null;
  if (m?.target !== "offscreen" || m.kind !== "evaluate" || typeof m.method !== "string") return undefined;
  if (!state.sync) {
    reply(unavailableReport(state.error ?? `Tocsin is still starting (${stage}), so it has nothing to check against yet.`));
    return undefined;
  }
  try {
    const { targets, chainId } = requestTargets(m.method, m.params, m.chainId);
    reply(buildReport(state, targets, chainId, engineCfg));
  } catch (e) {
    reply(unavailableReport(`the check failed: ${errorText(e)}`));
  }
  return undefined;
});
