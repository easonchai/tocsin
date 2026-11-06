// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "./utils/LogBase.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice Raw storage reads against the spec's normative slots, and the pinned ERC-165 answer.
contract StorageAndInterfaceTest is LogBase {
    bytes4 internal constant ERC165_ID = 0x01ffc9a7;
    bytes4 internal constant LOG_ID = 0xffc90efa; // the value the contract's comment and the spec reference state

    function _slot(address w, uint256 root) internal pure returns (bytes32) {
        return keccak256(abi.encode(w, root));
    }

    function _signed(address w, uint256 pk, IThreatFlagLog.Leaf[] memory leaves) internal {
        uint256 nonce = tfl.signatureNonce(w);
        tfl.appendSigned(w, leaves, block.timestamp, nonce, _signBatch(pk, leaves, block.timestamp, nonce));
    }

    function test_storageSlotsMatchGettersAfterSignedAppends() public {
        (address a, uint256 pkA) = makeAddrAndKey("writerA");
        (address b, uint256 pkB) = makeAddrAndKey("writerB");

        IThreatFlagLog.Leaf[] memory two = new IThreatFlagLog.Leaf[](2);
        two[0] = _flag(address(0xA1));
        two[1] = _flag(address(0xA2));

        _signed(a, pkA, _one(_flag(address(0xA0)))); // a: nonce 0 -> 1, seq 1
        _signed(b, pkB, _one(_flag(address(0xB0)))); // b: nonce 0 -> 1, seq 1
        _signed(a, pkA, two); //                        a: nonce 1 -> 2, seq 3
        vm.prank(b);
        tfl.append(_one(_flag(address(0xB1)))); //      b: direct append, nonce stays 1, seq 2

        address log = address(tfl);

        // slot 0 and slot 1
        assertEq(vm.load(log, bytes32(uint256(0))), tfl.globalHead());
        uint256 raw1 = uint256(vm.load(log, bytes32(uint256(1))));
        assertEq(raw1, 5);
        assertEq(raw1, uint256(tfl.globalSeq()));
        assertEq(raw1 >> 64, 0, "slot 1 high 24 bytes must be zero");

        // mapping roots hold nothing themselves
        for (uint256 s = 2; s <= 4; s++) {
            assertEq(vm.load(log, bytes32(s)), bytes32(0));
        }

        address[2] memory ws = [a, b];
        uint64[2] memory seqs = [uint64(3), uint64(2)];
        uint256[2] memory nonces = [uint256(2), uint256(1)];
        for (uint256 i = 0; i < 2; i++) {
            address w = ws[i];
            bytes32 head = vm.load(log, _slot(w, 2));
            assertEq(head, tfl.writerHead(w));
            assertTrue(head != bytes32(0));

            uint256 seq = uint256(vm.load(log, _slot(w, 3)));
            assertEq(seq, uint256(tfl.writerSeq(w)));
            assertEq(seq, seqs[i]);

            uint256 nonce = uint256(vm.load(log, _slot(w, 4)));
            assertEq(nonce, tfl.signatureNonce(w));
            assertEq(nonce, nonces[i]);
        }
        assertTrue(tfl.writerHead(a) != tfl.writerHead(b));

        // a writer that never appended reads zero at every derived slot
        address c = makeAddr("never");
        for (uint256 s = 2; s <= 4; s++) {
            assertEq(vm.load(log, _slot(c, s)), bytes32(0));
        }
    }

    function test_erc165_logInterfaceId() public view {
        assertEq(type(IThreatFlagLog).interfaceId, LOG_ID);
        assertTrue(impl.supportsInterface(type(IThreatFlagLog).interfaceId));
    }

    function test_erc165_erc165Id() public view {
        assertTrue(impl.supportsInterface(ERC165_ID));
    }

    function test_erc165_invalidIdFalse() public view {
        assertFalse(impl.supportsInterface(0xffffffff));
    }

    function testFuzz_erc165_otherIdsFalse(bytes4 id) public view {
        vm.assume(id != ERC165_ID && id != LOG_ID); // two of 2^32 values, so rejection is negligible
        assertFalse(impl.supportsInterface(id));
    }
}
