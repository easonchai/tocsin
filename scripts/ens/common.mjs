// Shared clients, addresses, ABIs and helpers for the ENSv2 Sepolia scripts.
//
// Addresses are the ENSv2 Sepolia set that the Universal Resolver reads today: the 1 October 2026 redeploy, as listed
// on docs.ens.domains/learn/deployments and in @ensdomains/ensjs 5.2.12 (ensL1Contracts[11155111]). The older June set
// still sits in ensdomains/contracts-v2 under contracts/deployments/sepolia and still answers calls, but nothing
// resolves through it; do not take addresses from there. Every address below was checked for code and for the
// function selectors used here on 6 Nov 2026.
import { createPublicClient, createWalletClient, http, keccak256, toHex, namehash, parseAbi, encodeFunctionData, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { packetToBytes } from 'viem/ens';

export const ENSV2 = {
  RootRegistry: '0xb458d6a3a77919449d03e7a6903c26827c1ec43f',
  ETHRegistry: '0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4',
  ETHRegistrar: '0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3',
  VerifiableFactory: '0xDa70306C98E97eCe36F997a21368e53298572991',
  PermissionedResolverImpl: '0x115eb53F0c60696633855F90b138178Fb40b2b2C',
  UserRegistryImpl: '0x9BD8a88719068D09ecee662f36C0E3856708366a',
  UniversalResolver: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe', // the upgradable proxy every app resolves through
  MockUSDC: '0x240b0316Df57887DBBE58b586508b19e633a14aa',
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
// Root roles the hub owner needs before emancipation: register, renew, repoint, record the parent, upgrade.
export const USER_REGISTRY_ROOT_ROLES = withAdmin(REG.ROLE_REGISTRAR, REG.ROLE_REGISTER_RESERVED, REG.ROLE_SET_PARENT, REG.ROLE_RENEW, REG.ROLE_SET_SUBREGISTRY, REG.ROLE_SET_RESOLVER, REG.ROLE_UPGRADE);
// What a registered subname owner gets on its own name, the same bitmap the ETH Registrar uses.
export const SUBNAME_OWNER_ROLES = withAdmin(REG.ROLE_SET_SUBREGISTRY, REG.ROLE_SET_RESOLVER) | REG.ROLE_CAN_TRANSFER_ADMIN;
// Roles that block emancipation while any account holds them on the root.
export const DANGEROUS_ROOT_ROLES = withAdmin(REG.ROLE_SET_RESOLVER, REG.ROLE_SET_SUBREGISTRY, REG.ROLE_UNREGISTER, REG.ROLE_UPGRADE) | REG.ROLE_CAN_TRANSFER_ADMIN;
// Full control of a resolver instance.
export const RESOLVER_ADMIN_ROLES = withAdmin(RES.ROLE_SET_ADDRESS, RES.ROLE_SET_TEXT, RES.ROLE_SET_CONTENTHASH, RES.ROLE_SET_ABI, RES.ROLE_SET_INTERFACE, RES.ROLE_SET_NAME, RES.ROLE_SET_DATA, RES.ROLE_LINK, RES.ROLE_UPGRADE);

export const abi = {
  registrar: parseAbi([
    'function isAvailable(string label) view returns (bool)',
    'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
    'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)',
    'function MIN_COMMITMENT_AGE() view returns (uint64)',
    'function commit(bytes32 commitment)',
    'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256 tokenId)',
  ]),
  registry: parseAbi([
    'function getStatus(uint256 anyId) view returns (uint8)',
    'function findOwner(string label) view returns (address)',
    'function findExpiry(string label) view returns (uint64)',
    'function getSubregistry(string label) view returns (address)',
    'function getResolver(string label) view returns (address)',
    'function getParent() view returns (address parent, string label)',
    'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
    'function hasAssignees(uint256 anyId, uint256 roleBitmap) view returns (bool)',
    'function roles(uint256 anyId, address account) view returns (uint256)',
    'function isEmancipated() view returns (bool)',
    'function setSubregistry(uint256 anyId, address registry)',
    'function setResolver(uint256 anyId, address resolver)',
    'function setParent(address parent, string label)',
    'function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256 tokenId)',
    'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function initialize((address account, uint256 roleBitmap)[] grants)',
  ]),
  factory: parseAbi([
    'function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)',
    'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
  ]),
  // The October resolver matches the docs: setters take the DNS-encoded name, no standalone getters, records read via resolve().
  resolver: parseAbi([
    'function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)',
    'function setText(bytes name, string key, string value)',
    'function setAddress(bytes name, uint256 coinType, bytes addressBytes)',
    'function grantSetterRoles(bytes setter, address account)',
    'function grantRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)',
    'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)',
    'function resolve(bytes name, bytes data) view returns (bytes)',
  ]),
  profile: parseAbi(['function text(bytes32 node, string key) view returns (string)', 'function addr(bytes32 node) view returns (address)']),
  usdc: parseAbi([
    'function mint(address to, uint256 amount)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 value) returns (bool)',
    'function decimals() view returns (uint8)',
  ]),
  mirror: parseAbi([
    'function ETH_REGISTRY() view returns (address)',
    'function HUB() view returns (address)',
    'function canClaim(string label, address account) view returns (bool)',
    'function claim(string label, address resolver) returns (uint256 tokenId)',
    'function sync(string label)',
    'event Claimed(string label, address indexed owner, uint64 expiry, uint256 tokenId)',
  ]),
};

export const ZERO = '0x0000000000000000000000000000000000000000';
export const ZERO32 = '0x' + '00'.repeat(32);
export const dns = (name) => toHex(packetToBytes(name));
export const labelhash = (label) => BigInt(keccak256(toHex(label)));
export { namehash, keccak256, toHex, encodeFunctionData, decodeEventLog };

export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v.trim() === '' || v.trim() === '0x') { if (fallback !== undefined) return fallback; throw new Error(`missing ${name} in scripts/.env`); }
  return v.trim();
}

export function clientsFor(privateKey) {
  const account = privateKeyToAccount(privateKey);
  const transport = http(env('SEPOLIA_RPC'));
  return { account, pub: createPublicClient({ chain: sepolia, transport }), wallet: createWalletClient({ account, chain: sepolia, transport }) };
}

export async function send(pub, wallet, what, req) {
  const { request } = await pub.simulateContract({ account: wallet.account, ...req });
  const hash = await wallet.writeContract(request);
  process.stdout.write(`${what}: ${hash} … `);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? `ok (block ${r.blockNumber})` : 'REVERTED');
  if (r.status !== 'success') throw new Error(`${what} reverted`);
  await settle(pub, r.blockNumber);
  return r;
}

// Public RPCs are load balanced; a read right after a receipt can hit a node one block behind.
export async function settle(pub, blockNumber) {
  let ok = 0;
  for (let i = 0; i < 40 && ok < 3; i++) {
    const n = await pub.getBlockNumber({ cacheTime: 0 }).catch(() => 0n);
    if (n >= blockNumber) ok++; else ok = 0;
    if (ok < 3) await new Promise((res) => setTimeout(res, 1500));
  }
}
export async function readUntil(fn, accept, { tries = 8, delay = 2500 } = {}) {
  let v;
  for (let i = 0; i < tries; i++) { v = await fn().catch(() => undefined); if (v !== undefined && accept(v)) return v; await new Promise((res) => setTimeout(res, delay)); }
  return v;
}

// Deploy a proxy through the Verifiable Factory, or return the existing one at the predicted address.
export async function deployProxy(pub, wallet, what, implementation, saltLabel, initData) {
  const salt = BigInt(keccak256(toHex(saltLabel)));
  let predicted = null;
  try { predicted = (await pub.simulateContract({ account: wallet.account, address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] })).result; } catch {}
  if (predicted && (await pub.getCode({ address: predicted }))) { console.log(`${what}: already deployed at ${predicted}`); return predicted; }
  const r = await send(pub, wallet, `deploy ${what}`, { address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] });
  for (const log of r.logs) { try { const ev = decodeEventLog({ abi: abi.factory, data: log.data, topics: log.topics }); if (ev.eventName === 'ProxyDeployed') { console.log(`${what} at ${ev.args.proxyAddress}`); return ev.args.proxyAddress; } } catch {} }
  throw new Error(`no ProxyDeployed event for ${what}`);
}

// Register label.eth on the October ETHRegistrar with test USDC: mint, approve, commit, wait, register. Returns the owner.
export async function registerEth(pub, wallet, label, { log = console.log } = {}) {
  const account = wallet.account;
  const status = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getStatus', args: [labelhash(label)] });
  if (status === 2) {
    const owner = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] });
    if (owner.toLowerCase() === account.address.toLowerCase()) { log(`${label}.eth is already registered to this key`); return owner; }
    throw new Error(`${label}.eth is registered to ${owner}, not ${account.address}`);
  }
  if (!(await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'isAvailable', args: [label] }))) throw new Error(`${label}.eth is not available (status ${status}: reserved or in grace); pick another label`);
  const duration = 365n * 24n * 3600n;
  const [base, premium] = await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'getRegisterPrice', args: [label, duration, ENSV2.MockUSDC] });
  const price = base + premium, want = price + price / 10n;
  log(`${label}.eth costs ${Number(price) / 1e6} test USDC for a year`);
  const bal = await pub.readContract({ address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'balanceOf', args: [account.address] });
  if (bal < want) await send(pub, wallet, 'mint test USDC', { address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'mint', args: [account.address, want - bal] });
  const allowance = await pub.readContract({ address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'allowance', args: [account.address, ENSV2.ETHRegistrar] });
  if (allowance < want) await send(pub, wallet, 'approve registrar', { address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'approve', args: [ENSV2.ETHRegistrar, want] });
  const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'makeCommitment', args: [label, account.address, secret, ZERO, ZERO, duration, ZERO32] });
  await send(pub, wallet, `commit ${label}.eth`, { address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'commit', args: [commitment] });
  const wait = Number(await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'MIN_COMMITMENT_AGE' })) + 15;
  log(`waiting ${wait}s for the commitment to age…`);
  await new Promise((r) => setTimeout(r, wait * 1000));
  await send(pub, wallet, `register ${label}.eth`, { address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'register', args: [label, account.address, secret, ZERO, ZERO, duration, ENSV2.MockUSDC, ZERO32] });
  return readUntil(() => pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] }), (o) => o.toLowerCase() === account.address.toLowerCase());
}

// A resolver instance for one account: deploy through the factory with the account holding every role, or reuse.
export async function ensureResolver(pub, wallet, saltLabel = 'tocsin-resolver-v2') {
  const grants = [{ account: wallet.account.address, roleBitmap: RESOLVER_ADMIN_ROLES }];
  return deployProxy(pub, wallet, `resolver for ${wallet.account.address}`, ENSV2.PermissionedResolverImpl, saltLabel, encodeFunctionData({ abi: abi.resolver, functionName: 'initialize', args: [grants, []] }));
}

// Read a text or addr record the way every app does: through the Universal Resolver proxy. null when unset.
export async function urText(pub, name, key) { return pub.getEnsText({ name, key, universalResolverAddress: ENSV2.UniversalResolver }).catch(() => null); }
export async function urAddress(pub, name) { return pub.getEnsAddress({ name, universalResolverAddress: ENSV2.UniversalResolver }).catch(() => null); }
