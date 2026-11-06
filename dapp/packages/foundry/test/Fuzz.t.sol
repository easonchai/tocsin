// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { RandomLeaves } from "./handlers/LogHandler.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice Random leaves, batch sizes, writers, and block numbers through both entry points. Every emitted hash
/// and head is recomputed test side from the emitted inputs and checked link by link.
contract FuzzTest is RandomLeaves {
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    struct Start {
        uint64 writerSeq;
        uint64 globalSeq;
        bytes32 writerHead;
        bytes32 globalHead;
    }

    /// @dev `first` comes straight from the fuzzer, so its field edge values (0, max) reach the log;
    /// the rest of the batch is derived from `seed`. 500-leaf batches cost about 30M gas; 256 runs still finish in a few seconds.
    /// forge-config: default.fuzz.runs = 256
    function testFuzz_batchChainsEveryLeaf(
        IThreatFlagLog.Leaf memory first,
        address sender,
        uint256 key,
        uint256 n,
        uint256 seed,
        uint256 bn,
        bool signed
    ) public {
        n = bound(n, 1, 500);
        vm.roll(bound(bn, block.number, type(uint64).max));
        uint256 pk = signed ? bound(key, 1, SECP256K1_N - 1) : 0;
        address writer = signed ? vm.addr(pk) : sender;
        _priorState(writer, seed);

        IThreatFlagLog.Leaf[] memory leaves = _randomBatch(seed, n, writer);
        leaves[0] = _valid(first, writer);

        Start memory s = Start(tfl.writerSeq(writer), tfl.globalSeq(), tfl.writerHead(writer), tfl.globalHead());
        vm.recordLogs();
        _submit(writer, sender, pk, leaves);
        _checkChains(writer, leaves, s, _appended(vm.getRecordedLogs()));
    }

    /// @dev Another writer's leaf plus 0 to 2 of the writer's own, so seqs and heads start away from zero
    /// and the writer chain and global chain differ.
    function _priorState(address writer, uint256 seed) internal {
        vm.prank(makeAddr("other"));
        tfl.append(_one(_flag(address(0xA1))));
        for (uint256 i = 0; i < seed % 3; i++) {
            vm.prank(writer);
            tfl.append(_one(_randomLeaf(~seed, i, writer)));
        }
    }

    /// @dev pk == 0 sends through `append` from the writer; otherwise `sender` relays a batch signed by pk.
    function _submit(address writer, address sender, uint256 pk, IThreatFlagLog.Leaf[] memory leaves) internal {
        if (pk == 0) {
            vm.prank(writer);
            tfl.append(leaves);
            return;
        }
        uint256 nonce = tfl.signatureNonce(writer);
        bytes memory sig = _signBatch(pk, leaves, block.timestamp, nonce);
        vm.prank(sender);
        tfl.appendSigned(writer, leaves, block.timestamp, nonce, sig);
        assertEq(tfl.signatureNonce(writer), nonce + 1, "nonce consumed");
    }

    function _checkChains(address writer, IThreatFlagLog.Leaf[] memory leaves, Start memory s, Emitted[] memory ev)
        internal
        view
    {
        assertEq(ev.length, leaves.length, "one event per leaf");
        bytes32 w = s.writerHead;
        bytes32 g = s.globalHead;
        for (uint256 i = 0; i < ev.length; i++) {
            Emitted memory e = ev[i];
            assertEq(e.writer, writer, "writer");
            assertEq(e.writerSeq, uint256(s.writerSeq) + i + 1, "writer seq +1");
            assertEq(e.globalSeq, uint256(s.globalSeq) + i + 1, "global seq +1");
            assertEq(keccak256(abi.encode(e.leaf)), keccak256(abi.encode(leaves[i])), "leaf in calldata order");

            bytes32 lh = _leafHash(e.writer, block.number, e.writerSeq, e.globalSeq, e.leaf);
            assertEq(e.leafHash, lh, "leafHash");
            assertEq(e.writerHead, _next(w, lh), "writerHead");
            assertEq(e.globalHead, _next(g, lh), "globalHead");
            assertNotEq(e.writerHead, w, "writer head moved");
            assertNotEq(e.globalHead, g, "global head moved");
            w = e.writerHead;
            g = e.globalHead;
        }
        assertEq(tfl.writerHead(writer), w, "stored writer head");
        assertEq(tfl.globalHead(), g, "stored global head");
        assertEq(tfl.writerSeq(writer), uint256(s.writerSeq) + leaves.length, "stored writer seq");
        assertEq(tfl.globalSeq(), uint256(s.globalSeq) + leaves.length, "stored global seq");
    }
}
