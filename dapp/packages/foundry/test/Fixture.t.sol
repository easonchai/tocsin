// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

import { LogBase } from "./utils/LogBase.sol";
import { ThreatFlagLog } from "../contracts/ThreatFlagLog.sol";
import { IThreatFlagLog } from "../contracts/IThreatFlagLog.sol";

/// @notice Fixed scenario that writes the reader's hash-parity fixture.
/// Every hash is checked against an independent model before the file is written.
contract FixtureTest is LogBase {
    string internal constant PATH = "fixtures/parity.json";
    address internal constant LOG = 0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14; // predicted Sepolia CREATE2 address
    uint256 internal constant CHAIN = 11155111;
    uint256 internal constant T0 = 1_790_000_000;
    uint256 internal constant DEADLINE = T0 + 3600;
    uint256 internal constant B0 = 9_000_000;

    string internal constant FORMAT =
        "All integers are decimal strings. Addresses are EIP-55 checksummed hex; bytes32 and bytes are 0x-prefixed lowercase hex. "
        "leaves are in globalSeq order; blockNumber is the block the leaf was appended in. "
        "leafHash = keccak256(abi.encode(writer, blockNumber, writerSeq, globalSeq, leaf)); "
        "writerHeadAfter and globalHeadAfter fold keccak256(abi.encodePacked(previousHead, leafHash)) from bytes32(0). "
        "The log is deployed with deployCodeTo at the predicted Sepolia CREATE2 address with chainid 11155111, "
        "so domainSeparator is the one that address has on Sepolia. "
        "Each signed batch covers the leaves with globalSeq firstGlobalSeq to firstGlobalSeq + count - 1; "
        "signature is r || s || v over digest = keccak256(0x1901 || domainSeparator || hashStruct(Append(leaves, deadline, nonce))). "
        "writers holds each writer's final head, seq and signatureNonce as read from the log.";

    struct Rec {
        address writer;
        string entryPoint;
        uint256 blockNumber;
        uint256 writerSeq;
        uint256 globalSeq;
        IThreatFlagLog.Leaf leaf;
        bytes32 leafHash;
        bytes32 writerHeadAfter;
        bytes32 globalHeadAfter;
    }

    struct Batch {
        address writer;
        address submitter;
        uint256 blockNumber;
        uint256 firstGlobalSeq;
        uint256 count;
        uint256 deadline;
        uint256 nonce;
        bytes32 digest;
        bytes signature;
    }

    Rec[] internal recs;
    Batch[] internal batches;

    // independent model of the chains, never read back from the log
    mapping(address => bytes32) internal mHead;
    mapping(address => uint256) internal mSeq;
    bytes32 internal mGHead;
    uint256 internal mGSeq;

    address internal alpha;
    address internal beta;
    uint256 internal betaPk;
    address internal relayer;

    function setUp() public override {
        vm.chainId(CHAIN);
        vm.warp(T0);
        vm.roll(B0);
        deployCodeTo("ThreatFlagLog.sol:ThreatFlagLog", LOG);
        impl = ThreatFlagLog(LOG);
        tfl = IThreatFlagLog(LOG);
        (alpha,) = makeAddrAndKey("tfl-fixture-writer-alpha");
        (beta, betaPk) = makeAddrAndKey("tfl-fixture-writer-beta");
        relayer = makeAddr("tfl-fixture-relayer");
    }

    function test_writeParityFixture() public {
        assertEq(tfl.DOMAIN_SEPARATOR(), _domain(CHAIN, LOG), "domain");

        // block B0: alpha flags three subjects (categories 1, 3, 4)
        IThreatFlagLog.Leaf[] memory b = new IThreatFlagLog.Leaf[](3);
        b[0] = _l(0, "poisoner", 1, FLAG, 1, 21_400_100, 0);
        b[1] = _l(CHAIN, "drainer-receiver", 3, FLAG, 2, 8_999_870, 0);
        b[2] = _l(CHAIN, "malicious-delegate", 4, FLAG, 3, 8_999_911, 0);
        bytes32[] memory a1 = _submit(alpha, b, 0, 0);

        // block B0 + 1: beta signs two flags (categories 2, 5), a relayer submits
        vm.roll(B0 + 1);
        b = new IThreatFlagLog.Leaf[](2);
        b[0] = _l(0, "poisoning-funder", 2, FLAG, 4, 21_399_870, 0);
        b[1] = _l(1, "fake-token", 5, FLAG, 5, 21_398_002, 0);
        _submit(beta, b, betaPk, 0);

        // block B0 + 4: alpha tombstones its own category 3 flag and flags two more (categories 6, 7)
        vm.roll(B0 + 4);
        b = new IThreatFlagLog.Leaf[](3);
        b[0] = _l(CHAIN, "drainer-receiver", 3, TOMBSTONE, 6, 9_000_002, a1[1]);
        b[1] = _l(0, "paid-lookalike", 6, FLAG, 7, 21_400_350, 0);
        b[2] = _l(CHAIN, "drainer-spender", 7, FLAG, 8, 9_000_003, 0);
        _submit(alpha, b, 0, 0);

        // block B0 + 10: beta counters alpha's category 1 flag, disputes a flag on itself, flags category 8
        vm.roll(B0 + 10);
        b = new IThreatFlagLog.Leaf[](3);
        b[0] = _l(0, "poisoner", 1, COUNTER, 9, 21_400_400, a1[0]);
        b[1] = IThreatFlagLog.Leaf({
            chainId: uint64(CHAIN),
            subject: beta,
            category: 5,
            op: DISPUTE,
            evidence: _ev(10),
            seenBlock: 9_000_008,
            refLeaf: bytes32(0)
        });
        b[2] = _l(0, "theft-proceeds", 8, FLAG, 11, 21_400_420, 0);
        _submit(beta, b, betaPk, 1);

        // block B0 + 11: alpha flags category 8 on its own chain
        vm.roll(B0 + 11);
        _submit(alpha, _one(_l(CHAIN, "theft-proceeds-sepolia", 8, FLAG, 12, 9_000_010, 0)), 0, 0);

        // stored state equals the model
        assertEq(tfl.globalHead(), mGHead, "globalHead");
        assertEq(tfl.globalSeq(), mGSeq, "globalSeq");
        assertEq(tfl.writerHead(alpha), mHead[alpha], "alpha head");
        assertEq(tfl.writerSeq(alpha), mSeq[alpha], "alpha seq");
        assertEq(tfl.writerHead(beta), mHead[beta], "beta head");
        assertEq(tfl.writerSeq(beta), mSeq[beta], "beta seq");
        assertEq(tfl.signatureNonce(beta), 2, "beta nonce");
        assertEq(tfl.signatureNonce(alpha), 0, "alpha nonce");

        _write();
    }

    // ---- scenario helpers ----

    function _ev(uint256 i) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("tfl-fixture/evidence/", i));
    }

    function _l(uint256 chainId, string memory subject, uint8 category, uint8 op, uint256 ev, uint64 seen, bytes32 ref)
        internal
        returns (IThreatFlagLog.Leaf memory)
    {
        return IThreatFlagLog.Leaf({
            chainId: uint64(chainId),
            subject: makeAddr(string.concat("tfl-fixture-subject-", subject)),
            category: category,
            op: op,
            evidence: _ev(ev),
            seenBlock: seen,
            refLeaf: ref
        });
    }

    /// @dev pk == 0 means `append` from the writer; otherwise `appendSigned` by the relayer.
    function _submit(address writer, IThreatFlagLog.Leaf[] memory leaves, uint256 pk, uint256 nonce)
        internal
        returns (bytes32[] memory hashes)
    {
        vm.recordLogs();
        if (pk == 0) {
            vm.prank(writer);
            tfl.append(leaves);
        } else {
            bytes32 digest = _digest(leaves, DEADLINE, nonce);
            bytes memory sig = _sign(pk, digest);
            vm.prank(relayer);
            tfl.appendSigned(writer, leaves, DEADLINE, nonce, sig);
            batches.push(Batch(writer, relayer, block.number, mGSeq + 1, leaves.length, DEADLINE, nonce, digest, sig));
        }
        Emitted[] memory ev = _appended(vm.getRecordedLogs());
        assertEq(ev.length, leaves.length, "event count");
        hashes = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; i++) {
            hashes[i] = _check(writer, pk == 0 ? "append" : "appendSigned", leaves[i], ev[i]);
        }
    }

    function _check(address writer, string memory entry, IThreatFlagLog.Leaf memory l, Emitted memory e)
        internal
        returns (bytes32 lh)
    {
        uint256 wSeq = ++mSeq[writer];
        uint256 gSeq = ++mGSeq;
        lh = _leafHash(writer, block.number, wSeq, gSeq, l);
        mHead[writer] = _next(mHead[writer], lh);
        mGHead = _next(mGHead, lh);

        assertEq(e.writer, writer, "writer");
        assertEq(e.writerSeq, wSeq, "writerSeq");
        assertEq(e.globalSeq, gSeq, "globalSeq");
        assertEq(e.leafHash, lh, "leafHash");
        assertEq(e.writerHead, mHead[writer], "writerHead");
        assertEq(e.globalHead, mGHead, "globalHead");
        assertEq(keccak256(abi.encode(e.leaf)), keccak256(abi.encode(l)), "leaf");

        recs.push(Rec(writer, entry, block.number, wSeq, gSeq, l, lh, mHead[writer], mGHead));
    }

    // ---- JSON ----

    function _write() internal {
        string[] memory leaves = new string[](recs.length);
        for (uint256 i = 0; i < recs.length; i++) {
            leaves[i] = _recJson(i);
        }
        string[] memory bs = new string[](batches.length);
        for (uint256 i = 0; i < batches.length; i++) {
            bs[i] = _batchJson(i);
        }
        string[] memory writers = new string[](2);
        writers[0] = _writerJson("alpha", alpha);
        writers[1] = _writerJson("beta", beta);

        // objects serialize with keys in sorted order, so the file is byte-stable
        string memory k = "fixture";
        vm.serializeString(k, "format", FORMAT);
        vm.serializeString(k, "chainId", vm.toString(CHAIN));
        vm.serializeAddress(k, "log", LOG);
        vm.serializeBytes32(k, "domainSeparator", tfl.DOMAIN_SEPARATOR());
        vm.serializeBytes32(k, "globalHead", tfl.globalHead());
        vm.serializeString(k, "globalSeq", vm.toString(uint256(tfl.globalSeq())));
        vm.serializeString(k, "writers", writers);
        vm.serializeString(k, "signedBatches", bs);
        string memory json = vm.serializeString(k, "leaves", leaves);

        vm.createDir("fixtures", true);
        vm.writeJson(json, PATH);
    }

    function _recJson(uint256 i) internal returns (string memory) {
        Rec storage r = recs[i];
        string memory k = string.concat("leaf-", vm.toString(i));
        vm.serializeAddress(k, "writer", r.writer);
        vm.serializeString(k, "entryPoint", r.entryPoint);
        vm.serializeString(k, "blockNumber", vm.toString(r.blockNumber));
        vm.serializeString(k, "writerSeq", vm.toString(r.writerSeq));
        vm.serializeString(k, "globalSeq", vm.toString(r.globalSeq));
        vm.serializeString(k, "leaf", _leafJson(string.concat(k, "-fields"), r.leaf));
        vm.serializeBytes32(k, "leafHash", r.leafHash);
        vm.serializeBytes32(k, "writerHeadAfter", r.writerHeadAfter);
        return vm.serializeBytes32(k, "globalHeadAfter", r.globalHeadAfter);
    }

    function _leafJson(string memory k, IThreatFlagLog.Leaf memory l) internal returns (string memory) {
        vm.serializeString(k, "chainId", vm.toString(uint256(l.chainId)));
        vm.serializeAddress(k, "subject", l.subject);
        vm.serializeString(k, "category", vm.toString(uint256(l.category)));
        vm.serializeString(k, "op", vm.toString(uint256(l.op)));
        vm.serializeBytes32(k, "evidence", l.evidence);
        vm.serializeString(k, "seenBlock", vm.toString(uint256(l.seenBlock)));
        return vm.serializeBytes32(k, "refLeaf", l.refLeaf);
    }

    function _batchJson(uint256 i) internal returns (string memory) {
        Batch storage s = batches[i];
        string memory k = string.concat("batch-", vm.toString(i));
        vm.serializeAddress(k, "writer", s.writer);
        vm.serializeAddress(k, "submitter", s.submitter);
        vm.serializeString(k, "blockNumber", vm.toString(s.blockNumber));
        vm.serializeString(k, "firstGlobalSeq", vm.toString(s.firstGlobalSeq));
        vm.serializeString(k, "count", vm.toString(s.count));
        vm.serializeString(k, "deadline", vm.toString(s.deadline));
        vm.serializeString(k, "nonce", vm.toString(s.nonce));
        vm.serializeBytes32(k, "digest", s.digest);
        return vm.serializeBytes(k, "signature", s.signature);
    }

    function _writerJson(string memory label, address w) internal returns (string memory) {
        string memory k = string.concat("writer-", label);
        vm.serializeString(k, "label", label);
        vm.serializeAddress(k, "address", w);
        vm.serializeBytes32(k, "head", tfl.writerHead(w));
        vm.serializeString(k, "seq", vm.toString(uint256(tfl.writerSeq(w))));
        return vm.serializeString(k, "signatureNonce", vm.toString(tfl.signatureNonce(w)));
    }
}
