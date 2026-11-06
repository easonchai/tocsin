// Which addresses in a transaction or a typed-data signature the reader evaluates, and as what.
// Pure: imports only viem, so `node --test` runs it without a bundler.
import { type Address, type Hex, decodeFunctionData, getAddress, isAddress, isHex, parseAbi } from "viem";

/** Mirrors the reader's `Context` for the ones the Snap's hooks can see. */
export type Target = { address: Address; context: "recipient" | "spender" | "token"; why: string };

const callsAbi = parseAbi([
  "function transfer(address to, uint256 amount)",
  "function approve(address spender, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  // EIP-2612 permit sent as a transaction (anyone may relay it).
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  // Permit2 AllowanceTransfer.
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "struct PermitDetails { address token; uint160 amount; uint48 expiration; uint48 nonce; }",
  "struct PermitSingle { PermitDetails details; address spender; uint256 sigDeadline; }",
  "struct PermitBatch { PermitDetails[] details; address spender; uint256 sigDeadline; }",
  "function permit(address owner, PermitSingle permitSingle, bytes signature)",
  "function permit(address owner, PermitBatch permitBatch, bytes signature)",
]);

const unique = (targets: Target[]): Target[] =>
  targets.filter((t, i) => targets.findIndex((u) => u.address === t.address && u.context === t.context) === i);

/** `to` as recipient, plus the spender, recipient, or operator decoded from known calldata. Unknown calldata adds nothing. */
export function transactionTargets(tx: { to?: string | null; data?: string | null }): Target[] {
  const out: Target[] = [];
  if (tx.to && isAddress(tx.to, { strict: false })) out.push({ address: getAddress(tx.to), context: "recipient", why: "recipient" });
  if (!tx.data || !isHex(tx.data) || tx.data.length < 10) return out;
  let call;
  try {
    call = decodeFunctionData({ abi: callsAbi, data: tx.data as Hex });
  } catch {
    return out; // not one of the calls above
  }
  const { functionName, args } = call;
  if (functionName === "transfer") out.push({ address: getAddress(args[0]), context: "recipient", why: "ERC-20 transfer recipient" });
  else if (functionName === "setApprovalForAll") out.push({ address: getAddress(args[0]), context: "spender", why: "setApprovalForAll operator" });
  else if (functionName === "approve")
    out.push(
      args.length === 2
        ? { address: getAddress(args[0]), context: "spender", why: "ERC-20 approve spender" }
        : { address: getAddress(args[1]), context: "spender", why: "Permit2 approve spender" },
    );
  else if (functionName === "permit")
    out.push(
      args.length === 7
        ? { address: getAddress(args[1]), context: "spender", why: "EIP-2612 permit spender" }
        : { address: getAddress(args[1].spender), context: "spender", why: "Permit2 permit spender" },
    );
  // A send or approve of an ERC-20 (not Permit2, whose `to` is Permit2): the contract may be a flagged token.
  const erc20 = functionName === "transfer" || (functionName === "approve" && args.length === 2) || (functionName === "permit" && args.length === 7);
  if (erc20 && tx.to && isAddress(tx.to, { strict: false })) out.push({ address: getAddress(tx.to), context: "token", why: "token contract" });
  return unique(out);
}

/** Permit2 primary types whose message carries `spender` at the top level. */
const PERMIT2_TYPES = new Set(["PermitSingle", "PermitBatch", "PermitTransferFrom", "PermitBatchTransferFrom", "PermitWitnessTransferFrom", "PermitBatchWitnessTransferFrom"]);

/**
 * The spender of an EIP-2612 `Permit` or a Permit2 permit in `eth_signTypedData_v3/v4` data, and the
 * chain id from its domain. Anything else, including malformed data, yields no target.
 */
export function signatureTargets(data: unknown): { targets: Target[]; chainId?: bigint } {
  let typed: unknown = data;
  if (typeof data === "string") {
    try {
      typed = JSON.parse(data);
    } catch {
      return { targets: [] };
    }
  }
  if (typeof typed !== "object" || typed === null) return { targets: [] };
  // SAFETY: only read through optional access; each field is checked before use.
  const t = typed as { primaryType?: unknown; domain?: { chainId?: unknown }; message?: { spender?: unknown } };
  const raw = t.domain?.chainId;
  const chainId =
    typeof raw === "number" || (typeof raw === "string" && /^(0x[0-9a-fA-F]+|\d+)$/.test(raw)) ? BigInt(raw) : undefined;
  const spender = t.message?.spender;
  const kind = t.primaryType === "Permit" ? "EIP-2612 permit spender" : PERMIT2_TYPES.has(String(t.primaryType)) ? "Permit2 permit spender" : undefined;
  const targets: Target[] =
    kind && typeof spender === "string" && isAddress(spender, { strict: false })
      ? [{ address: getAddress(spender), context: "spender", why: kind }]
      : [];
  return chainId === undefined ? { targets } : { targets, chainId };
}
