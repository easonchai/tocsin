// Usage: yarn workspace @tocsin/infra lying-proxy
// Demo beat 2. A JSON-RPC forwarder to RPC_URL that passes every method through unchanged except
// eth_getLogs, where it drops the Appended log of one writer sequence. Handles batch requests.
//   PROXY_PORT          listen port, default 8550 (binds 127.0.0.1)
//   PROXY_DROP_WRITER   writer whose log to drop, default core.tocsin.eth's core writer
//   PROXY_DROP_SEQ      writer sequence to drop, default 93, that writer's drainer-receiver-1 flag (names-manifest.11155111.json)
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { type Address, encodeEventTopics, getAddress, hexToBigInt, isAddress, isHex, pad } from "viem";
import { threatFlagLogAbi } from "./abi.js";
import { required } from "./env.js";

export type DropTarget = { writer: Address; seq: bigint };

const APPENDED = encodeEventTopics({ abi: threatFlagLogAbi, eventName: "Appended" })[0];

const isGetLogs = (r: unknown): r is { id?: unknown } =>
  typeof r === "object" && r !== null && (r as { method?: unknown }).method === "eth_getLogs";

function isTarget(log: unknown, t: DropTarget): boolean {
  const topics = (log as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(topics) || topics.length < 3 || !topics.every((x) => isHex(x))) return false;
  return (
    topics[0].toLowerCase() === APPENDED &&
    topics[1].toLowerCase() === pad(t.writer.toLowerCase() as Address, { size: 32 }) &&
    hexToBigInt(topics[2]) === t.seq
  );
}

/**
 * The proxy's lie, on parsed JSON. Given the request body and the upstream's response body, returns
 * the response with the target log removed from every eth_getLogs result, matching batch responses
 * to requests by id. Everything else comes back as is.
 */
export function lie(request: unknown, response: unknown, t: DropTarget): { response: unknown; dropped: number } {
  let dropped = 0;
  const strip = (r: unknown): unknown => {
    const result = (r as { result?: unknown } | null)?.result;
    if (!Array.isArray(result)) return r;
    const kept = result.filter((l) => !isTarget(l, t));
    dropped += result.length - kept.length;
    return { ...(r as object), result: kept };
  };
  if (Array.isArray(request) && Array.isArray(response)) {
    const ids = new Set(request.filter(isGetLogs).map((r) => JSON.stringify(r.id)));
    const out = response.map((r: unknown) => (ids.has(JSON.stringify((r as { id?: unknown } | null)?.id)) ? strip(r) : r));
    return { response: out, dropped };
  }
  return isGetLogs(request) ? { response: strip(response), dropped } : { response, dropped };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function dropTarget(): DropTarget {
  const seq = BigInt(process.env.PROXY_DROP_SEQ?.trim() || "93");
  const raw = process.env.PROXY_DROP_WRITER?.trim() || "0x36a279136adDde960599fcA356369C04A96D387E";
  if (!isAddress(raw, { strict: false })) throw new Error("PROXY_DROP_WRITER is not an address");
  return { writer: getAddress(raw), seq };
}

async function main() {
  const upstream = required("RPC_URL");
  const port = Number(process.env.PROXY_PORT?.trim() || "8550");
  const target = dropTarget();

  const server = createServer(async (req, res) => {
    if (req.method === "OPTIONS") return void res.writeHead(204, CORS).end();
    if (req.method !== "POST") return void res.writeHead(405, CORS).end();
    try {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks).toString("utf8");
      const up = await fetch(upstream, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      let text = await up.text();
      let parsed: { request: unknown; response: unknown } | undefined;
      try {
        parsed = { request: JSON.parse(body), response: JSON.parse(text) };
      } catch {
        // Not JSON on one side: nothing to filter, pass it through unchanged.
      }
      if (parsed) {
        const { response, dropped } = lie(parsed.request, parsed.response, target);
        if (dropped) {
          text = JSON.stringify(response);
          console.log(`dropped ${dropped} Appended log(s): writer ${target.writer} sequence ${target.seq}`);
        }
      }
      res.writeHead(up.status, { ...CORS, "content-type": "application/json" }).end(text);
    } catch (err) {
      console.error("upstream request failed:", err);
      res
        .writeHead(502, { ...CORS, "content-type": "application/json" })
        .end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "lying proxy: upstream request failed" } }));
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`lying proxy on http://127.0.0.1:${port}, drops writer ${target.writer} sequence ${target.seq} from eth_getLogs`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("lying proxy failed:", err);
    process.exit(1);
  });
}
