// Builds, signs and publishes a trust list per the ERC's Trust lists section, under any name we control:
//   TrustList { log, chainId, maintainer, version, entries[] }
//   listRoot = keccak256(abi.encode(trustList)); EIP-712 ListRoot(bytes32 root,uint64 version) in the log's domain
//   record value = hex of abi.encode(root, version, signature, listURI) under text key tocsin.list on <name>.tocsin.eth
// Run: node --env-file=scripts/.env scripts/seed/publish-list.mjs [--name core] [--key-env PRIVATE_KEY]
//        [--writers core,detector,0x…] [--warn detector,0x…] [--version N]
//   --name     which subname publishes: core (default, from state.sepolia.json) or any label in claims.sepolia.json
//   --key-env  env var holding the maintainer key for that name (default PRIVATE_KEY; use DETECTOR_PRIVATE_KEY for detector)
//   --writers  writer keys to list, as labels (core = maintainer key, other labels = the claim's owner) or addresses.
//              Default: the name's own key, a self-list.
//   --warn     writers listed at weight 1 (warn only) instead of 255
// Writes docs/plan/demo/seed/<name>.list.json and sets the resolver record. LIST_URI_<NAME> overrides the document URL.
import { encodeAbiParameters, decodeAbiParameters, keccak256, namehash, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { send, abi as ensAbi } from '../ens/common.mjs';

const KEY = 'tocsin.list';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const env = (n, d) => { const v = process.env[n]; return v && v !== '0x' ? v : d; };
const dir = new URL('../../docs/plan/demo/seed/', import.meta.url);
const read = (f) => (existsSync(new URL(f, dir)) ? JSON.parse(readFileSync(new URL(f, dir), 'utf8')) : null);
const LOG = env('LOG_ADDRESS'); if (!LOG) throw new Error('set LOG_ADDRESS in scripts/.env');
const name = arg('--name', 'core');
const state = JSON.parse(readFileSync(new URL('../ens/state.sepolia.json', import.meta.url), 'utf8'));
const claimsFile = new URL('../ens/claims.sepolia.json', import.meta.url);
const claims = existsSync(claimsFile) ? JSON.parse(readFileSync(claimsFile, 'utf8')) : {};

// where this name's records live
const target = name === 'core' ? { resolver: state.resolver, node: state.names.listNode } : claims[name] && { resolver: claims[name].resolver, node: claims[name].node };
if (!target) throw new Error(`no resolver known for ${name}.tocsin.eth; claim it with 3-claim.mjs first (it records claims.sepolia.json)`);

const maintainer = privateKeyToAccount(env(arg('--key-env', 'PRIVATE_KEY')));
const transport = http(env('SEPOLIA_RPC'));
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ account: maintainer, chain: sepolia, transport });

// writers: labels resolve to keys we know; addresses pass through
const resolveWriter = (w) => {
  if (/^0x[0-9a-fA-F]{40}$/.test(w)) return w;
  if (w === 'core') return privateKeyToAccount(env('WRITER_PRIVATE_KEY') || env('PRIVATE_KEY')).address;
  if (claims[w]) return claims[w].owner;
  throw new Error(`unknown writer "${w}": use an address or a claimed label`);
};
const writers = (arg('--writers') ? arg('--writers').split(',') : [name]).map((w) => w.trim()).filter(Boolean).map(resolveWriter);
const warn = new Set((arg('--warn', '') ? arg('--warn').split(',') : []).map((w) => resolveWriter(w.trim()).toLowerCase()));
const prev = read(`${name}.list.json`);
// version: one above whatever is higher, the last document we wrote or the record already on the name
const decodeVersion = (rec) => { try { return rec && rec !== '0x' ? decodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes' }, { type: 'string' }], rec)[1] : 0n; } catch { return 0n; } };
const onchain = await pub.readContract({ address: target.resolver, abi: ensAbi.resolver, functionName: 'text', args: [target.node, KEY] }).catch(() => '');
const highest = [BigInt(Number(prev?.trustList?.version ?? 0)), decodeVersion(onchain)].reduce((a, b) => (a > b ? a : b));
const version = arg('--version') ? BigInt(arg('--version')) : highest + 1n;

// categories bitmap: bit i for category i, 1..8. Category 8 stays in; the ERC says readers warn, not block, on it.
const categories = [1, 2, 3, 4, 5, 6, 7, 8].reduce((acc, c) => acc | (1n << BigInt(c)), 0n);
// operator: the organisation behind the writer. Everything we run is one organisation, tocsin.eth, so two of our writers
// never count as independent for a reader. A real second org declares its own name here.
const entries = writers.map((writer) => ({
  writer, weight: warn.has(writer.toLowerCase()) ? 1 : 255,
  operator: namehash('tocsin.eth'), upstream: '0x' + '00'.repeat(32),
  fromBlock: 0n, toBlock: 0n, headPin: '0x' + '00'.repeat(32), categories,
  snapshotURI: env(`SNAPSHOT_URI_${name.toUpperCase()}`, name === 'core' ? env('SNAPSHOT_URI', '') : ''),
}));
const trustList = { log: LOG, chainId: 11155111n, maintainer: maintainer.address, version, entries };

const listType = { type: 'tuple', components: [
  { name: 'log', type: 'address' }, { name: 'chainId', type: 'uint64' }, { name: 'maintainer', type: 'address' }, { name: 'version', type: 'uint64' },
  { name: 'entries', type: 'tuple[]', components: [
    { name: 'writer', type: 'address' }, { name: 'weight', type: 'uint8' }, { name: 'operator', type: 'bytes32' }, { name: 'upstream', type: 'bytes32' },
    { name: 'fromBlock', type: 'uint64' }, { name: 'toBlock', type: 'uint64' }, { name: 'headPin', type: 'bytes32' }, { name: 'categories', type: 'uint256' }, { name: 'snapshotURI', type: 'string' } ] } ] };
const root = keccak256(encodeAbiParameters([listType], [trustList]));
const signature = await wallet.signTypedData({
  domain: { name: 'ThreatFlagLog', version: '1', chainId: 11155111, verifyingContract: LOG },
  types: { ListRoot: [{ name: 'root', type: 'bytes32' }, { name: 'version', type: 'uint64' }] },
  primaryType: 'ListRoot', message: { root, version },
});
const listURI = env(`LIST_URI_${name.toUpperCase()}`, name === 'core' ? env('LIST_URI', '') : `https://raw.githubusercontent.com/easonchai/tocsin/main/docs/plan/demo/seed/${name}.list.json`);
const record = encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes' }, { type: 'string' }], [root, version, signature, listURI]);

const json = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
const doc = { name: `${name}.tocsin.eth`, trustList: json(trustList), labels: { [namehash('tocsin.eth')]: 'tocsin.eth' }, root, version: version.toString(), signature, listURI, record, publishedAt: new Date().toISOString() };
writeFileSync(new URL(`${name}.list.json`, dir), JSON.stringify(doc, null, 2) + '\n');
console.log(`${name}.tocsin.eth list: root ${root}, version ${version}, maintainer ${maintainer.address}`);
for (const e of entries) console.log(`  writer ${e.writer} weight ${e.weight}`);

if (onchain === record) console.log('record already published');
else await send(pub, wallet, `set ${KEY} on ${name}.tocsin.eth`, { address: target.resolver, abi: ensAbi.resolver, functionName: 'setText', args: [target.node, KEY, record] });
console.log(`commit docs/plan/demo/seed/${name}.list.json so the list URI serves it`);
