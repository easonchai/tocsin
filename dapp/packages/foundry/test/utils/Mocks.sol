// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @notice ERC-1271 wallet that accepts a signature from its owner key, the way a Safe or 7702 delegate would.
contract OwnerWallet {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        if (sig.length != 65) return 0xffffffff;
        (bytes32 r, bytes32 s) = abi.decode(sig[:64], (bytes32, bytes32));
        return ecrecover(hash, uint8(sig[64]), r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// @notice ERC-1271 wallet that returns a fixed value for every signature.
contract FixedWallet {
    bytes4 internal immutable answer;

    constructor(bytes4 answer_) {
        answer = answer_;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        return answer;
    }
}

/// @notice ERC-1271 wallet whose `isValidSignature` always reverts.
contract RevertingWallet {
    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        revert("no");
    }
}

/// @notice Delegate with no `isValidSignature`, like a 7702 batch-executor that does not do ERC-1271.
contract PlainDelegate {
    function ping() external pure returns (uint256) {
        return 1;
    }
}
