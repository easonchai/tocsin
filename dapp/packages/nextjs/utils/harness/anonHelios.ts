// Helios plus Anon-RPC bootstrap and fetch shim (demo ticket 01). Kept free of React so the
// Kohaku module or the provider-proxy extension's background worker can import it as is.
import type { HeliosProvider } from "@a16z/helios";
import type { AnonRpcWorker } from "@anon-rpc/browser-harness";
import { type Address, type Hex, encodeAbiParameters, keccak256, toFunctionSelector } from "viem";

/** Sepolia CREATE2 prediction from the ERC's Deployment section. */
export const LOG_ADDRESS: Address = "0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14";

// Specifier contracts live on Ethereum mainnet only (no code on Sepolia), so the worker
// bootstrap needs a mainnet light client even though the log is read on Sepolia.
// The passthrough reference worker is deliberately absent: it does not anonymise.
export const SPECIFIERS = {
  tor: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e",
  nym: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
} as const satisfies Record<string, Address>;
export type Transport = keyof typeof SPECIFIERS;

// Weak-subjectivity checkpoints: the finalized beacon block root (epoch boundary) from
// /eth/v1/beacon/headers/finalized on 2026-11-05 20:19 UTC (2026-11-06 IST), Sepolia from
// lodestar-sepolia.chainsafe.io and mainnet from ethereum-beacon-api.publicnode.com.
// The light_client/bootstrap for each root is pinned beside this file because public Sepolia
// servers only serve the bootstrap for the current finalized root (Lodestar answered 500 for a
// root 20 minutes old). Helios checks the bootstrap header against the root and the sync
// committee branch against the header, so a pinned file is as safe as a fetched one.
// shortcut: pinned by hand, refresh both before the weak-subjectivity window (about two weeks) runs out.
export const CHECKPOINTS = {
  sepolia: { root: "0xd2a1b88dc7a17d3315acf1fc2d9835c56798f4cbbc4a0b75d029f5f2ed4b92c4", slot: 11514624 },
  mainnet: { root: "0xcd84ad5767764959e20e9f4c9e1b6d253b7a771c53865fd0be36c9e74c8d9f0c", slot: 15590400 },
} as const;

export type HeliosNetwork = keyof typeof CHECKPOINTS;

const PINNED_BOOTSTRAPS = {
  sepolia: () => import("./bootstrap-sepolia.json"),
  mainnet: () => import("./bootstrap-mainnet.json"),
};

/**
 * Starts a Helios light client from the pinned checkpoint and waits for it to sync. The bootstrap
 * request for the pinned root is answered from the pinned file; a user-supplied `checkpoint`
 * goes to the consensus server instead.
 */
export async function startHelios(
  network: HeliosNetwork,
  {
    consensusRpc,
    executionRpc,
    checkpoint = CHECKPOINTS[network].root,
  }: {
    consensusRpc: string;
    executionRpc: string;
    checkpoint?: string;
  },
): Promise<HeliosProvider> {
  const { createHeliosProvider } = await import("@a16z/helios");
  let unpin = () => {};
  if (checkpoint === CHECKPOINTS[network].root) {
    const body = JSON.stringify((await PINNED_BOOTSTRAPS[network]()).default);
    const url = `${consensusRpc.replace(/\/+$/, "")}/eth/v1/beacon/light_client/bootstrap/${checkpoint}`;
    unpin = installFetchShim(url, async () => new Response(body, { headers: { "content-type": "application/json" } }));
  }
  // dbType "config": start from the pinned checkpoint, not one cached in localStorage.
  const helios = await createHeliosProvider(
    { network, consensusRpc, executionRpc, checkpoint, dbType: "config" },
    "ethereum",
  );
  await helios.waitSynced().finally(unpin);
  return helios;
}

// Helios 0.12 follows finality updates only, and refuses "latest" reads ("out of sync: N seconds
// behind") when the server's attested header is over a minute old. Lodestar's lags up to an
// epoch (measured 306s on Sepolia, 236s on mainnet), so reads that need not be current use "finalized".
const isOutOfSync = (e: unknown) => String(e).includes("out of sync");

/**
 * Boots the Anon-RPC worker for `transport`. The harness reads `workerHash()` from the specifier
 * through `mainnetHelios`, so the hash it checks the bundle against is light-client verified.
 * Resolves once the worker reports ready; the hash is returned for display.
 */
export async function bootstrapAnonRpc({
  transport,
  mainnetHelios,
  torGateways,
}: {
  transport: Transport;
  mainnetHelios: { request(args: { method: string; params: unknown[] }): Promise<unknown> };
  torGateways: string[];
}): Promise<{ worker: AnonRpcWorker; workerHash: Hex; specifier: Address }> {
  const specifier = SPECIFIERS[transport];
  if (!specifier) throw new Error(`unknown transport ${transport}`);
  if (transport === "tor" && torGateways.length === 0) throw new Error("tor needs at least one gateway");
  const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
  // The harness reads the specifier at "latest"; a finalized pin is the safer read and avoids isOutOfSync.
  const rpcProvider = {
    request: ({ method, params = [] }: { method: string; params?: unknown[] }) =>
      mainnetHelios.request({ method, params: params.map(p => (p === "latest" ? "finalized" : p)) }),
  };
  const worker = new AnonRpcWorker({
    address: specifier,
    config: transport === "tor" ? { gateways: torGateways } : undefined,
    preExisting: { rpcProvider },
  });
  // The same verified read the harness makes internally, repeated so the page can show the hash.
  const workerHash = (await rpcProvider.request({
    method: "eth_call",
    params: [{ to: specifier, data: toFunctionSelector("workerHash()") }, "latest"],
  })) as Hex;
  try {
    await worker.ready;
  } catch (e) {
    worker.close();
    throw new Error(`${transport} worker failed to boot`, { cause: e });
  }
  return { worker, workerHash: workerHash.slice(0, 66) as Hex, specifier };
}

/**
 * Replaces `globalThis.fetch` so requests to `targetUrl` (Helios's execution RPC) go through
 * `anonFetch`; everything else, including the consensus RPC, keeps the original fetch.
 * Returns a function that restores the original.
 */
export function installFetchShim(targetUrl: string, anonFetch: typeof fetch, onRouted?: (url: string) => void) {
  const original = globalThis.fetch;
  const target = new URL(targetUrl).href;
  const shim: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!new URL(url, location.href).href.startsWith(target)) return original(input, init);
    onRouted?.(url);
    // Helios passes a Request with a stream body; hand the worker a string body and object headers, as
    // anon-rpc's reference demo does. The Nym worker still drops content-type, so its RPC must accept that.
    const req = new Request(input, init);
    const sent = req.text().then(body =>
      anonFetch(req.url, {
        method: req.method,
        headers: Object.fromEntries(req.headers),
        body: body || undefined,
        signal: req.signal,
      }),
    );
    // Helios's wasm fetch parses response.url, which a constructed Response leaves empty.
    return sent.then(
      res => (res.url ? res : Object.defineProperty(res, "url", { value: url })),
      e => {
        // Helios reduces this to "error sending request", so the worker's reason is only visible here.
        console.warn("[anon-fetch] worker call failed", url, e);
        throw e;
      },
    );
  };
  globalThis.fetch = shim;
  return () => {
    if (globalThis.fetch === shim) globalThis.fetch = original;
  };
}

/** ERC Storage layout: writerHead(w) at keccak256(abi.encode(w, 2)), writerSeq(w) at keccak256(abi.encode(w, 3)). */
export function writerSlots(writer: Address): { head: Hex; seq: Hex } {
  const at = (slot: bigint) =>
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [writer, slot]));
  return { head: at(2n), seq: at(3n) };
}

export type ProvenRead = {
  block: { tag: "latest" | "finalized"; number: bigint; hash: Hex; stateRoot: Hex };
  slots: { label: string; key: Hex; value: Hex }[];
};

type Block = { number: Hex; hash: Hex; stateRoot: Hex };

/**
 * One eth_getProof through Helios (ERC Light-client read procedure, step 2) for every writer's
 * writerHead and writerSeq, pinned to the latest block Helios has verified, or the finalized one
 * when the latest is stale. With no writers it proves the mapping roots at slots 2 and 3
 * themselves, which Solidity always leaves zero.
 */
export async function proveWriterHeads(
  helios: HeliosProvider,
  writers: Address[],
  log: Address = LOG_ADDRESS,
): Promise<ProvenRead> {
  const getBlock = (tag: string) =>
    helios.request({ method: "eth_getBlockByNumber", params: [tag, false] }) as Promise<Block>;
  let tag: ProvenRead["block"]["tag"] = "latest";
  const block = await getBlock(tag).catch(e => {
    if (!isOutOfSync(e)) throw e;
    tag = "finalized";
    return getBlock(tag);
  });
  const wanted = writers.length
    ? writers.flatMap(w => {
        const s = writerSlots(w);
        return [
          { label: `writerHead(${w})`, key: s.head },
          { label: `writerSeq(${w})`, key: s.seq },
        ];
      })
    : [
        { label: "slot 2 (writerHead root)", key: "0x2" as Hex },
        { label: "slot 3 (writerSeq root)", key: "0x3" as Hex },
      ];
  const proof = (await helios.request({
    method: "eth_getProof",
    params: [log, wanted.map(s => s.key), block.number],
  })) as { storageProof: { key: Hex; value: Hex }[] };
  if (proof.storageProof.length !== wanted.length) throw new Error("proof is missing storage entries");
  return {
    block: { tag, number: BigInt(block.number), hash: block.hash, stateRoot: block.stateRoot },
    slots: wanted.map((s, i) => ({ ...s, value: proof.storageProof[i].value })),
  };
}
