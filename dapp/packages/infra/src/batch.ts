import { type Account, type Address, type Hex, getAddress, isAddress, isHex } from "viem";
import { MAX_BATCH } from "./abi.js";

export type Leaf = {
  chainId: bigint;
  subject: Address;
  category: number;
  op: number;
  evidence: Hex;
  seenBlock: bigint;
  refLeaf: Hex;
};

/** A writer's EIP-712 `Append` signature over `leaves`, bound to one log on one chain. */
export type SignedBatch = {
  log: Address;
  chainId: number;
  writer: Address;
  leaves: Leaf[];
  deadline: bigint;
  nonce: bigint;
  signature: Hex;
};

export const appendTypes = {
  Append: [
    { name: "leaves", type: "Leaf[]" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
  Leaf: [
    { name: "chainId", type: "uint64" },
    { name: "subject", type: "address" },
    { name: "category", type: "uint8" },
    { name: "op", type: "uint8" },
    { name: "evidence", type: "bytes32" },
    { name: "seenBlock", type: "uint64" },
    { name: "refLeaf", type: "bytes32" },
  ],
} as const;

export type SignArgs = { log: Address; chainId: number; leaves: Leaf[]; deadline: bigint; nonce: bigint };

/** Signs `Append(Leaf[] leaves,uint256 deadline,uint256 nonce)` in the log's domain (ERC, Interface). */
export async function signBatch(account: Account, args: SignArgs): Promise<SignedBatch> {
  if (!account.signTypedData) throw new Error("account cannot sign typed data");
  if (args.leaves.length === 0 || args.leaves.length > MAX_BATCH) throw new Error(`a batch holds 1 to ${MAX_BATCH} leaves`);
  const signature = await account.signTypedData({
    domain: { name: "ThreatFlagLog", version: "1", chainId: args.chainId, verifyingContract: args.log },
    types: appendTypes,
    primaryType: "Append",
    message: { leaves: args.leaves, deadline: args.deadline, nonce: args.nonce },
  });
  return { ...args, writer: account.address, signature };
}

/** JSON form: bigints as decimal strings, everything else as is. */
export function batchToJson(batch: SignedBatch): string {
  return JSON.stringify(batch, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2);
}

function fail(msg: string): never {
  throw new Error(`invalid batch: ${msg}`);
}

function uint(v: unknown, field: string, bits: number): bigint {
  if (typeof v !== "string" && typeof v !== "number") fail(`${field} must be a decimal string`);
  const s = String(v);
  if (!/^\d+$/.test(s)) fail(`${field} must be a non-negative integer`);
  const n = BigInt(s);
  if (n >= 1n << BigInt(bits)) fail(`${field} exceeds uint${bits}`);
  return n;
}

function addr(v: unknown, field: string): Address {
  if (typeof v !== "string" || !isAddress(v, { strict: false })) fail(`${field} must be an address`);
  return getAddress(v);
}

function bytes32(v: unknown, field: string): Hex {
  if (typeof v !== "string" || !isHex(v) || v.length !== 66) fail(`${field} must be 32 bytes of hex`);
  return v;
}

function obj(v: unknown, field: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(`${field} must be an object`);
  return v as Record<string, unknown>; // SAFETY: non-null, non-array object checked above
}

/** Parses the JSON form back into a SignedBatch. Shape only; the relayer checks chain state. */
export function parseBatch(input: unknown): SignedBatch {
  const b = obj(input, "batch");
  if (!Array.isArray(b.leaves) || b.leaves.length === 0 || b.leaves.length > MAX_BATCH) {
    fail(`leaves must be an array of 1 to ${MAX_BATCH}`);
  }
  const leaves = b.leaves.map((raw, i): Leaf => {
    const l = obj(raw, `leaves[${i}]`);
    const op = Number(uint(l.op, `leaves[${i}].op`, 8));
    if (op > 3) fail(`leaves[${i}].op must be 0 to 3`);
    return {
      chainId: uint(l.chainId, `leaves[${i}].chainId`, 64),
      subject: addr(l.subject, `leaves[${i}].subject`),
      category: Number(uint(l.category, `leaves[${i}].category`, 8)),
      op,
      evidence: bytes32(l.evidence, `leaves[${i}].evidence`),
      seenBlock: uint(l.seenBlock, `leaves[${i}].seenBlock`, 64),
      refLeaf: bytes32(l.refLeaf, `leaves[${i}].refLeaf`),
    };
  });
  if (typeof b.signature !== "string" || !isHex(b.signature) || b.signature.length < 4) fail("signature must be hex");
  return {
    log: addr(b.log, "log"),
    chainId: Number(uint(b.chainId, "chainId", 53)),
    writer: addr(b.writer, "writer"),
    leaves,
    deadline: uint(b.deadline, "deadline", 256),
    nonce: uint(b.nonce, "nonce", 256),
    signature: b.signature,
  };
}
