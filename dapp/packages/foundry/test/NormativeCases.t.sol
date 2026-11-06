// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "./utils/LogBase.sol";
import { OwnerWallet, FixedWallet } from "./utils/Mocks.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice ERC Test Cases 1 to 9, one test each. Cases 10 to 12 belong to the reader (demo spec).
contract NormativeCasesTest is LogBase {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function test_case01_freshWriterOneFlag() public {
        // n earlier leaves from another writer, so globalSeq = n + 1 is distinguishable from writerSeq = 1
        uint256 n = 4;
        vm.startPrank(bob);
        for (uint256 i = 0; i < n; i++) {
            tfl.append(_one(_flag(address(uint160(0x1000 + i)))));
        }
        vm.stopPrank();
        bytes32 gBefore = tfl.globalHead();

        IThreatFlagLog.Leaf memory l = _flag(makeAddr("drainer"));
        vm.recordLogs();
        vm.prank(alice);
        tfl.append(_one(l));
        Emitted[] memory ev = _appended(vm.getRecordedLogs());

        bytes32 lh = _leafHash(alice, block.number, 1, n + 1, l);
        assertEq(tfl.writerSeq(alice), 1);
        assertEq(tfl.globalSeq(), n + 1);
        assertEq(tfl.writerHead(alice), keccak256(abi.encodePacked(bytes32(0), lh)));
        assertEq(tfl.globalHead(), _next(gBefore, lh));

        assertEq(ev.length, 1);
        assertEq(ev[0].writer, alice);
        assertEq(ev[0].writerSeq, tfl.writerSeq(alice));
        assertEq(ev[0].globalSeq, tfl.globalSeq());
        assertEq(ev[0].leafHash, lh);
        assertEq(ev[0].writerHead, tfl.writerHead(alice));
        assertEq(ev[0].globalHead, tfl.globalHead());
        assertEq(keccak256(abi.encode(ev[0].leaf)), keccak256(abi.encode(l)));
    }

    function test_case02_batchOfThreeInCalldataOrder() public {
        IThreatFlagLog.Leaf[] memory b = new IThreatFlagLog.Leaf[](3);
        b[0] = _flag(address(0xA1));
        b[1] = _flag(address(0xA2));
        b[2] = _flag(address(0xA3));

        vm.recordLogs();
        vm.prank(alice);
        tfl.append(b);
        Emitted[] memory ev = _appended(vm.getRecordedLogs());

        assertEq(ev.length, 3);
        bytes32 w;
        bytes32 g;
        for (uint256 i = 0; i < 3; i++) {
            bytes32 lh = _leafHash(alice, block.number, i + 1, i + 1, b[i]);
            w = _next(w, lh);
            g = _next(g, lh);
            assertEq(ev[i].writerSeq, i + 1);
            assertEq(ev[i].globalSeq, i + 1);
            assertEq(ev[i].leaf.subject, b[i].subject, "calldata order");
            assertEq(ev[i].leafHash, lh);
            assertEq(ev[i].writerHead, w);
            assertEq(ev[i].globalHead, g);
        }
        assertEq(tfl.writerHead(alice), w);
        assertEq(tfl.globalHead(), g);
        assertEq(tfl.writerSeq(alice), 3);
    }

    function test_case03_emptyBatchReverts() public {
        IThreatFlagLog.Leaf[] memory empty = new IThreatFlagLog.Leaf[](0);
        vm.prank(alice);
        vm.expectRevert(bytes("empty"));
        tfl.append(empty);
    }

    function test_case04_opFourReverts() public {
        IThreatFlagLog.Leaf memory l = _flag(address(0xA1));
        l.op = 4;
        vm.prank(alice);
        vm.expectRevert(bytes("op"));
        tfl.append(_one(l));
    }

    function test_case05_flagWithZeroEvidenceReverts() public {
        IThreatFlagLog.Leaf memory l = _leaf(address(0xA1), FLAG, bytes32(0), bytes32(0));
        vm.prank(alice);
        vm.expectRevert(bytes("evidence"));
        tfl.append(_one(l));
    }

    function test_case06_signedNonceAndWriter() public {
        (address signer, uint256 pk) = makeAddrAndKey("signer");
        address relayer = makeAddr("relayer");
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        uint256 deadline = block.timestamp + 1 hours;

        // stale nonce: signed and submitted for nonce 1 while the stored nonce is 0
        bytes memory staleSig = _signBatch(pk, b, deadline, 1);
        vm.prank(relayer);
        vm.expectRevert(bytes("nonce"));
        tfl.appendSigned(signer, b, deadline, 1, staleSig);

        uint256 before = tfl.signatureNonce(signer);
        vm.recordLogs();
        vm.prank(relayer);
        tfl.appendSigned(signer, b, deadline, before, _signBatch(pk, b, deadline, before));
        Emitted[] memory ev = _appended(vm.getRecordedLogs());

        assertEq(ev.length, 1);
        assertEq(ev[0].writer, signer, "writer is the signer");
        assertTrue(ev[0].writer != relayer, "writer is not the tx sender");
        assertEq(tfl.writerSeq(relayer), 0);
        assertEq(tfl.signatureNonce(signer), before + 1);

        // the used nonce is now stale
        vm.prank(relayer);
        vm.expectRevert(bytes("nonce"));
        tfl.appendSigned(signer, b, deadline, before, _signBatch(pk, b, deadline, before));
    }

    function test_case07_contractWriterMagicValue() public {
        (address owner, uint256 pk) = makeAddrAndKey("safeOwner");
        OwnerWallet good = new OwnerWallet(owner);
        FixedWallet bad = new FixedWallet(0x1626ba7f);
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        uint256 deadline = block.timestamp + 1;
        bytes memory sig = _signBatch(pk, b, deadline, 0);

        tfl.appendSigned(address(good), b, deadline, 0, sig);
        assertEq(tfl.writerSeq(address(good)), 1);

        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(address(bad), b, deadline, 0, sig);
    }

    function test_case08_replayReproducesHeads() public {
        (address carol, uint256 pk) = makeAddrAndKey("carol");
        address[2] memory writers = [alice, bob];
        vm.recordLogs();
        for (uint256 round = 0; round < 3; round++) {
            vm.roll(block.number + 1);
            for (uint256 w = 0; w < 2; w++) {
                IThreatFlagLog.Leaf[] memory b = new IThreatFlagLog.Leaf[](round + 1);
                for (uint256 i = 0; i < b.length; i++) {
                    b[i] = _flag(address(uint160(0xB000 + round * 16 + i)));
                }
                vm.prank(writers[w]);
                tfl.append(b);
            }
            IThreatFlagLog.Leaf[] memory s = _one(_flag(address(uint160(0xC000 + round))));
            uint256 nonce = tfl.signatureNonce(carol);
            tfl.appendSigned(carol, s, block.timestamp, nonce, _signBatch(pk, s, block.timestamp, nonce));
        }
        Emitted[] memory ev = _appended(vm.getRecordedLogs());

        address[3] memory all = [alice, bob, carol];
        for (uint256 w = 0; w < 3; w++) {
            bytes32 head;
            uint64 seq;
            for (uint256 i = 0; i < ev.length; i++) {
                if (ev[i].writer != all[w]) continue;
                head = _next(head, ev[i].leafHash);
                seq = ev[i].writerSeq;
            }
            assertEq(head, tfl.writerHead(all[w]));
            assertEq(seq, tfl.writerSeq(all[w]));
        }
        bytes32 g;
        for (uint256 i = 0; i < ev.length; i++) {
            g = _next(g, ev[i].leafHash);
        }
        assertEq(g, tfl.globalHead());
        assertEq(ev[ev.length - 1].globalSeq, tfl.globalSeq());
    }

    function test_case09_storageSlots() public {
        vm.prank(alice);
        tfl.append(_one(_flag(address(0xA1))));
        vm.prank(bob);
        tfl.append(_one(_flag(address(0xA2))));
        vm.prank(alice);
        tfl.append(_one(_flag(address(0xA3))));

        address a = address(tfl);
        assertEq(vm.load(a, bytes32(uint256(0))), tfl.globalHead());
        assertEq(uint256(vm.load(a, bytes32(uint256(1)))), uint256(tfl.globalSeq()));
        address[2] memory ws = [alice, bob];
        for (uint256 i = 0; i < 2; i++) {
            assertEq(vm.load(a, keccak256(abi.encode(ws[i], uint256(2)))), tfl.writerHead(ws[i]));
            assertEq(uint256(vm.load(a, keccak256(abi.encode(ws[i], uint256(3))))), uint256(tfl.writerSeq(ws[i])));
        }
    }
}
