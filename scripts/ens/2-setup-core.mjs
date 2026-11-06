// Sets up core.tocsin.eth on ENSv2 Sepolia the ENSv2 way:
//   1. deploy our own Permissioned Resolver proxy through the Verifiable Factory (one per account)
//   2. deploy a UserRegistry proxy for tocsin.eth (the name's own subregistry) and point tocsin.eth at it
//   3. register "core" in that subregistry, resolver set to our resolver
//   4. set addr records on both names so they resolve
// Run: node --env-file=scripts/.env scripts/ens/2-setup-core.mjs
// Idempotent: each step checks state first. Writes the addresses it used to scripts/ens/state.sepolia.json.
import { ENSV2, abi, clients, labelhash, namehash, send, keccak256, toHex, USER_REGISTRY_ROOT_ROLES, SUBNAME_OWNER_ROLES, RESOLVER_ADMIN_ROLES } from './common.mjs';
import { encodeFunctionData, decodeEventLog, encodeAbiParameters } from 'viem';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PARENT = 'tocsin', SUB = 'core';
const { account, pub, wallet } = clients();
const stateFile = new URL('./state.sepolia.json', import.meta.url);
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
console.log(`account ${account.address}`);

const owner = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [PARENT] });
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`${PARENT}.eth is owned by ${owner}, not this account. Run 1-register-tocsin.mjs first.`);

async function deployProxy(what, implementation, saltLabel, initData) {
  // salt is per deployer (the factory mixes in msg.sender), so a fixed label is stable across runs
  const salt = BigInt(keccak256(toHex(saltLabel)));
  const { result: predicted } = await pub.simulateContract({ account, address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] }).catch(() => ({ result: null }));
  if (predicted && (await pub.getCode({ address: predicted }))) { console.log(`${what} already deployed at ${predicted}`); return predicted; }
  const r = await send(pub, wallet, `deploy ${what}`, { address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [implementation, salt, initData] });
  for (const log of r.logs) {
    try { const ev = decodeEventLog({ abi: abi.factory, data: log.data, topics: log.topics }); if (ev.eventName === 'ProxyDeployed') { console.log(`${what} at ${ev.args.proxyAddress}`); return ev.args.proxyAddress; } } catch {}
  }
  throw new Error(`no ProxyDeployed event for ${what}`);
}

// 1. our resolver
if (!state.resolver) {
  state.resolver = await deployProxy('resolver', ENSV2.PermissionedResolverImpl, 'tocsin-resolver-v1',
    encodeFunctionData({ abi: abi.resolver, functionName: 'initialize', args: [account.address, RESOLVER_ADMIN_ROLES, []] }));
  save();
}

// 2. tocsin.eth's own subregistry
if (!state.userRegistry) {
  state.userRegistry = await deployProxy('tocsin.eth subregistry', ENSV2.UserRegistryImpl, 'tocsin-registry-v1',
    encodeFunctionData({ abi: abi.registry, functionName: 'initialize', args: [account.address, USER_REGISTRY_ROOT_ROLES] }));
  save();
}
const currentSub = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getSubregistry', args: [PARENT] });
if (currentSub.toLowerCase() !== state.userRegistry.toLowerCase()) {
  await send(pub, wallet, `point ${PARENT}.eth at its subregistry`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setSubregistry', args: [labelhash(PARENT), state.userRegistry] });
  await send(pub, wallet, 'record the parent pointer', { address: state.userRegistry, abi: abi.registry, functionName: 'setParent', args: [ENSV2.ETHRegistry, PARENT] });
}
const parentResolver = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getResolver', args: [PARENT] });
if (parentResolver.toLowerCase() !== state.resolver.toLowerCase()) {
  await send(pub, wallet, `set ${PARENT}.eth resolver`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setResolver', args: [labelhash(PARENT), state.resolver] });
}

// 3. core.tocsin.eth
const subStatus = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'getStatus', args: [labelhash(SUB)] });
if (subStatus !== 2) {
  const forever = 2n ** 64n - 1n; // the list name never expires; see the ENSv2 docs on infinite-duration claims
  await send(pub, wallet, `register ${SUB}.${PARENT}.eth`, { address: state.userRegistry, abi: abi.registry, functionName: 'register', args: [SUB, account.address, '0x0000000000000000000000000000000000000000', state.resolver, SUBNAME_OWNER_ROLES, forever] });
} else {
  const subResolver = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'getResolver', args: [SUB] });
  if (subResolver.toLowerCase() !== state.resolver.toLowerCase()) await send(pub, wallet, `set ${SUB}.${PARENT}.eth resolver`, { address: state.userRegistry, abi: abi.registry, functionName: 'setResolver', args: [labelhash(SUB), state.resolver] });
}

// 4. addr records so both names resolve to the maintainer
for (const name of [`${PARENT}.eth`, `${SUB}.${PARENT}.eth`]) {
  const node = namehash(name);
  const have = await pub.readContract({ address: state.resolver, abi: abi.resolver, functionName: 'addr', args: [node] }).catch(() => null);
  if (!have || have.toLowerCase() !== account.address.toLowerCase()) await send(pub, wallet, `set addr for ${name}`, { address: state.resolver, abi: abi.resolver, functionName: 'setAddr', args: [node, account.address] });
}
state.names = { parent: `${PARENT}.eth`, list: `${SUB}.${PARENT}.eth`, listNode: namehash(`${SUB}.${PARENT}.eth`) };
save();
console.log('done. state:', state);
console.log(`view: https://sepolia.app.ens.domains/${SUB}.${PARENT}.eth`);
