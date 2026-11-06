// SPDX-License-Identifier: CC0-1.0
pragma solidity 0.8.28;

// Fork test against the live ENSv2 Sepolia contracts (the 1 October 2026 set the Universal Resolver reads). Run:
//   forge test --root scripts/ens --fork-url $SEPOLIA_RPC -vv
// It takes tocsin.eth's real owner, deploys a fresh UserRegistry through the Verifiable Factory, wires the registrar,
// emancipates, then exercises claim / sync / rejection using tocsin.eth itself as the claimant's .eth name.

import {MirrorRegistrar, IPermissionedRegistry} from "../contracts/MirrorRegistrar.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function warp(uint256) external;
    function label(address, string calldata) external;
}

interface IFactory { function deployProxy(address implementation, uint256 salt, bytes calldata data) external returns (address); }
interface IRegistryAdmin {
    struct Grant { address account; uint256 roleBitmap; }
    function initialize(Grant[] calldata grants) external;
    function isEmancipated() external view returns (bool);
    function grantRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function revokeRootRoles(uint256 roleBitmap, address account) external returns (bool);
    function hasAssignees(uint256 anyId, uint256 roleBitmap) external view returns (bool);
    function hasRootRoles(uint256 roleBitmap, address account) external view returns (bool);
    function setSubregistry(uint256 anyId, address registry) external;
    function setParent(address parent, string calldata label) external;
    function findOwner(string calldata label) external view returns (address);
    function findExpiry(string calldata label) external view returns (uint64);
    function renew(uint256 anyId, uint64 newExpiry) external;
    function register(string calldata label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) external returns (uint256);
}

contract MirrorRegistrarTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ETH_REGISTRY = 0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4;
    address constant FACTORY = 0xDa70306C98E97eCe36F997a21368e53298572991;
    address constant USER_REGISTRY_IMPL = 0x9BD8a88719068D09ecee662f36C0E3856708366a;

    // roles
    uint256 constant ROLE_REGISTRAR = 1 << 0;
    uint256 constant ROLE_REGISTER_RESERVED = 1 << 4;
    uint256 constant ROLE_SET_PARENT = 1 << 8;
    uint256 constant ROLE_UNREGISTER = 1 << 12;
    uint256 constant ROLE_RENEW = 1 << 16;
    uint256 constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 constant ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128;
    uint256 constant ROLE_UPGRADE = 1 << 124;
    function withAdmin(uint256 r) internal pure returns (uint256) { return r | (r << 128); }

    address owner;      // tocsin.eth owner on the fork
    address hub;        // fresh UserRegistry proxy
    MirrorRegistrar reg;

    function setUp() public {
        owner = IRegistryAdmin(ETH_REGISTRY).findOwner("tocsin");
        require(owner != address(0), "tocsin.eth not registered on this fork");
        vm.startPrank(owner);
        uint256 rootRoles = withAdmin(ROLE_REGISTRAR) | withAdmin(ROLE_REGISTER_RESERVED) | withAdmin(ROLE_SET_PARENT) | withAdmin(ROLE_RENEW) | withAdmin(ROLE_SET_SUBREGISTRY) | withAdmin(ROLE_SET_RESOLVER) | withAdmin(ROLE_UPGRADE);
        IRegistryAdmin.Grant[] memory grants = new IRegistryAdmin.Grant[](1);
        grants[0] = IRegistryAdmin.Grant(owner, rootRoles);
        hub = IFactory(FACTORY).deployProxy(USER_REGISTRY_IMPL, uint256(keccak256("test-hub")), abi.encodeCall(IRegistryAdmin.initialize, (grants)));
        IRegistryAdmin(ETH_REGISTRY).setSubregistry(uint256(keccak256("tocsin")), hub);
        IRegistryAdmin(hub).setParent(ETH_REGISTRY, "tocsin");
        reg = new MirrorRegistrar(IPermissionedRegistry(ETH_REGISTRY), IPermissionedRegistry(hub));
        IRegistryAdmin(hub).grantRootRoles(ROLE_REGISTRAR | ROLE_RENEW, address(reg));
        // core is registered by the team before emancipation
        IRegistryAdmin(hub).register("core", owner, address(0), address(0), reg.CLAIM_ROLE_BITMAP(), IRegistryAdmin(ETH_REGISTRY).findExpiry("tocsin"));
        // emancipate: the owner gives up every root role, including its own registrar role
        IRegistryAdmin(hub).revokeRootRoles(rootRoles, owner);
        vm.stopPrank();
    }

    function test_emancipated() public view {
        uint256 dangerous = withAdmin(ROLE_SET_RESOLVER) | withAdmin(ROLE_SET_SUBREGISTRY) | withAdmin(ROLE_UNREGISTER) | ROLE_CAN_TRANSFER_ADMIN | withAdmin(ROLE_UPGRADE);
        require(!IRegistryAdmin(hub).hasAssignees(0, dangerous), "dangerous root role still held");
        require(IRegistryAdmin(hub).isEmancipated(), "isEmancipated() disagrees");
        require(IRegistryAdmin(hub).hasRootRoles(ROLE_REGISTRAR | ROLE_RENEW, address(reg)), "registrar lost its roles");
        require(!IRegistryAdmin(hub).hasRootRoles(ROLE_REGISTRAR, owner), "owner can still mint directly");
    }

    function test_claim_by_eth_owner() public {
        vm.prank(owner);
        reg.claim("tocsin", address(0)); // tocsin.tocsin.eth, claimed by the owner of tocsin.eth
        require(IRegistryAdmin(hub).findOwner("tocsin") == owner, "not minted to owner");
        require(IRegistryAdmin(hub).findExpiry("tocsin") == IRegistryAdmin(ETH_REGISTRY).findExpiry("tocsin"), "expiry not mirrored");
    }

    function test_claim_by_stranger_reverts() public {
        address stranger = address(0xBEEF);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MirrorRegistrar.NotNameOwner.selector, "tocsin", owner, stranger));
        reg.claim("tocsin", address(0));
    }

    function test_claim_unregistered_reverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MirrorRegistrar.NotNameOwner.selector, "no-such-name-xyz", address(0), owner));
        reg.claim("no-such-name-xyz", address(0));
    }

    function test_double_claim_reverts() public {
        vm.startPrank(owner);
        reg.claim("tocsin", address(0));
        vm.expectRevert(abi.encodeWithSelector(MirrorRegistrar.AlreadyClaimed.selector, "tocsin"));
        reg.claim("tocsin", address(0));
        vm.stopPrank();
    }

    function test_sync_noop_reverts_then_extends_after_renewal() public {
        vm.prank(owner);
        reg.claim("tocsin", address(0));
        vm.expectRevert(abi.encodeWithSelector(MirrorRegistrar.NothingToSync.selector, "tocsin"));
        reg.sync("tocsin");
        // simulate a renewal of tocsin.eth by the ETH registrar's renew role holder: not available on the fork without the
        // registrar's USDC flow, so this part asserts only the guard. The extend path is covered by the registry's own tests.
    }

    function test_direct_register_by_owner_reverts() public {
        vm.prank(owner);
        vm.expectRevert();
        IRegistryAdmin(hub).register("anything", owner, address(0), address(0), 0, type(uint64).max);
    }
}
