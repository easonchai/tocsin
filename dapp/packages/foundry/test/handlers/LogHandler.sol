// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "../utils/LogBase.sol";
import { IThreatFlagLog } from "../../contracts/IThreatFlagLog.sol";

/// @notice Random leaves over the full field domains, then forced into the log's validity rules with `bound()`.
abstract contract RandomLeaves is LogBase {
    /// @dev Makes any leaf acceptable for `writer`: op in 0..3, FLAG carries evidence, DISPUTE names the writer.
    function _valid(IThreatFlagLog.Leaf memory l, address writer) internal pure returns (IThreatFlagLog.Leaf memory) {
        l.op = uint8(bound(l.op, 0, 3));
        if (l.op == FLAG && l.evidence == bytes32(0)) l.evidence = bytes32(uint256(1));
        if (l.op == DISPUTE) l.subject = writer;
        return l;
    }

    function _randomLeaf(uint256 seed, uint256 i, address writer) internal pure returns (IThreatFlagLog.Leaf memory l) {
        uint256 a = uint256(keccak256(abi.encode(seed, i, 0)));
        l = IThreatFlagLog.Leaf({
            chainId: uint64(a),
            subject: address(uint160(a >> 64)),
            category: uint8(a >> 224),
            op: uint8(a >> 232),
            evidence: keccak256(abi.encode(seed, i, 1)),
            seenBlock: uint64(uint256(keccak256(abi.encode(seed, i, 2)))),
            refLeaf: keccak256(abi.encode(seed, i, 3))
        });
        // hashes are never zero, so put the zero values back into the domain: evidence 1 in 4, refLeaf 1 in 2
        if ((a >> 240) & 3 == 0) l.evidence = bytes32(0);
        if ((a >> 242) & 1 == 0) l.refLeaf = bytes32(0);
        return _valid(l, writer);
    }

    function _randomBatch(uint256 seed, uint256 n, address writer)
        internal
        pure
        returns (IThreatFlagLog.Leaf[] memory b)
    {
        b = new IThreatFlagLog.Leaf[](n);
        for (uint256 i = 0; i < n; i++) {
            b[i] = _randomLeaf(seed, i, writer);
        }
    }
}

/// @notice Invariant handler. Owns funded signing actors, sends only valid batches through both entry points,
/// and records every emitted `Appended` with its block number so the invariant can replay from zero.
contract LogHandler is RandomLeaves {
    struct Rec {
        address writer;
        uint64 blockNumber;
        uint64 writerSeq;
        uint64 globalSeq;
        bytes32 leafHash;
        IThreatFlagLog.Leaf leaf;
    }

    uint256 internal constant ACTORS = 4;
    uint256 internal constant MAX_BATCH = 10;

    address[] internal actors;
    uint256[] internal keys;
    Rec[] internal recs;

    constructor(IThreatFlagLog log) {
        tfl = log;
        for (uint256 i = 0; i < ACTORS; i++) {
            (address a, uint256 k) = makeAddrAndKey(string.concat("actor", vm.toString(i)));
            vm.deal(a, 100 ether);
            actors.push(a);
            keys.push(k);
        }
    }

    function append(uint256 actorSeed, uint256 n, uint256 seed) external {
        address w = actors[bound(actorSeed, 0, ACTORS - 1)];
        IThreatFlagLog.Leaf[] memory b = _randomBatch(seed, bound(n, 1, MAX_BATCH), w);
        vm.recordLogs();
        vm.prank(w);
        tfl.append(b);
        _record();
    }

    /// @dev The relayer is another actor (or the writer itself), so a leaf credited to the sender breaks the replay.
    function appendSigned(uint256 actorSeed, uint256 relayerSeed, uint256 n, uint256 seed) external {
        uint256 i = bound(actorSeed, 0, ACTORS - 1);
        address w = actors[i];
        IThreatFlagLog.Leaf[] memory b = _randomBatch(seed, bound(n, 1, MAX_BATCH), w);
        uint256 nonce = tfl.signatureNonce(w);
        bytes memory sig = _signBatch(keys[i], b, block.timestamp, nonce);
        vm.recordLogs();
        vm.prank(actors[bound(relayerSeed, 0, ACTORS - 1)]);
        tfl.appendSigned(w, b, block.timestamp, nonce, sig);
        _record();
    }

    /// @dev Leaf hashes commit to the block number, so the chains must survive block changes.
    function roll(uint256 blocks) external {
        blocks = bound(blocks, 1, 1000);
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * 12);
    }

    function _record() internal {
        Emitted[] memory ev = _appended(vm.getRecordedLogs());
        for (uint256 i = 0; i < ev.length; i++) {
            Rec storage r = recs.push();
            r.writer = ev[i].writer;
            r.blockNumber = uint64(block.number);
            r.writerSeq = ev[i].writerSeq;
            r.globalSeq = ev[i].globalSeq;
            r.leafHash = ev[i].leafHash;
            r.leaf = ev[i].leaf;
        }
    }

    function allRecs() external view returns (Rec[] memory) {
        return recs;
    }

    function allActors() external view returns (address[] memory) {
        return actors;
    }
}
