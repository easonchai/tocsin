// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "./utils/LogBase.sol";
import { LogHandler } from "./handlers/LogHandler.sol";

/// @notice The fuzzer drives the handler, never the log, so every call reaches a real state change.
contract InvariantTest is LogBase {
    LogHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new LogHandler(tfl);
        targetContract(address(handler));
        bytes4[] memory sel = new bytes4[](3);
        sel[0] = LogHandler.append.selector;
        sel[1] = LogHandler.appendSigned.selector;
        sel[2] = LogHandler.roll.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: sel }));
    }

    /// @dev Replays every recorded `Appended` from the zero head, recomputing each leaf hash from the leaf,
    /// writer, sequence numbers, and block number, and compares with what the log stores.
    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 100
    /// forge-config: default.invariant.fail-on-revert = true
    function invariant_replayReproducesHeads() public view {
        LogHandler.Rec[] memory r = handler.allRecs();
        bytes32[] memory lh = new bytes32[](r.length);

        bytes32 g;
        for (uint256 i = 0; i < r.length; i++) {
            lh[i] = _leafHash(r[i].writer, r[i].blockNumber, r[i].writerSeq, r[i].globalSeq, r[i].leaf);
            assertEq(lh[i], r[i].leafHash, "emitted leafHash");
            assertEq(r[i].globalSeq, i + 1, "global seq +1 per leaf");
            g = _next(g, lh[i]);
        }
        assertEq(g, tfl.globalHead(), "global head");
        assertEq(tfl.globalSeq(), r.length, "global seq");

        address[] memory actors = handler.allActors();
        for (uint256 a = 0; a < actors.length; a++) {
            bytes32 h;
            uint256 seq;
            for (uint256 i = 0; i < r.length; i++) {
                if (r[i].writer != actors[a]) continue;
                seq++;
                assertEq(r[i].writerSeq, seq, "writer seq +1 per leaf");
                h = _next(h, lh[i]);
            }
            assertEq(h, tfl.writerHead(actors[a]), "writer head");
            assertEq(tfl.writerSeq(actors[a]), seq, "writer seq");
        }
    }
}
