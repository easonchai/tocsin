// Shared clients, addresses and ABIs for the ENSv2 Sepolia scripts.
// Addresses are the ENSv2 Sepolia deployment from ensdomains/contracts-v2 (contracts/deployments/sepolia, deployed 2026-06-29),
// each confirmed to hold code on Sepolia on 2026-11-06. Re-check with `cast code <addr> --rpc-url $SEPOLIA_RPC` before real use.
import { createPublicClient, createWalletClient, http, keccak256, toHex, namehash, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

export const ENSV2 = {
  ETHRegistry: '0x67b728a792e789a8978b30cf1b3b641f19354b43',
  ETHRegistrar: '0xa4449a0dd2b83007553d9b1d28b583a46a805a30',
  VerifiableFactory: '0x118bc31a50d559f7015a8da26d54b3b030cdb70f',
  PermissionedResolverImpl: '0x7e4b2d59938930168024201752ee5503df402303',
  UserRegistryImpl: '0x840fa461059862ea466a711e8c98c8de732061c0',
  UniversalResolverV2: '0x85edf8b6b7d4211e2b07aa687506b746357b92cf',
  MockUSDC: '0xd3322b29a7bdee707d1684676f149bf41aa3422f',
};

// Enhanced Access Control role bits. Admin of a role is role << 128.
const adminOf = (r) => r << 128n;
export const REG = {
  ROLE_REGISTRAR: 1n << 0n, ROLE_REGISTER_RESERVED: 1n << 4n, ROLE_SET_PARENT: 1n << 8n, ROLE_UNREGISTER: 1n << 12n,
  ROLE_RENEW: 1n << 16n, ROLE_SET_SUBREGISTRY: 1n << 20n, ROLE_SET_RESOLVER: 1n << 24n, ROLE_CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
  ROLE_SET_URI: 1n << 36n, ROLE_UPGRADE: 1n << 124n,
};
export const RES = {
  ROLE_SET_ADDRESS: 1n << 0n, ROLE_SET_TEXT: 1n << 4n, ROLE_SET_CONTENTHASH: 1n << 8n, ROLE_SET_ABI: 1n << 12n,
  ROLE_SET_INTERFACE: 1n << 16n, ROLE_SET_NAME: 1n << 20n, ROLE_SET_DATA: 1n << 24n, ROLE_LINK: 1n << 28n, ROLE_UPGRADE: 1n << 124n,
};
export const withAdmin = (...roles) => roles.reduce((acc, r) => acc | r | adminOf(r), 0n);

// What the owner of tocsin.eth's own subname registry holds on ROOT_RESOURCE: enough to register, renew, repoint, and upgrade.
export const USER_REGISTRY_ROOT_ROLES = withAdmin(REG.ROLE_REGISTRAR, REG.ROLE_REGISTER_RESERVED, REG.ROLE_SET_PARENT, REG.ROLE_RENEW, REG.ROLE_SET_SUBREGISTRY, REG.ROLE_SET_RESOLVER, REG.ROLE_UPGRADE);
// What a registered subname owner gets, same bitmap as the ETH Registrar uses.
export const SUBNAME_OWNER_ROLES = withAdmin(REG.ROLE_SET_SUBREGISTRY, REG.ROLE_SET_RESOLVER) | REG.ROLE_CAN_TRANSFER_ADMIN;
// Full control of our own resolver instance.
export const RESOLVER_ADMIN_ROLES = withAdmin(RES.ROLE_SET_ADDRESS, RES.ROLE_SET_TEXT, RES.ROLE_SET_CONTENTHASH, RES.ROLE_SET_ABI, RES.ROLE_SET_INTERFACE, RES.ROLE_SET_NAME, RES.ROLE_SET_DATA, RES.ROLE_LINK, RES.ROLE_UPGRADE);

export const abi = {
  registrar: parseAbi([
    'function isAvailable(string label) view returns (bool)',
    'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
    'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)',
    'function commitmentAt(bytes32 commitment) view returns (uint64)',
    'function MIN_COMMITMENT_AGE() view returns (uint64)',
    'function MAX_COMMITMENT_AGE() view returns (uint64)',
    'function MIN_REGISTER_DURATION() view returns (uint64)',
    'function commit(bytes32 commitment)',
    'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)',
  ]),
  registry: parseAbi([
    'function getStatus(uint256 anyId) view returns (uint8)',
    'function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource))',
    'function findOwner(string label) view returns (address)',
    'function getSubregistry(string label) view returns (address)',
    'function getResolver(string label) view returns (address)',
    'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
    'function hasAssignees(uint256 anyId, uint256 roleBitmap) view returns (bool)',
    'function roles(uint256 anyId, address account) view returns (uint256)',
    'function findExpiry(string label) view returns (uint64)',
    'function getParent() view returns (address parent, string label)',
    'function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function setSubregistry(uint256 anyId, address registry)',
    'function setResolver(uint256 anyId, address resolver)',
    'function setParent(address parent, string label)',
    'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)',
    'function initialize(address rootAccount, uint256 roleBitmap)',
  ]),
  factory: parseAbi([
    'function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)',
    'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
  ]),
  resolver: parseAbi([
    'function initialize(address admin, uint256 roleBitmap, bytes[] setters)',
    'function setText(bytes32 node, string key, string value)',
    'function setAddr(bytes32 node, address addr_)',
    'function text(bytes32 node, string key) view returns (string)',
    'function addr(bytes32 node) view returns (address)',
    'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
  ]),
  usdc: parseAbi([
    'function mint(address to, uint256 amount)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function decimals() view returns (uint8)',
  ]),
};

export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '' || v === '0x') { if (fallback !== undefined) return fallback; throw new Error(`missing ${name} in scripts/.env`); }
  return v;
}

export function clients(keyName = 'PRIVATE_KEY') {
  const account = privateKeyToAccount(env(keyName));
  const transport = http(env('SEPOLIA_RPC'));
  const pub = createPublicClient({ chain: sepolia, transport });
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  return { account, pub, wallet };
}

export const labelhash = (label) => BigInt(keccak256(toHex(label)));
export { namehash, keccak256, toHex };

export async function send(pub, wallet, what, req) {
  const { request } = await pub.simulateContract({ account: wallet.account, ...req });
  const hash = await wallet.writeContract(request);
  process.stdout.write(`${what}: ${hash} … `);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? `ok (block ${r.blockNumber})` : 'REVERTED');
  if (r.status !== 'success') throw new Error(`${what} reverted`);
  return r;
}
