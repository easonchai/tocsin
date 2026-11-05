import { parseAbi } from "viem";

// Hand-written so viem infers argument types; abi.test.ts checks it against forge's compiled ABI.
export const threatFlagLogAbi = parseAbi([
  "struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }",
  "event Appended(address indexed writer, uint64 indexed writerSeq, uint64 globalSeq, bytes32 leafHash, bytes32 writerHead, bytes32 globalHead, Leaf leaf)",
  "function append(Leaf[] leaves)",
  "function appendSigned(address writer, Leaf[] leaves, uint256 deadline, uint256 nonce, bytes signature)",
  "function globalSeq() view returns (uint64)",
  "function writerSeq(address writer) view returns (uint64)",
  "function signatureNonce(address writer) view returns (uint256)",
]);

export const OP = { FLAG: 0, TOMBSTONE: 1, COUNTER: 2, DISPUTE: 3 } as const;

/** ERC, Interface: at most 500 leaves per call keeps a batch under the EIP-7825 gas cap. */
export const MAX_BATCH = 500;
