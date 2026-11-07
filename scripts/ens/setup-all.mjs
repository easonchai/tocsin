// One script for the whole ENSv2 hub on Sepolia, on the contract set the Universal Resolver reads.
//
//   TOCSIN key      owns tocsin.eth, the subregistry, the maintainer resolver, core.tocsin.eth, and signs the core list
//   CORE_WRITER key the key whose 92 leaves are already in the log (defaults to the TOCSIN key). Without the key,
//                   CORE_WRITER=<address> names it, which is all the list needs.
//   BLOCKAID, SCAMSNIFFER keys: each registers <label>.eth if needed, deploys its own resolver, claims
//                   <label>.tocsin.eth through the MirrorRegistrar.
//   detector.tocsin.eth already exists in the hub (the live detector agent); its addr record names the writer,
//                   and the maintainer publishes that writer's list on the name. DETECTOR key is only for detector.mjs.
//
// Run: node --env-file=scripts/.env scripts/ens/setup-all.mjs [--keep-roles] [--skip-claims] [--skip-lists]
// Every step checks chain state first, so re-running is safe. State lands in scripts/ens/state.sepolia.json and
// scripts/ens/claims.sepolia.json; list documents in scripts/seed/data/<name>.list.json.
import { ENSV2, REG, abi, env, clientsFor, send, deployProxy, registerEth, ensureResolver, labelhash, namehash, dns, encodeFunctionData, decodeEventLog, readUntil, urText, urAddress, ZERO, ZERO32, USER_REGISTRY_ROOT_ROLES, SUBNAME_OWNER_ROLES, DANGEROUS_ROOT_ROLES } from './common.mjs';
import { encodeAbiParameters, decodeAbiParameters, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const flag = (f) => process.argv.includes(f);
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const seedDir = new URL('../seed/data/', import.meta.url);
const stateFile = here('./state.sepolia.json'), claimsFile = here('./claims.sepolia.json');
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const claims = existsSync(claimsFile) ? JSON.parse(readFileSync(claimsFile, 'utf8')) : {};
if (state.set !== 'ensv2-sepolia-2026-10-01') { for (const k of Object.keys(state)) delete state[k]; for (const k of Object.keys(claims)) delete claims[k]; state.set = 'ensv2-sepolia-2026-10-01'; }
const save = () => { writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n'); writeFileSync(claimsFile, JSON.stringify(claims, null, 2) + '\n'); };
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
const LOG = env('LOG_ADDRESS', '');
const KEY = 'tocsin.list';
const PARENT = 'tocsin';

const tocsin = clientsFor(env('TOCSIN_PRIVATE_KEY'));
const { pub } = tocsin;
const coreWriter = env('CORE_WRITER', '') || privateKeyToAccount(env('CORE_WRITER_PRIVATE_KEY', env('TOCSIN_PRIVATE_KEY'))).address;
const claimants = ['blockaid', 'scamsniffer'].filter((l) => process.env[`${l.toUpperCase()}_PRIVATE_KEY`]?.trim().length === 66).map((l) => ({ label: l, ...clientsFor(env(`${l.toUpperCase()}_PRIVATE_KEY`)) }));
console.log(`maintainer ${tocsin.account.address}; core writer ${coreWriter}; claimants ${claimants.map((c) => `${c.label}=${c.account.address}`).join(', ') || 'none'}`);

// ---- 1. tocsin.eth on the live registry
const owner = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [PARENT] });
if (owner === ZERO) await registerEth(pub, tocsin.wallet, PARENT);
else if (!same(owner, tocsin.account.address)) throw new Error(`${PARENT}.eth is owned by ${owner}; TOCSIN_PRIVATE_KEY must be that key`);
else console.log(`${PARENT}.eth is owned by the maintainer key`);
const parentExpiry = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findExpiry', args: [PARENT] });

// ---- 2. the maintainer's resolver: reuse the one on the name if the key controls it, else deploy ours
let resolver = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getResolver', args: [PARENT] });
const controlsResolver = resolver !== ZERO && (await pub.readContract({ address: resolver, abi: abi.resolver, functionName: 'hasRootRoles', args: [1n << 4n, tocsin.account.address] }).catch(() => false));
if (!controlsResolver) {
  resolver = await ensureResolver(pub, tocsin.wallet);
  await send(pub, tocsin.wallet, `set ${PARENT}.eth resolver`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setResolver', args: [labelhash(PARENT), resolver] });
} else console.log(`resolver ${resolver} already controlled by the maintainer key`);
state.resolver = resolver;

// ---- 3. the subregistry: reuse if the key holds the root roles we need, else deploy and point tocsin.eth at it
let hub = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getSubregistry', args: [PARENT] });
const needed = REG.ROLE_REGISTRAR | REG.ROLE_RENEW | (REG.ROLE_REGISTRAR << 128n) | (REG.ROLE_RENEW << 128n);
const emancipatedAlready = hub !== ZERO && (await pub.readContract({ address: hub, abi: abi.registry, functionName: 'isEmancipated' }).catch(() => false));
const controlsHub = hub !== ZERO && (await pub.readContract({ address: hub, abi: abi.registry, functionName: 'hasRootRoles', args: [needed, tocsin.account.address] }).catch(() => false));
if (!controlsHub && !emancipatedAlready) {
  hub = await deployProxy(pub, tocsin.wallet, `${PARENT}.eth subregistry`, ENSV2.UserRegistryImpl, 'tocsin-registry-v2', encodeFunctionData({ abi: abi.registry, functionName: 'initialize', args: [[{ account: tocsin.account.address, roleBitmap: USER_REGISTRY_ROOT_ROLES }]] }));
  await send(pub, tocsin.wallet, `point ${PARENT}.eth at the subregistry`, { address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'setSubregistry', args: [labelhash(PARENT), hub] });
} else console.log(`subregistry ${hub} ${emancipatedAlready ? 'is already emancipated' : 'already controlled by the maintainer key'}`);
const [parentReg] = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'getParent' }).catch(() => [ZERO]);
if (!same(parentReg, ENSV2.ETHRegistry) && (await pub.readContract({ address: hub, abi: abi.registry, functionName: 'hasRootRoles', args: [REG.ROLE_SET_PARENT, tocsin.account.address] }))) {
  await send(pub, tocsin.wallet, 'record the parent pointer', { address: hub, abi: abi.registry, functionName: 'setParent', args: [ENSV2.ETHRegistry, PARENT] });
}
state.userRegistry = hub;

// ---- 4. the MirrorRegistrar, bound to this registry pair
const artifact = JSON.parse(readFileSync(here('./MirrorRegistrar.json'), 'utf8'));
let registrar = state.registrar;
const registrarOk = registrar && (await pub.getCode({ address: registrar })) && same(await pub.readContract({ address: registrar, abi: abi.mirror, functionName: 'HUB' }).catch(() => ''), hub);
if (!registrarOk) {
  const hash = await tocsin.wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args: [ENSV2.ETHRegistry, hub] });
  process.stdout.write(`deploy MirrorRegistrar: ${hash} … `);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success' || !r.contractAddress) throw new Error('registrar deploy failed');
  registrar = r.contractAddress; console.log(`ok at ${registrar}`);
} else console.log(`MirrorRegistrar ${registrar} already bound to this subregistry`);
state.registrar = registrar; save();
if (!(await pub.readContract({ address: hub, abi: abi.registry, functionName: 'hasRootRoles', args: [REG.ROLE_REGISTRAR | REG.ROLE_RENEW, registrar] }))) {
  if (emancipatedAlready) throw new Error('subregistry is emancipated and the registrar has no roles on it; nothing can fix that, deploy a fresh subregistry');
  await send(pub, tocsin.wallet, 'grant registrar + renew to the MirrorRegistrar', { address: hub, abi: abi.registry, functionName: 'grantRootRoles', args: [REG.ROLE_REGISTRAR | REG.ROLE_RENEW, registrar] });
}

// ---- 5. core.tocsin.eth and the addr records
const coreOwner = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'findOwner', args: ['core'] });
if (coreOwner === ZERO) await send(pub, tocsin.wallet, 'register core.tocsin.eth', { address: hub, abi: abi.registry, functionName: 'register', args: ['core', tocsin.account.address, ZERO, resolver, SUBNAME_OWNER_ROLES, parentExpiry] });
else if (!same(coreOwner, tocsin.account.address)) throw new Error(`core.tocsin.eth is owned by ${coreOwner}`);
async function ensureAddr(wallet, res, name, address) {
  const have = await urAddress(pub, name);
  if (same(have, address)) return;
  await send(pub, wallet, `set addr for ${name}`, { address: res, abi: abi.resolver, functionName: 'setAddress', args: [dns(name), 60n, address] });
}
await ensureAddr(tocsin.wallet, resolver, `${PARENT}.eth`, tocsin.account.address);
await ensureAddr(tocsin.wallet, resolver, `core.${PARENT}.eth`, tocsin.account.address);
state.names = { parent: `${PARENT}.eth`, list: `core.${PARENT}.eth`, listNode: namehash(`core.${PARENT}.eth`) };
save();

// ---- 6. claimants: register label.eth, own resolver, claim label.tocsin.eth, addr record
if (!flag('--skip-claims')) for (const c of claimants) {
  console.log(`== ${c.label}`);
  await registerEth(pub, c.wallet, c.label);
  // the factory reverts on a reused salt, so a resolver deployed by an earlier run is taken from the claims file
  const known = claims[c.label]?.resolver;
  const res = known && (await pub.getCode({ address: known })) ? known : await ensureResolver(pub, c.wallet);
  const have = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'findOwner', args: [c.label] });
  if (!same(have, c.account.address)) {
    const can = await readUntil(() => pub.readContract({ address: registrar, abi: abi.mirror, functionName: 'canClaim', args: [c.label, c.account.address] }), (v) => v === true);
    if (!can) throw new Error(`${c.label}.tocsin.eth not claimable for ${c.account.address} (owned by ${have})`);
    await send(pub, c.wallet, `claim ${c.label}.tocsin.eth`, { address: registrar, abi: abi.mirror, functionName: 'claim', args: [c.label, res] });
  } else console.log(`${c.label}.tocsin.eth already owned by its key`);
  await ensureAddr(c.wallet, res, `${c.label}.${PARENT}.eth`, c.account.address);
  claims[c.label] = { owner: c.account.address, resolver: res, node: namehash(`${c.label}.${PARENT}.eth`) };
  save();
}

// ---- 7. the detector: detector.tocsin.eth predates this script; whatever it resolves to is the detector's writer key
const detectorName = `detector.${PARENT}.eth`;
const detectorWriter = await urAddress(pub, detectorName);
const detectorResolver = detectorWriter ? await pub.readContract({ address: hub, abi: abi.registry, functionName: 'getResolver', args: ['detector'] }) : ZERO;
if (detectorWriter) console.log(`${detectorName} resolves to writer ${detectorWriter} (resolver ${detectorResolver})`);
else console.log(`${detectorName} has no addr record: lists go out without a detector writer`);

const listType = { type: 'tuple', components: [
  { name: 'log', type: 'address' }, { name: 'chainId', type: 'uint64' }, { name: 'maintainer', type: 'address' }, { name: 'version', type: 'uint64' },
  { name: 'entries', type: 'tuple[]', components: [
    { name: 'writer', type: 'address' }, { name: 'weight', type: 'uint8' }, { name: 'operator', type: 'bytes32' }, { name: 'upstream', type: 'bytes32' },
    { name: 'fromBlock', type: 'uint64' }, { name: 'toBlock', type: 'uint64' }, { name: 'headPin', type: 'bytes32' }, { name: 'categories', type: 'uint256' }, { name: 'snapshotURI', type: 'string' } ] } ] };
const recordType = [{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes' }, { type: 'string' }];
const categories = [1, 2, 3, 4, 5, 6, 7, 8].reduce((acc, c) => acc | (1n << BigInt(c)), 0n);
async function publishList({ name, maintainer, resolverAddress, writers, warn = [], operator = `${PARENT}.eth` }) {
  const current = await urText(pub, name, KEY);
  const decoded = (() => { try { return current ? decodeAbiParameters(recordType, current) : null; } catch { return null; } })();
  const file = new URL(`${name.split('.')[0]}.list.json`, seedDir);
  const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const highest = [decoded ? decoded[1] : 0n, BigInt(Number(prev?.trustList?.version ?? 0))].reduce((a, b) => (a > b ? a : b));
  const build = (version) => ({ log: LOG, chainId: 11155111n, maintainer: maintainer.account.address, version, entries: writers.map((w) => ({ writer: w, weight: warn.some((x) => same(x, w)) ? 1 : 255, operator: namehash(operator), upstream: ZERO32, fromBlock: 0n, toBlock: 0n, headPin: ZERO32, categories, snapshotURI: '' })) });
  const listURI = `https://raw.githubusercontent.com/easonchai/tocsin/main/scripts/seed/data/${name.split('.')[0]}.list.json`;
  // same content and same URI as the live record: nothing to do
  if (decoded && prev && prev.trustList && decoded[3] === listURI && keccak256(encodeAbiParameters([listType], [build(decoded[1])])) === decoded[0]) { console.log(`${name}: list record already current (version ${decoded[1]})`); return; }
  const version = highest + 1n, trustList = build(version);
  const root = keccak256(encodeAbiParameters([listType], [trustList]));
  const signature = await maintainer.wallet.signTypedData({ domain: { name: 'ThreatFlagLog', version: '1', chainId: 11155111, verifyingContract: LOG }, types: { ListRoot: [{ name: 'root', type: 'bytes32' }, { name: 'version', type: 'uint64' }] }, primaryType: 'ListRoot', message: { root, version } });
  const record = encodeAbiParameters(recordType, [root, version, signature, listURI]);
  const json = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
  writeFileSync(file, JSON.stringify({ name, trustList: json(trustList), labels: { [namehash(operator)]: operator }, root, version: version.toString(), signature, listURI, record, publishedAt: new Date().toISOString() }, null, 2) + '\n');
  await send(pub, maintainer.wallet, `set ${KEY} on ${name} (version ${version})`, { address: resolverAddress, abi: abi.resolver, functionName: 'setText', args: [dns(name), KEY, record] });
}
if (!flag('--skip-lists') && LOG) {
  if (detectorWriter) await publishList({ name: detectorName, maintainer: tocsin, resolverAddress: detectorResolver, writers: [detectorWriter] });
  await publishList({ name: `core.${PARENT}.eth`, maintainer: tocsin, resolverAddress: resolver, writers: detectorWriter ? [coreWriter, detectorWriter] : [coreWriter], warn: detectorWriter ? [detectorWriter] : [] });
  // Each claimant signs its own list naming its own key; scamsniffer's writer warns only. The operator is the claimed .eth name.
  for (const c of claimants) {
    const res = claims[c.label]?.resolver;
    if (!res) { console.log(`${c.label}.${PARENT}.eth has no resolver in claims.sepolia.json: list skipped`); continue; }
    await publishList({ name: `${c.label}.${PARENT}.eth`, maintainer: c, resolverAddress: res, writers: [c.account.address], warn: c.label === 'scamsniffer' ? [c.account.address] : [], operator: `${c.label}.eth` });
  }
} else if (!LOG) console.log('LOG_ADDRESS not set: lists skipped');

// ---- 8. emancipate the subregistry
if (!flag('--keep-roles')) {
  const held = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'roles', args: [0n, tocsin.account.address] });
  if (held !== 0n) await send(pub, tocsin.wallet, 'emancipate: revoke every root role from the maintainer', { address: hub, abi: abi.registry, functionName: 'revokeRootRoles', args: [held, tocsin.account.address] });
}
state.emancipated = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'isEmancipated' });
state.dangerousRootRoleHeld = await pub.readContract({ address: hub, abi: abi.registry, functionName: 'hasAssignees', args: [0n, DANGEROUS_ROOT_ROLES] });
save();

// ---- 9. what the world sees, through the Universal Resolver
console.log('\n== resolution through the Universal Resolver proxy');
for (const name of [`${PARENT}.eth`, `core.${PARENT}.eth`, detectorName, ...claimants.map((c) => `${c.label}.${PARENT}.eth`)]) {
  const [a, t] = await Promise.all([urAddress(pub, name), urText(pub, name, KEY)]);
  console.log(`  ${name.padEnd(24)} addr ${a || 'none'}   ${KEY} ${t ? 'set (' + t.length + ' hex chars)' : 'none'}`);
}
console.log(`  subregistry ${hub} emancipated: ${state.emancipated}   dangerous root role held: ${state.dangerousRootRoleHeld}`);
console.log('state written to scripts/ens/state.sepolia.json and claims.sepolia.json; commit them with scripts/seed/data');
