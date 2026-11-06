// Claim <label>.tocsin.eth by owning <label>.eth on ENSv2 Sepolia. Anyone runs this with their own key.
// Run: node --env-file=scripts/.env scripts/ens/3-claim.mjs <label>
// Deploys the claimer's own Permissioned Resolver through the Verifiable Factory if they do not have one yet,
// claims the name through the MirrorRegistrar, and sets an addr record. Needs the registrar address from state.sepolia.json.
import { ENSV2, abi, clients, namehash, send, keccak256, toHex, RESOLVER_ADMIN_ROLES, readUntil } from './common.mjs';
import { encodeFunctionData, decodeEventLog, parseAbi } from 'viem';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const label = process.argv[2];
if (!label || label.includes('.')) { console.error('usage: 3-claim.mjs <label>   (the label of a .eth name you own, without .eth)'); process.exit(1); }
const state = JSON.parse(readFileSync(new URL('./state.sepolia.json', import.meta.url), 'utf8'));
if (!state.registrar) throw new Error('no registrar in state.sepolia.json; run 2-setup-core.mjs first');
const registrarAbi = parseAbi([
  'function canClaim(string label, address account) view returns (bool)',
  'function claim(string label, address resolver) returns (uint256 tokenId)',
  'function sync(string label)',
  'event Claimed(string label, address indexed owner, uint64 expiry, uint256 tokenId)',
]);
const { account, pub, wallet } = clients();
console.log(`account ${account.address}`);

const ethOwner = await readUntil(() => pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] }), (o) => o.toLowerCase() === account.address.toLowerCase());
if (ethOwner.toLowerCase() !== account.address.toLowerCase()) throw new Error(`${label}.eth is owned by ${ethOwner}, not this account. Register it first at https://sepolia.app.ens.domains`);
const hubOwner = await pub.readContract({ address: state.userRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] });
if (hubOwner.toLowerCase() === account.address.toLowerCase()) { console.log(`${label}.tocsin.eth is already yours`); process.exit(0); }
if (!(await readUntil(() => pub.readContract({ address: state.registrar, abi: registrarAbi, functionName: 'canClaim', args: [label, account.address] }), (v) => v === true))) throw new Error(`${label}.tocsin.eth is not claimable (taken and unexpired, owned by ${hubOwner})`);

// the claimer's own resolver, one per account, deterministic salt so re-runs find it
const salt = BigInt(keccak256(toHex('tocsin-resolver-v1')));
const init = encodeFunctionData({ abi: abi.resolver, functionName: 'initialize', args: [account.address, RESOLVER_ADMIN_ROLES, []] });
let resolver;
try {
  const { result } = await pub.simulateContract({ account, address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [ENSV2.PermissionedResolverImpl, salt, init] });
  resolver = result;
  if (!(await pub.getCode({ address: resolver }))) {
    const r = await send(pub, wallet, 'deploy your resolver', { address: ENSV2.VerifiableFactory, abi: abi.factory, functionName: 'deployProxy', args: [ENSV2.PermissionedResolverImpl, salt, init] });
    for (const log of r.logs) { try { const ev = decodeEventLog({ abi: abi.factory, data: log.data, topics: log.topics }); if (ev.eventName === 'ProxyDeployed') resolver = ev.args.proxyAddress; } catch {} }
  }
} catch (e) {
  // simulate fails once the proxy exists (AlreadyInitialized); recompute nothing, ask the user
  throw new Error(`could not determine your resolver address: ${e.shortMessage || e.message}`);
}
console.log(`resolver ${resolver}`);

const r = await send(pub, wallet, `claim ${label}.tocsin.eth`, { address: state.registrar, abi: registrarAbi, functionName: 'claim', args: [label, resolver] });
for (const log of r.logs) { try { const ev = decodeEventLog({ abi: registrarAbi, data: log.data, topics: log.topics }); if (ev.eventName === 'Claimed') console.log(`claimed, expiry ${new Date(Number(ev.args.expiry) * 1000).toISOString().slice(0, 10)}, tokenId ${ev.args.tokenId}`); } catch {} }
await send(pub, wallet, `set addr for ${label}.tocsin.eth`, { address: resolver, abi: abi.resolver, functionName: 'setAddr', args: [namehash(`${label}.tocsin.eth`), account.address] });
const claimsFile = new URL('./claims.sepolia.json', import.meta.url);
const claims = existsSync(claimsFile) ? JSON.parse(readFileSync(claimsFile, 'utf8')) : {};
claims[label] = { owner: account.address, resolver, node: namehash(`${label}.tocsin.eth`), claimTx: r.transactionHash };
writeFileSync(claimsFile, JSON.stringify(claims, null, 2) + '\n');
console.log(`recorded in scripts/ens/claims.sepolia.json`);
console.log(`done: https://sepolia.app.ens.domains/${label}.tocsin.eth`);
console.log(`to publish a list under it, set text key tocsin.list on your resolver for node ${namehash(`${label}.tocsin.eth`)}`);
