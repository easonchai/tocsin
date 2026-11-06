// Builds, signs and publishes the core trust list per the ERC's Trust lists section:
//   TrustList { log, chainId, maintainer, version, entries[] } with one entry for the seed writer
//   listRoot = keccak256(abi.encode(trustList)); EIP-712 ListRoot(bytes32 root,uint64 version) in the log's domain
//   record value = hex of abi.encode(root, version, signature, listURI) under text key erc-threat-flag-log.list on core.tocsin.eth
// Run: node --env-file=scripts/.env scripts/seed/publish-list.mjs [--version N]
// Writes docs/plan/demo/seed/core.list.json (the document readers fetch) and sets the ENSv2 resolver record.
import { encodeAbiParameters, keccak256, parseAbi, namehash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { clients, send, abi as ensAbi } from '../ens/common.mjs';

const dir = new URL('../../docs/plan/demo/seed/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const env = (n, d) => { const v = process.env[n]; return v && v !== '0x' ? v : d; };
const LOG = env('LOG_ADDRESS'); if (!LOG) throw new Error('set LOG_ADDRESS in scripts/.env');
const stateFile = new URL('../ens/state.sepolia.json', import.meta.url);
if (!existsSync(stateFile)) throw new Error('run scripts/ens/2-setup-core.mjs first');
const ens = JSON.parse(readFileSync(stateFile, 'utf8'));

const { account: maintainer, pub, wallet } = clients('PRIVATE_KEY');
const writer = privateKeyToAccount(env('WRITER_PRIVATE_KEY') || env('PRIVATE_KEY')).address;
const vArg = process.argv.indexOf('--version');
const prev = existsSync(new URL('core.list.json', dir)) ? read('core.list.json') : null;
const version = vArg > 0 ? BigInt(process.argv[vArg + 1]) : BigInt((prev?.trustList?.version ?? 0) + 1);

// categories bitmap: bit i for category i, 1..8. Category 8 stays in; the ERC says readers warn, not block, on it.
const categories = [1, 2, 3, 4, 5, 6, 7, 8].reduce((acc, c) => acc | (1n << BigInt(c)), 0n);
const entry = {
  writer, weight: 255, // one writer, so weight 255 lets a reader that marks this list "blocking" block on it alone (reader policy 2)
  operator: namehash('tocsin.eth'), upstream: '0x' + '00'.repeat(32),
  fromBlock: 0n, toBlock: 0n, headPin: '0x' + '00'.repeat(32), categories, snapshotURI: env('SNAPSHOT_URI', ''),
};
const trustList = { log: LOG, chainId: 11155111n, maintainer: maintainer.address, version, entries: [entry] };

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
const listURI = env('LIST_URI', '');
const record = encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint64' }, { type: 'bytes' }, { type: 'string' }], [root, version, signature, listURI]);

const json = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)));
const doc = { trustList: json(trustList), labels: { [namehash('tocsin.eth')]: 'tocsin.eth' }, root, version: version.toString(), signature, listURI, record, publishedAt: new Date().toISOString() };
writeFileSync(new URL('core.list.json', dir), JSON.stringify(doc, null, 2) + '\n');
console.log(`list root ${root}, version ${version}, maintainer ${maintainer.address}, writer ${writer}`);

const node = ens.names?.listNode || namehash('core.tocsin.eth');
const key = 'erc-threat-flag-log.list';
const current = await pub.readContract({ address: ens.resolver, abi: ensAbi.resolver, functionName: 'text', args: [node, key] }).catch(() => '');
if (current === record) console.log('record already published');
else await send(pub, wallet, `set ${key} on core.tocsin.eth`, { address: ens.resolver, abi: ensAbi.resolver, functionName: 'setText', args: [node, key, record] });
console.log('commit docs/plan/demo/seed/core.list.json so LIST_URI serves it');
