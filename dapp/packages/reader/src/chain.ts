import { type Address, type Hex, concat, encodeAbiParameters, keccak256, parseAbi, parseAbiParameters } from "viem";
import type { AppendedLeaf } from "./types";

/** The log's `Appended` event, for decoding RPC logs and mirror snapshots. */
export const threatFlagLogAbi = parseAbi([
  "struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }",
  "event Appended(address indexed writer, uint64 indexed writerSeq, uint64 globalSeq, bytes32 leafHash, bytes32 writerHead, bytes32 globalHead, Leaf leaf)",
]);

const leafHashParams = parseAbiParameters([
  "address writer, uint64 blockNumber, uint64 writerSeq, uint64 globalSeq, Leaf leaf",
  "struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }",
]);

/** ERC, Leaf hash and chains: `keccak256(abi.encode(writer, blockNumber, writerSeq, globalSeq, leaf))`. */
export function leafHash(l: Omit<AppendedLeaf, "leafHash" | "writerHead" | "globalHead">): Hex {
  return keccak256(encodeAbiParameters(leafHashParams, [l.writer, l.blockNumber, l.writerSeq, l.globalSeq, l.leaf]));
}

/** ERC, Leaf hash and chains: `keccak256(abi.encodePacked(previousHead, leafHash))`, for writer and global chains. */
export function foldHead(previousHead: Hex, leafHash: Hex): Hex {
  return keccak256(concat([previousHead, leafHash]));
}

// ERC, Storage layout. The only contract-storage knowledge in this package.
const mappingSlot = (writer: Address, root: bigint): Hex =>
  keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [writer, root]));
export const writerHeadSlot = (writer: Address): Hex => mappingSlot(writer, 2n);
export const writerSeqSlot = (writer: Address): Hex => mappingSlot(writer, 3n);
