// Sets up the tocsin.eth hub on ENSv2 Sepolia and emancipates it:
//   1. deploy our Permissioned Resolver proxy through the Verifiable Factory (one per account)
//   2. deploy a UserRegistry proxy as tocsin.eth's own subregistry; point tocsin.eth at it; record the parent pointer
//   3. deploy the MirrorRegistrar and grant it ROLE_REGISTRAR | ROLE_RENEW on the subregistry root
//   4. register core.tocsin.eth (the one name that skips the mirror rule), expiry synced to tocsin.eth
//   5. set addr records on tocsin.eth and core.tocsin.eth
//   6. emancipate: revoke every root role the owner holds, so only the registrar can mint and nobody can revoke
// Run: node --env-file=scripts/.env scripts/ens/2-setup-core.mjs [--keep-roles]
// Idempotent: each step checks state first. Writes the addresses it used to scripts/ens/state.sepolia.json.
// Spec: docs/plan/demo/issues/15-mirror-registrar.md
import { ENSV2, REG, abi, clients, labelhash, namehash, send, keccak256, toHex, withAdmin, USER_REGISTRY_ROOT_ROLES, SUBNAME_OWNER_ROLES, RESOLVER_ADMIN_ROLES } from './common.mjs';
import { encodeFunctionData, decodeEventLog } from 'viem';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PARENT = 'tocsin', SUB = 'core';
const keepRoles = process.argv.includes('--keep-roles');
const { account, pub, wallet } = clients();
const stateFile = new URL('./state.sepolia.json', import.meta.url);
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
const artifact = JSON.parse(readFileSync(new URL('./MirrorRegistrar.json', import.meta.url), 'utf8'));
console.log(`account ${account.address}`);

const owner = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [PARENT] });
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`${PARENT}.eth is owned by ${owner}, not this account. Run 1-register-tocsin.mjs first.`);
const parentExpiry = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findExpiry', args: [PARENT] });

async function deployProxy(what, implementation, saltLabel, initData) {
  // the factory mixes msg.sender into the salt, so a fixed label gives a stable address per deployer
  const salt = BigInt(keccak256(toHex(saltLabel)));
  let predicted = null;
  try { predicted = (await pub.simulateContract({ account, address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] })).result; } catch {}
  if (predicted && (await pub.getCode({ address: predicted }))) { console.log(`${what} already deployed at ${predicted}`); return predicted; }
  const r = await send(pub, wallet, `deploy ${what}`, { address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] });
  for (const log of r.logs) { try { const ev = decodeEventLog({ abi: abi.factory, data: log.data, topics: log.topics }); if (ev.eventName === 'ProxyDeployed') { console.log(`${what} at ${ev.args.proxyAddress}`); return ev.args.proxyAddress; } } catch {} }
  throw new Error(`no ProxyDeployed event for ${what}`);
}

// 1. our resolver
if (!state.resolver) { state.resolver = await deployProxy('resolver', ENSV2.PermissionedResolverImpl, 'tocsin-resolver-v1', encodeFunctionData({ abi: abi.resolver, functionName: 'initialize', args: [account.address, RESOLVER_ADMIN_ROLES, []] })); save(); }

// 2. tocsin.eth's own subregistry
if (!state.userRegistry) { state.userRegistry = await deployProxy(`${PARENT}.eth subregistry`, ENSV2.UserRegistryImpl, 'tocsin-registry-v1', encodeFunctionData({ abi: abi.registry, functionName: 'initialize', args: [account.address, USER_REGISTRY_ROOT_ROLES] })); save(); }
const currentSub = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getSubregistry', args: [PARENT] });
if (currentSub.toLowerCase() !== state.userRegistry.toLowerCase()) {
  await send(pub, wallet, `point ${PARENT}.eth at its subregistry`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setSubregistry', args: [labelhash(PARENT), state.userRegistry] });
}
const [parentReg] = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'getParent' }).catch(() => ['0x0000000000000000000000000000000000000000']);
if (parentReg.toLowerCase() !== ENSV2.ETHRegistry.toLowerCase() && await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'hasRootRoles', args: [REG.ROLE_SET_PARENT, account.address] })) {
  await send(pub, wallet, 'record the parent pointer', { address: state.userRegistry, abi: abi.registry, functionName: 'setParent', args: [ENSV2.ETHRegistry, PARENT] });
}
const parentResolver = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getResolver', args: [PARENT] });
if (parentResolver.toLowerCase() !== state.resolver.toLowerCase()) await send(pub, wallet, `set ${PARENT}.eth resolver`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setResolver', args: [labelhash(PARENT), state.resolver] });

// 3. the mirror registrar
if (!state.registrar) {
  const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [ENSV2.ETHRegistry, state.userRegistry] });
  process.stdout.write(`deploy MirrorRegistrar: ${hash} … `);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success' || !r.contractAddress) throw new Error('registrar deploy failed');
  console.log(`ok at ${r.contractAddress}`); state.registrar = r.contractAddress; save();
}
const registrarRoles = REG.ROLE_REGISTRAR | REG.ROLE_RENEW;
if (!(await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'hasRootRoles', args: [registrarRoles, state.registrar] }))) {
  await send(pub, wallet, 'grant registrar + renew to the MirrorRegistrar', { address: state.userRegistry, abi: abi.registry, functionName: 'grantRootRoles', args: [registrarRoles, state.registrar] });
}

// 4. core.tocsin.eth, before emancipation, expiry mirrored from tocsin.eth
const subStatus = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'getStatus', args: [labelhash(SUB)] });
if (subStatus !== 2) {
  await send(pub, wallet, `register ${SUB}.${PARENT}.eth`, { address: state.userRegistry, abi: abi.registry, functionName: 'register', args: [SUB, account.address, '0x0000000000000000000000000000000000000000', state.resolver, SUBNAME_OWNER_ROLES, parentExpiry] });
} else {
  const subResolver = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'getResolver', args: [SUB] });
  if (subResolver.toLowerCase() !== state.resolver.toLowerCase()) await send(pub, wallet, `set ${SUB}.${PARENT}.eth resolver`, { address: state.userRegistry, abi: abi.registry, functionName: 'setResolver', args: [labelhash(SUB), state.resolver] });
}

// 5. addr records
for (const name of [`${PARENT}.eth`, `${SUB}.${PARENT}.eth`]) {
  const node = namehash(name);
  const have = await pub.readContract({ address: state.resolver, abi: abi.resolver, functionName: 'addr', args: [node] }).catch(() => null);
  if (!have || have.toLowerCase() !== account.address.toLowerCase()) await send(pub, wallet, `set addr for ${name}`, { address: state.resolver, abi: abi.resolver, functionName: 'setAddr', args: [node, account.address] });
}

// 6. emancipate. Irreversible: after this no account holds a dangerous root role, and the owner cannot mint directly.
const dangerous = withAdmin(REG.ROLE_SET_RESOLVER, REG.ROLE_SET_SUBREGISTRY, REG.ROLE_UNREGISTER, REG.ROLE_UPGRADE) | REG.ROLE_CAN_TRANSFER_ADMIN;
if (keepRoles) console.log('--keep-roles: skipping emancipation');
else {
  const held = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'roles', args: [0n, account.address] });
  if (held !== 0n) await send(pub, wallet, 'emancipate: revoke every root role from the owner', { address: state.userRegistry, abi: abi.registry, functionName: 'revokeRootRoles', args: [held, account.address] });
}
const stillDangerous = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'hasAssignees', args: [0n, dangerous] });
const registrarOk = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'hasRootRoles', args: [registrarRoles, state.registrar] });
state.names = { parent: `${PARENT}.eth`, list: `${SUB}.${PARENT}.eth`, listNode: namehash(`${SUB}.${PARENT}.eth`) };
state.emancipated = !stillDangerous;
save();
console.log(`emancipated: ${!stillDangerous}   registrar holds registrar+renew: ${registrarOk}`);
console.log('state:', state);
console.log(`view: https://sepolia.app.ens.domains/${SUB}.${PARENT}.eth`);
