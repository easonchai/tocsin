// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "./utils/LogBase.sol";
import { OwnerWallet, FixedWallet, RevertingWallet, PlainDelegate } from "./utils/Mocks.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice One test per accept/reject rule at the log's boundaries. Each accepted batch is checked
/// against a test-side leaf hash and head; each rejected one asserts the exact revert reason.
contract BoundariesTest is LogBase {
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    address internal alice = makeAddr("alice");
    address internal relayer = makeAddr("relayer");

    struct Snap {
        bytes32 head;
        uint256 wSeq;
        uint256 gSeq;
    }

    function _snap(address w) internal view returns (Snap memory) {
        return Snap(tfl.writerHead(w), tfl.writerSeq(w), tfl.globalSeq());
    }

    /// @dev The writer head advanced by exactly this leaf, hashed with the spec formula.
    function _assertLanded(address w, Snap memory s, IThreatFlagLog.Leaf memory l) internal view {
        assertEq(tfl.writerHead(w), _next(s.head, _leafHash(w, block.number, s.wSeq + 1, s.gSeq + 1, l)), "head");
        assertEq(tfl.writerSeq(w), s.wSeq + 1, "writerSeq");
    }

    function _relay(address writer, IThreatFlagLog.Leaf[] memory b, uint256 deadline, uint256 nonce, bytes memory sig)
        internal
    {
        vm.prank(relayer);
        tfl.appendSigned(writer, b, deadline, nonce, sig);
    }

    // ---------------------------------------------------------------- leaf rules

    function test_leaf_opThree_accepted() public {
        IThreatFlagLog.Leaf memory l = _leaf(alice, DISPUTE, keccak256("objection"), keccak256("flagged"));
        Snap memory s = _snap(alice);
        vm.prank(alice);
        tfl.append(_one(l));
        _assertLanded(alice, s, l);
    }

    function test_leaf_opFour_rejected() public {
        // same leaf as the op 3 case, one step past the limit
        IThreatFlagLog.Leaf memory l = _leaf(alice, 4, keccak256("objection"), keccak256("flagged"));
        vm.prank(alice);
        vm.expectRevert(bytes("op"));
        tfl.append(_one(l));
    }

    function test_leaf_flagZeroEvidence_rejected() public {
        vm.prank(alice);
        vm.expectRevert(bytes("evidence"));
        tfl.append(_one(_leaf(address(0xA1), FLAG, bytes32(0), bytes32(0))));
    }

    function test_leaf_tombstoneZeroEvidence_accepted() public {
        IThreatFlagLog.Leaf memory f = _flag(address(0xA1));
        vm.prank(alice);
        tfl.append(_one(f));
        bytes32 flagHash = _leafHash(alice, block.number, 1, 1, f);

        IThreatFlagLog.Leaf memory t = _leaf(address(0xA1), TOMBSTONE, bytes32(0), flagHash);
        Snap memory s = _snap(alice);
        vm.prank(alice);
        tfl.append(_one(t));
        _assertLanded(alice, s, t);
    }

    /// @dev Relayed, so the writer (signer) differs from msg.sender: the rule binds to the writer.
    function test_leaf_disputeSubjectIsWriter_accepted() public {
        (address w, uint256 pk) = makeAddrAndKey("disputer");
        IThreatFlagLog.Leaf[] memory b = _one(_leaf(w, DISPUTE, keccak256("objection"), keccak256("flagged")));
        Snap memory s = _snap(w);
        _relay(w, b, block.timestamp, 0, _signBatch(pk, b, block.timestamp, 0));
        _assertLanded(w, s, b[0]);
    }

    /// @dev Subject is the tx sender (relayer), not the writer, so a check against msg.sender would wrongly pass.
    function test_leaf_disputeSubjectNotWriter_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("disputer");
        IThreatFlagLog.Leaf[] memory b = _one(_leaf(relayer, DISPUTE, keccak256("objection"), keccak256("flagged")));
        bytes memory sig = _signBatch(pk, b, block.timestamp, 0);
        vm.prank(relayer);
        vm.expectRevert(bytes("dispute"));
        tfl.appendSigned(w, b, block.timestamp, 0, sig);
    }

    // ---------------------------------------------------------------- signed-batch rules

    function test_signed_deadlineEqualsTimestamp_accepted() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        uint256 deadline = block.timestamp + 100;
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes memory sig = _signBatch(pk, b, deadline, 0);
        vm.warp(deadline);
        Snap memory s = _snap(w);
        _relay(w, b, deadline, 0, sig);
        _assertLanded(w, s, b[0]);
    }

    function test_signed_deadlineOneSecondPast_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        uint256 deadline = block.timestamp + 100;
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes memory sig = _signBatch(pk, b, deadline, 0);
        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(bytes("expired"));
        tfl.appendSigned(w, b, deadline, 0, sig);
    }

    /// @dev Moves the stored nonce off zero first, so "equal to stored" is not the default value.
    function _bumpNonce(address w, uint256 pk) internal returns (uint256 stored) {
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xB1)));
        _relay(w, b, block.timestamp, 0, _signBatch(pk, b, block.timestamp, 0));
        stored = tfl.signatureNonce(w);
        assertEq(stored, 1, "nonce consumed");
    }

    function test_signed_nonceEqualsStored_accepted() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        uint256 stored = _bumpNonce(w, pk);
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        Snap memory s = _snap(w);
        _relay(w, b, block.timestamp, stored, _signBatch(pk, b, block.timestamp, stored));
        _assertLanded(w, s, b[0]);
        assertEq(tfl.signatureNonce(w), stored + 1, "nonce consumed");
    }

    function test_signed_nonceStoredPlusOne_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        uint256 stored = _bumpNonce(w, pk);
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes memory sig = _signBatch(pk, b, block.timestamp, stored + 1);
        vm.prank(relayer);
        vm.expectRevert(bytes("nonce"));
        tfl.appendSigned(w, b, block.timestamp, stored + 1, sig);
    }

    function test_signed_highS_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes32 digest = _digest(b, block.timestamp, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        // the malleable twin: same signer under ecrecover, so only the low-s rule can reject it
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        assertEq(ecrecover(digest, flippedV, r, highS), w, "twin recovers to the signer");

        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(w, b, block.timestamp, 0, abi.encodePacked(r, highS, flippedV));
    }

    function test_signed_compact64Byte_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(b, block.timestamp, 0));
        // EIP-2098 compact form of a valid signature
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));

        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(w, b, block.timestamp, 0, abi.encodePacked(r, vs));

        // the same signature in 65-byte form lands, so the length is what was rejected
        _relay(w, b, block.timestamp, 0, abi.encodePacked(r, s, v));
        assertEq(tfl.signatureNonce(w), 1);
    }

    /// @dev v = 0 makes ecrecover return address(0), which equals the zero writer without the explicit guard.
    function test_signed_zeroWriterGarbageSig_rejected() public {
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes memory junk = new bytes(65);
        assertEq(ecrecover(_digest(b, block.timestamp, 0), 0, bytes32(0), bytes32(0)), address(0), "recovers zero");

        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(address(0), b, block.timestamp, 0, junk);
        assertEq(tfl.writerSeq(address(0)), 0, "nothing written as the zero writer");
    }

    // ---------------------------------------------------------------- ERC-1271 writers

    function test_1271_wrongMagicValue_rejected() public {
        FixedWallet wallet = new FixedWallet(0xffffffff);
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(address(wallet), b, block.timestamp, 0, hex"");
    }

    function test_1271_isValidSignatureReverts_rejected() public {
        RevertingWallet wallet = new RevertingWallet();
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(address(wallet), b, block.timestamp, 0, hex"");
    }

    function test_1271_rightMagicValue_accepted() public {
        (address owner, uint256 pk) = makeAddrAndKey("safeOwner");
        OwnerWallet wallet = new OwnerWallet(owner);
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        Snap memory s = _snap(address(wallet));
        _relay(address(wallet), b, block.timestamp, 0, _signBatch(pk, b, block.timestamp, 0));
        _assertLanded(address(wallet), s, b[0]);
    }

    // ---------------------------------------------------------------- EIP-7702 writers

    // forge 1.9.0 follows the designator under the pinned cancun evm_version; both tests also pass with prague.
    function _delegate(address eoa, address impl) internal {
        vm.etch(eoa, abi.encodePacked(hex"ef0100", impl));
    }

    function test_7702_delegateWithIsValidSignature_accepted() public {
        (address eoa, uint256 pk) = makeAddrAndKey("smartEoa");
        _delegate(eoa, address(new OwnerWallet(eoa)));
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        Snap memory s = _snap(eoa);
        _relay(eoa, b, block.timestamp, 0, _signBatch(pk, b, block.timestamp, 0));
        _assertLanded(eoa, s, b[0]);
    }

    function test_7702_delegateWithoutIsValidSignature_rejected() public {
        (address eoa, uint256 pk) = makeAddrAndKey("smartEoa");
        _delegate(eoa, address(new PlainDelegate()));
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes32 digest = _digest(b, block.timestamp, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        assertEq(ecrecover(digest, v, r, s), eoa, "EOA key signed");

        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(eoa, b, block.timestamp, 0, abi.encodePacked(r, s, v));
    }

    // ---------------------------------------------------------------- domain separator

    function test_domain_matchesEip712OnDefaultChain() public view {
        assertEq(tfl.DOMAIN_SEPARATOR(), _domain(block.chainid, address(tfl)));
    }

    function test_domain_changesWithChainId() public {
        bytes32 before = tfl.DOMAIN_SEPARATOR();
        uint256 other = block.chainid + 1;
        vm.chainId(other);
        assertEq(tfl.DOMAIN_SEPARATOR(), _domain(other, address(tfl)));
        assertTrue(tfl.DOMAIN_SEPARATOR() != before, "separator changed");
    }

    function test_domain_signatureFromOtherChain_rejected() public {
        (address w, uint256 pk) = makeAddrAndKey("signer");
        uint256 home = block.chainid;
        IThreatFlagLog.Leaf[] memory b = _one(_flag(address(0xA1)));
        bytes memory sig = _signBatch(pk, b, block.timestamp, 0);

        vm.chainId(home + 1);
        vm.prank(relayer);
        vm.expectRevert(bytes("sig"));
        tfl.appendSigned(w, b, block.timestamp, 0, sig);

        // back on the signing chain the same signature lands, so the chain id is what was rejected
        vm.chainId(home);
        _relay(w, b, block.timestamp, 0, sig);
        assertEq(tfl.signatureNonce(w), 1);
    }
}
