// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

interface IThreatFlagLog {
    struct Leaf {
        uint64  chainId;
        address subject;
        uint8   category;
        uint8   op;
        bytes32 evidence;
        uint64  seenBlock;
        bytes32 refLeaf;
    }

    /// @dev `subject` is deliberately not indexed: no node should offer a per-subject filter.
    event Appended(
        address indexed writer,
        uint64  indexed writerSeq,
        uint64  globalSeq,
        bytes32 leafHash,
        bytes32 writerHead,
        bytes32 globalHead,
        Leaf    leaf
    );

    /// @notice Append leaves under msg.sender's namespace.
    function append(Leaf[] calldata leaves) external;

    /// @notice Append leaves under `writer`'s namespace, authorized by `writer`'s EIP-712 signature.
    /// @param deadline  block.timestamp after which the signature is invalid
    /// @param nonce     the writer's current signature nonce
    function appendSigned(
        address writer,
        Leaf[] calldata leaves,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external;

    function globalHead() external view returns (bytes32);
    function globalSeq() external view returns (uint64);
    function writerHead(address writer) external view returns (bytes32);
    function writerSeq(address writer) external view returns (uint64);
    function signatureNonce(address writer) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
