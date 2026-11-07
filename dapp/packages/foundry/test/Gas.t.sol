// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { console } from "forge-std/Test.sol";
import { LogBase } from "./utils/LogBase.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice Gas snapshots in snapshots/ThreatFlagLog.json, the source of the README's per-flag figure.
/// Each test runs on a fresh log with a fresh writer, so every storage write is zero to non-zero (worst case).
/// The snapshot value already includes the 21000 base and calldata: it equals the receipt gasUsed of the same
/// transaction sent to anvil (checked 2026-11-06). The logs split it into parts.
contract GasTest is LogBase {
    string internal constant GROUP = "ThreatFlagLog";

    function _batch(uint256 n) internal pure returns (IThreatFlagLog.Leaf[] memory leaves) {
        leaves = new IThreatFlagLog.Leaf[](n);
        for (uint256 i = 0; i < n; i++) {
            leaves[i] = _flag(address(uint160(0x10000 + i)));
        }
    }

    /// @dev EIP-2028 calldata cost: 16 gas per non-zero byte, 4 per zero byte.
    function _calldataGas(bytes memory data) internal pure returns (uint256 g) {
        for (uint256 i = 0; i < data.length; i++) {
            g += data[i] == 0 ? 4 : 16;
        }
    }

    function _log(string memory name, bytes memory data, uint256 txGas) internal pure {
        uint256 cd = _calldataGas(data);
        console.log(name);
        console.log("  tx gas (snapshot)", txGas);
        console.log("  calldata bytes   ", data.length);
        console.log("  calldata gas     ", cd);
        console.log("  execution gas    ", txGas - 21000 - cd);
    }

    function test_gas_append1() public {
        IThreatFlagLog.Leaf[] memory leaves = _batch(1);
        tfl.append(leaves);
        uint256 g = vm.snapshotGasLastFrame(GROUP, "append_1_leaf");
        assertEq(tfl.globalSeq(), 1);
        _log("append 1", abi.encodeCall(IThreatFlagLog.append, (leaves)), g);
    }

    function test_gas_append100() public {
        IThreatFlagLog.Leaf[] memory leaves = _batch(100);
        tfl.append(leaves);
        uint256 g = vm.snapshotGasLastFrame(GROUP, "append_100_leaves");
        assertEq(tfl.globalSeq(), 100);
        _log("append 100", abi.encodeCall(IThreatFlagLog.append, (leaves)), g);
    }

    function test_gas_appendSigned100() public {
        (address w, uint256 pk) = makeAddrAndKey("gasWriter");
        IThreatFlagLog.Leaf[] memory leaves = _batch(100);
        uint256 deadline = block.timestamp;
        bytes memory sig = _signBatch(pk, leaves, deadline, 0);
        tfl.appendSigned(w, leaves, deadline, 0, sig);
        uint256 g = vm.snapshotGasLastFrame(GROUP, "appendSigned_100_leaves");
        assertEq(tfl.writerSeq(w), 100);
        _log("appendSigned 100", abi.encodeCall(IThreatFlagLog.appendSigned, (w, leaves, deadline, 0, sig)), g);
    }
}
