// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

contract ThreatFlagLog {
    struct Leaf {
        uint64  chainId;
        address subject;
        uint8   category;
        uint8   op;
        bytes32 evidence;
        uint64  seenBlock;
        bytes32 refLeaf;
    }

    bytes32 public globalHead;   // slot 0
    uint64  public globalSeq;    // slot 1
    mapping(address => bytes32) public writerHead;      // slot 2
    mapping(address => uint64)  public writerSeq;       // slot 3
    mapping(address => uint256) public signatureNonce;  // slot 4

    bytes32 private constant LEAF_TYPEHASH = keccak256(
        "Leaf(uint64 chainId,address subject,uint8 category,uint8 op,bytes32 evidence,uint64 seenBlock,bytes32 refLeaf)"
    );
    bytes32 private constant APPEND_TYPEHASH = keccak256(
        "Append(Leaf[] leaves,uint256 deadline,uint256 nonce)Leaf(uint64 chainId,address subject,uint8 category,uint8 op,bytes32 evidence,uint64 seenBlock,bytes32 refLeaf)"
    );
    uint256 private immutable INITIAL_CHAIN_ID;
    bytes32 private immutable INITIAL_DOMAIN_SEPARATOR;

    event Appended(
        address indexed writer, uint64 indexed writerSeq, uint64 globalSeq,
        bytes32 leafHash, bytes32 writerHead, bytes32 globalHead, Leaf leaf
    );

    constructor() {
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = _buildDomain();
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _buildDomain();
    }

    /// @dev ERC-165: 0x01ffc9a7 is ERC-165 itself; 0xffc90efa is type(IThreatFlagLog).interfaceId.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0xffc90efa;
    }

    function append(Leaf[] calldata leaves) external {
        _append(msg.sender, leaves);
    }

    function appendSigned(
        address writer, Leaf[] calldata leaves, uint256 deadline, uint256 nonce, bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "expired");
        require(nonce == signatureNonce[writer], "nonce");
        bytes32[] memory leafHashes = new bytes32[](leaves.length);
        for (uint256 i = 0; i < leaves.length; i++) {
            leafHashes[i] = keccak256(abi.encode(LEAF_TYPEHASH, leaves[i]));
        }
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01", DOMAIN_SEPARATOR(),
            keccak256(abi.encode(APPEND_TYPEHASH, keccak256(abi.encodePacked(leafHashes)), deadline, nonce))
        ));
        require(_isValidSignature(writer, digest, signature), "sig");
        signatureNonce[writer] = nonce + 1;
        _append(writer, leaves);
    }

    function _append(address writer, Leaf[] calldata leaves) internal {
        uint256 n = leaves.length;
        require(n > 0, "empty");
        bytes32 wHead = writerHead[writer];
        bytes32 gHead = globalHead;
        uint64 wSeq = writerSeq[writer];
        uint64 gSeq = globalSeq;
        uint64 bn = uint64(block.number);
        for (uint256 i = 0; i < n; i++) {
            uint256 fmp;
            assembly ("memory-safe") { fmp := mload(0x40) }
            Leaf calldata leaf = leaves[i];
            require(leaf.op <= 3, "op");
            require(leaf.op != 0 || leaf.evidence != bytes32(0), "evidence");
            require(leaf.op != 3 || leaf.subject == writer, "dispute");
            wSeq++; gSeq++;
            bytes32 leafHash = keccak256(abi.encode(writer, bn, wSeq, gSeq, leaf));
            wHead = keccak256(abi.encodePacked(wHead, leafHash));
            gHead = keccak256(abi.encodePacked(gHead, leafHash));
            emit Appended(writer, wSeq, gSeq, leafHash, wHead, gHead, leaf);
            // release per-iteration scratch so a large batch does not pay quadratic memory expansion
            assembly ("memory-safe") { mstore(0x40, fmp) }
        }
        writerHead[writer] = wHead;
        writerSeq[writer] = wSeq;
        globalHead = gHead;
        globalSeq = gSeq;
    }

    function _isValidSignature(address writer, bytes32 digest, bytes calldata sig) internal view returns (bool) {
        if (writer.code.length > 0) {
            (bool ok, bytes memory ret) = writer.staticcall(
                abi.encodeCall(IERC1271.isValidSignature, (digest, sig))
            );
            return ok && ret.length == 32 && abi.decode(ret, (bytes4)) == IERC1271.isValidSignature.selector;
        }
        if (sig.length != 65) return false;
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return false;
        return ecrecover(digest, v, r, s) == writer;
    }

    function _buildDomain() private view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ThreatFlagLog"), keccak256("1"), block.chainid, address(this)
        ));
    }
}
