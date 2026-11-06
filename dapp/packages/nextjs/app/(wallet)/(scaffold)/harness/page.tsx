"use client";

import { useEffect, useRef, useState } from "react";
import type { NextPage } from "next";
import { type Address, isAddress, toHex } from "viem";
import {
  CHECKPOINTS,
  LOG_ADDRESS,
  type ProvenRead,
  SPECIFIERS,
  type Transport,
  bootstrapAnonRpc,
  installFetchShim,
  proveWriterHeads,
  startHelios,
} from "~~/utils/harness/anonHelios";

const ENV = {
  sepoliaConsensus: process.env.NEXT_PUBLIC_HARNESS_SEPOLIA_CONSENSUS_RPC ?? "",
  sepoliaExecution: process.env.NEXT_PUBLIC_HARNESS_SEPOLIA_EXECUTION_RPC ?? "",
  mainnetConsensus: process.env.NEXT_PUBLIC_HARNESS_MAINNET_CONSENSUS_RPC ?? "",
  mainnetExecution: process.env.NEXT_PUBLIC_HARNESS_MAINNET_EXECUTION_RPC ?? "",
  torGateways: process.env.NEXT_PUBLIC_HARNESS_TOR_GATEWAYS ?? "",
  writers: process.env.NEXT_PUBLIC_HARNESS_WRITERS ?? "",
  // Editable because Helios rejects the exclusion proof of an account that does not exist yet.
  logAddress: LOG_ADDRESS as string,
};

type Result = ProvenRead & { transport: string; routed: number };

const list = (s: string) =>
  s
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

const Harness: NextPage = () => {
  const [form, setForm] = useState({ ...ENV, transport: "tor" as Transport, fallback: false });
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<Result>();
  const [running, setRunning] = useState(false);
  const cleanup = useRef<(() => void)[]>([]);

  const teardown = () => {
    cleanup.current.reverse().forEach(f => f());
    cleanup.current = [];
  };
  useEffect(() => teardown, []);

  const run = async () => {
    teardown();
    setRunning(true);
    setResult(undefined);
    setLines([]);
    const t0 = performance.now();
    const log = (msg: string) => {
      const line = `+${((performance.now() - t0) / 1000).toFixed(1)}s ${msg}`;
      console.info("[harness]", line);
      setLines(l => [...l, line]);
    };
    try {
      const writers = list(form.writers);
      const bad = writers.find(w => !isAddress(w));
      if (bad) throw new Error(`not an address: ${bad}`);
      if (!isAddress(form.logAddress)) throw new Error(`not an address: ${form.logAddress}`);
      const logAddress = form.logAddress;
      for (const k of Object.keys(ENV) as (keyof typeof ENV)[])
        if (!form[k] && k !== "writers" && k !== "torGateways") throw new Error(`${k} is empty`);

      log(`mainnet Helios: syncing from checkpoint ${CHECKPOINTS.mainnet.root}`);
      const mainnet = await startHelios("mainnet", {
        consensusRpc: form.mainnetConsensus,
        executionRpc: form.mainnetExecution,
      });
      cleanup.current.push(() => void mainnet.shutdown());
      log("mainnet Helios: synced");

      const bootWorker = async () => {
        log(`${form.transport} worker: reading specifier ${SPECIFIERS[form.transport]} through mainnet Helios`);
        const { worker, workerHash } = await bootstrapAnonRpc({
          transport: form.transport,
          mainnetHelios: mainnet,
          torGateways: list(form.torGateways),
        }).finally(() => mainnet.shutdown());
        cleanup.current.push(() => worker.close());
        log(`${form.transport} worker: ready, bundle keccak256 matched light-client-verified workerHash ${workerHash}`);
        return worker;
      };
      const proveOnSepolia = async () => {
        log(`Sepolia Helios: syncing from checkpoint ${CHECKPOINTS.sepolia.root}`);
        const sepolia = await startHelios("sepolia", {
          consensusRpc: form.sepoliaConsensus,
          executionRpc: form.sepoliaExecution,
        });
        cleanup.current.push(() => void sepolia.shutdown());
        log("Sepolia Helios: synced");
        return proveWriterHeads(sepolia, writers as Address[], logAddress);
      };

      if (!form.fallback) {
        const worker = await bootWorker();
        let routed = 0;
        cleanup.current.push(installFetchShim(form.sepoliaExecution, worker.fetch, () => routed++));
        log("fetch shim installed: Sepolia execution RPC now goes through the worker");
        const read = await proveOnSepolia();
        log(`proved ${read.slots.length} slots at block ${read.block.number}; ${routed} execution requests via worker`);
        setResult({ ...read, transport: `${form.transport} worker`, routed });
        return;
      }

      // Fallback: proofs go to the execution RPC directly; the worker carries the log read.
      const read = await proveOnSepolia();
      log(`proved ${read.slots.length} slots at block ${read.block.number} directly, not anonymised`);
      setResult({ ...read, transport: "direct, not anonymised", routed: 0 });
      const worker = await bootWorker();
      const res = await worker.fetch(form.sepoliaExecution, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getLogs",
          params: [
            { address: logAddress, fromBlock: toHex(read.block.number - 1000n), toBlock: toHex(read.block.number) },
          ],
        }),
      });
      const logs = (await res.json()) as { result?: unknown[]; error?: { message: string } };
      if (!logs.result) throw new Error(`eth_getLogs via worker: ${logs.error?.message ?? res.status}`);
      log(
        `eth_getLogs via ${form.transport} worker: ${logs.result.length} logs in the 1000 blocks to ${read.block.number}`,
      );
    } catch (e) {
      const chain: string[] = [];
      for (let c: unknown = e; c; c = c instanceof Error ? c.cause : undefined) chain.push(String(c));
      log(`FAILED: ${chain.join(" <- ")}`);
      console.error("[harness]", e);
    } finally {
      setRunning(false);
    }
  };

  const field = (key: keyof typeof ENV, label: string) => (
    <label className="form-control w-full">
      <span className="label-text text-sm">{label}</span>
      <input
        className="input input-bordered input-sm w-full font-mono"
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 flex flex-col gap-4">
      <h1 className="text-2xl font-bold m-0">Helios plus Anon-RPC harness</h1>
      <p className="m-0 text-sm">
        Proves the log&apos;s per-writer heads (ERC storage slots 2 and 3) on Sepolia with a light client, and sends
        every execution RPC request for that proof through the Anon-RPC worker.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("sepoliaConsensus", "Sepolia consensus RPC")}
        {field("sepoliaExecution", "Sepolia execution RPC (through the worker)")}
        {field("mainnetConsensus", "Mainnet consensus RPC (worker bootstrap)")}
        {field("mainnetExecution", "Mainnet execution RPC (worker bootstrap, direct)")}
        {field("torGateways", "Tor gateways, comma separated")}
        {field("writers", "Writers to prove, comma separated")}
        {field("logAddress", "Log address (Sepolia)")}
      </div>
      <div className="flex items-center gap-2">
        <select
          className="select select-bordered select-sm"
          value={form.transport}
          onChange={e => setForm(f => ({ ...f, transport: e.target.value as Transport }))}
        >
          <option value="tor">Tor</option>
          <option value="nym">Nym</option>
        </select>
        <label className="label cursor-pointer gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={form.fallback}
            onChange={e => setForm(f => ({ ...f, fallback: e.target.checked }))}
          />
          Fallback: proofs direct
        </label>
        <button className="btn btn-primary btn-sm" disabled={running} onClick={run}>
          {running ? "Running" : "Run"}
        </button>
      </div>
      <p className="m-0 text-sm" role="note">
        {form.fallback
          ? "Fallback mode. Storage proofs go straight to the Sepolia execution RPC. Helios still verifies them, but that server sees your IP address and which log you read. Log reads go through the worker and are anonymised, and so will ENS and broadcast."
          : "Every Sepolia execution request, the storage proofs included, goes through the worker and is anonymised. The consensus RPC and the mainnet RPCs used to boot the worker are contacted directly; they learn that you run a light client and which worker you load, nothing about the log."}
      </p>

      {result && (
        <div className="card bg-base-200 p-4 text-sm font-mono break-all">
          <div>
            Proofs served by: {result.transport} ({result.routed} execution requests through the worker)
          </div>
          <div>
            Header ({result.block.tag}): #{result.block.number.toString()} {result.block.hash}
          </div>
          <div>State root: {result.block.stateRoot}</div>
          {result.slots.map(s => (
            <div key={s.key}>
              {s.label} = {s.value}
            </div>
          ))}
        </div>
      )}
      <pre className="bg-base-300 p-3 text-xs whitespace-pre-wrap min-h-24" aria-live="polite">
        {lines.join("\n")}
      </pre>
    </div>
  );
};

export default Harness;
