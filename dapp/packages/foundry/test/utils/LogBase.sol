// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { Test, Vm } from "forge-std/Test.sol";
import { ThreatFlagLog } from "../../contracts/ThreatFlagLog.sol";
import { IThreatFlagLog } from "../../contracts/IThreatFlagLog.sol";

/// @notice Shared helpers. Every hash here is recomputed from the ERC's formulas, never read back from the log.
abstract contract LogBase is Test {
    bytes32 internal constant APPENDED_SIG =
        keccak256("Appended(address,uint64,uint64,bytes32,bytes32,bytes32,(uint64,address,uint8,uint8,bytes32,uint64,bytes32))");
    bytes32 internal constant LEAF_TYPEHASH = keccak256(
        "Leaf(uint64 chainId,address subject,uint8 category,uint8 op,bytes32 evidence,uint64 seenBlock,bytes32 refLeaf)"
    );
    bytes32 internal constant APPEND_TYPEHASH = keccak256(
        "Append(Leaf[] leaves,uint256 deadline,uint256 nonce)Leaf(uint64 chainId,address subject,uint8 category,uint8 op,bytes32 evidence,uint64 seenBlock,bytes32 refLeaf)"
    );

    uint8 internal constant FLAG = 0;
    uint8 internal constant TOMBSTONE = 1;
    uint8 internal constant COUNTER = 2;
    uint8 internal constant DISPUTE = 3;

    /// @dev Decoded `Appended` event plus the block it was emitted in (the leaf hash commits to it).
    struct Emitted {
        address writer;
        uint64 writerSeq;
        uint64 globalSeq;
        bytes32 leafHash;
        bytes32 writerHead;
        bytes32 globalHead;
        IThreatFlagLog.Leaf leaf;
    }

    ThreatFlagLog internal impl;
    IThreatFlagLog internal tfl; // every call goes through the extracted interface, so the ABI must match it

    function setUp() public virtual {
        impl = new ThreatFlagLog();
        tfl = IThreatFlagLog(address(impl));
    }

    function _leaf(address subject, uint8 op, bytes32 evidence, bytes32 refLeaf)
        internal
        pure
        returns (IThreatFlagLog.Leaf memory)
    {
        return IThreatFlagLog.Leaf({
            chainId: 11155111,
            subject: subject,
            category: 3,
            op: op,
            evidence: evidence,
            seenBlock: 100,
            refLeaf: refLeaf
        });
    }

    function _flag(address subject) internal pure returns (IThreatFlagLog.Leaf memory) {
        return _leaf(subject, FLAG, keccak256(abi.encode("evidence", subject)), bytes32(0));
    }

    function _one(IThreatFlagLog.Leaf memory l) internal pure returns (IThreatFlagLog.Leaf[] memory a) {
        a = new IThreatFlagLog.Leaf[](1);
        a[0] = l;
    }

    // ---- ERC formulas, test side ----

    function _leafHash(address writer, uint256 bn, uint256 wSeq, uint256 gSeq, IThreatFlagLog.Leaf memory l)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(writer, bn, wSeq, gSeq, l));
    }

    function _next(bytes32 head, bytes32 leafHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(head, leafHash));
    }

    function _domain(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ThreatFlagLog"),
                keccak256("1"),
                chainId,
                verifyingContract
            )
        );
    }

    function _digest(IThreatFlagLog.Leaf[] memory leaves, uint256 deadline, uint256 nonce)
        internal
        view
        returns (bytes32)
    {
        bytes memory packed;
        for (uint256 i = 0; i < leaves.length; i++) {
            packed = abi.encodePacked(packed, keccak256(abi.encode(LEAF_TYPEHASH, leaves[i])));
        }
        bytes32 structHash = keccak256(abi.encode(APPEND_TYPEHASH, keccak256(packed), deadline, nonce));
        return keccak256(abi.encodePacked("\x19\x01", _domain(block.chainid, address(tfl)), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signBatch(uint256 pk, IThreatFlagLog.Leaf[] memory leaves, uint256 deadline, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        return _sign(pk, _digest(leaves, deadline, nonce));
    }

    // ---- events ----

    function _appended(Vm.Log[] memory logs) internal view returns (Emitted[] memory out) {
        uint256 n;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(tfl) && logs[i].topics[0] == APPENDED_SIG) n++;
        }
        out = new Emitted[](n);
        uint256 k;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(tfl) || logs[i].topics[0] != APPENDED_SIG) continue;
            Emitted memory e;
            e.writer = address(uint160(uint256(logs[i].topics[1])));
            e.writerSeq = uint64(uint256(logs[i].topics[2]));
            (e.globalSeq, e.leafHash, e.writerHead, e.globalHead, e.leaf) =
                abi.decode(logs[i].data, (uint64, bytes32, bytes32, bytes32, IThreatFlagLog.Leaf));
            out[k++] = e;
        }
    }
}
