// Which addresses a held request puts at risk, through the Snap's decoder so both hosts check the
// same address in the same context. Params come from the page: unvalidated, so read defensively.
import { type Target, signatureTargets, transactionTargets } from "../../snap/src/decode.ts";

export type { Target };

const asTx = (v: unknown): { to?: string; data?: string } => {
  const o = typeof v === "object" && v !== null ? (v as { to?: unknown; data?: unknown }) : {};
  return {
    ...(typeof o.to === "string" && { to: o.to }),
    ...(typeof o.data === "string" && { data: o.data }),
  };
};

export function parseChainId(v: unknown): bigint | undefined {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(v)) return BigInt(v);
  return undefined;
}

const unique = (ts: Target[]): Target[] => ts.filter((t, i) => ts.findIndex((u) => u.address === t.address && u.context === t.context) === i);

/** The targets of one intercepted request, and the chain it is for (the request's own, else the wallet's). */
export function requestTargets(method: string, params: unknown, walletChainId: unknown): { targets: Target[]; chainId?: bigint } {
  const p: unknown[] = Array.isArray(params) ? params : [];
  const fallback = parseChainId(walletChainId);
  const withChain = (targets: Target[], own?: bigint) => {
    const chainId = own ?? fallback;
    return chainId === undefined ? { targets } : { targets, chainId };
  };
  switch (method) {
    case "eth_sendTransaction":
      return withChain(transactionTargets(asTx(p[0])));
    case "eth_signTypedData_v4": {
      const { targets, chainId } = signatureTargets(p[1]);
      return withChain(targets, chainId);
    }
    case "wallet_sendCalls": {
      const batch = typeof p[0] === "object" && p[0] !== null ? (p[0] as { calls?: unknown; chainId?: unknown }) : {};
      const calls: unknown[] = Array.isArray(batch.calls) ? batch.calls : [];
      return withChain(unique(calls.flatMap((c) => transactionTargets(asTx(c)))), parseChainId(batch.chainId));
    }
    default:
      return withChain([]);
  }
}
