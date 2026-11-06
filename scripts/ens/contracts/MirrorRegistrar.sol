// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

/// @dev The subset of the ENSv2 Permissioned Registry this contract uses. Signatures match the Sepolia deployment.
interface IPermissionedRegistry {
    function findOwner(string calldata label) external view returns (address);
    function findExpiry(string calldata label) external view returns (uint64);
    function getStatus(uint256 anyId) external view returns (uint8); // 0 AVAILABLE, 1 RESERVED, 2 REGISTERED
    function register(string calldata label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) external returns (uint256 tokenId);
    function renew(uint256 anyId, uint64 newExpiry) external;
}

/// @title MirrorRegistrar
/// @notice Issues `<label>.tocsin.eth` to whoever owns `<label>.eth`, with the same expiry. Anyone can re-sync an
///         expiry after the `.eth` name is renewed. No owner, no allowlist, no fee, nothing to upgrade.
/// @dev Needs ROLE_REGISTRAR and ROLE_RENEW on the hub registry's ROOT_RESOURCE. Everything else about the hub should
///      be emancipated: see docs/plan/demo/issues/15-mirror-registrar.md.
contract MirrorRegistrar {
    IPermissionedRegistry public immutable ETH_REGISTRY; // the ENSv2 .eth registry
    IPermissionedRegistry public immutable HUB;          // tocsin.eth's own subregistry

    // Roles granted to the claimant on its name, the same bitmap the ENSv2 ETH Registrar uses.
    uint256 private constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 private constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 private constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 public constant CLAIM_ROLE_BITMAP =
        ROLE_SET_SUBREGISTRY | (ROLE_SET_SUBREGISTRY << 128) |
        ROLE_SET_RESOLVER | (ROLE_SET_RESOLVER << 128) |
        ROLE_CAN_TRANSFER_ADMIN;

    error NotNameOwner(string label, address owner, address caller);
    error AlreadyClaimed(string label);
    error NothingToSync(string label);

    event Claimed(string label, address indexed owner, uint64 expiry, uint256 tokenId);
    event Synced(string label, uint64 expiry);

    constructor(IPermissionedRegistry ethRegistry, IPermissionedRegistry hub) {
        ETH_REGISTRY = ethRegistry;
        HUB = hub;
    }

    /// @notice Claim `label.tocsin.eth`. Caller must currently own `label.eth`. `resolver` may be zero and set later.
    function claim(string calldata label, address resolver) external returns (uint256 tokenId) {
        address owner = ETH_REGISTRY.findOwner(label); // zero when expired or unregistered
        if (owner == address(0) || owner != msg.sender) revert NotNameOwner(label, owner, msg.sender);
        uint256 labelId = uint256(keccak256(bytes(label)));
        if (HUB.getStatus(labelId) != 0) revert AlreadyClaimed(label);
        uint64 expiry = ETH_REGISTRY.findExpiry(label);
        tokenId = HUB.register(label, msg.sender, address(0), resolver, CLAIM_ROLE_BITMAP, expiry);
        emit Claimed(label, msg.sender, expiry, tokenId);
    }

    /// @notice Extend `label.tocsin.eth` to match a renewed `label.eth`. Anyone may call. Reverts if there is nothing to extend.
    function sync(string calldata label) external {
        uint64 ethExpiry = ETH_REGISTRY.findExpiry(label);
        uint64 hubExpiry = HUB.findExpiry(label);
        if (ethExpiry <= hubExpiry) revert NothingToSync(label);
        HUB.renew(uint256(keccak256(bytes(label))), ethExpiry);
        emit Synced(label, ethExpiry);
    }

    /// @notice True when `label` can be claimed right now by `account`.
    function canClaim(string calldata label, address account) external view returns (bool) {
        address owner = ETH_REGISTRY.findOwner(label);
        return owner != address(0) && owner == account && HUB.getStatus(uint256(keccak256(bytes(label)))) == 0;
    }
}
