// Appends the core seed list to the ThreatFlagLog on Sepolia as FLAG leaves under the writer key's namespace.
// Run: node --env-file=scripts/.env scripts/seed/seed-core.mjs [--dry]
// Reads docs/plan/demo/seed/core.json, resolves each evidence tx's block number on its own chain (cached in core.seed.json),
// then calls append(Leaf[]) in batches of 100. Receipts go to core.receipts.json. Re-runs skip entries already recorded there.
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const dry = process.argv.includes('--dry');
const dir = new URL('../../docs/plan/demo/seed/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const write = (f, v) => writeFileSync(new URL(f, dir), JSON.stringify(v, null, 1) + '\n');

const CATEGORY = { POISONING_OPERATOR: 1, POISONING_FUNDER: 2, DRAINER_RECEIVER: 3, MALICIOUS_DELEGATE: 4, MALICIOUS_TOKEN: 5, PAID_LOOKALIKE: 6, DRAINER_SPENDER: 7, THEFT_PROCEEDS: 8 };
const logAbi = parseAbi([
  'struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }',
  'function append(Leaf[] leaves)',
  'function writerSeq(address writer) view returns (uint64)',
  'function writerHead(address writer) view returns (bytes32)',
]);

const env = (n, d) => { const v = process.env[n]; return v && v !== '0x' ? v : d; };
const key = env('WRITER_PRIVATE_KEY') || env('PRIVATE_KEY');
if (!key) throw new Error('set PRIVATE_KEY (or WRITER_PRIVATE_KEY) in scripts/.env');
const LOG = env('LOG_ADDRESS'); if (!LOG) throw new Error('set LOG_ADDRESS in scripts/.env');
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain: sepolia, transport: http(env('SEPOLIA_RPC')) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(env('SEPOLIA_RPC')) });

// 1. seenBlock for every entry, from the evidence tx on the subject's chain
const entries = read('core.json');
const seeded = existsSync(new URL('core.seed.json', dir)) ? read('core.seed.json') : [];
const byKey = new Map(seeded.map((e) => [`${e.chainId}:${e.subject}:${e.category}`, e]));
const chainClients = {};
for (const e of entries) {
  const k = `${e.chainId}:${e.subject}:${e.category}`;
  if (byKey.get(k)?.seenBlock) continue;
  const rpc = env(`RPC_${e.chainId}`);
  if (!rpc) { console.warn(`no RPC_${e.chainId} in .env; skipping ${e.subject}`); continue; }
  chainClients[e.chainId] ||= createPublicClient({ transport: http(rpc) });
  try {
    const tx = await chainClients[e.chainId].getTransaction({ hash: e.evidence });
    byKey.set(k, { ...e, seenBlock: Number(tx.blockNumber) });
    process.stdout.write(`\r${byKey.size}/${entries.length} evidence blocks resolved`);
  } catch (err) { console.warn(`\ncould not fetch ${e.evidence} on chain ${e.chainId}: ${err.shortMessage || err.message}`); }
}
console.log();
const ready = [...byKey.values()].filter((e) => e.seenBlock);
write('core.seed.json', ready);

// 2. append, skipping what earlier runs already wrote
const receipts = existsSync(new URL('core.receipts.json', dir)) ? read('core.receipts.json') : { writer: account.address, log: LOG, batches: [] };
const done = new Set(receipts.batches.flatMap((b) => b.keys));
const pending = ready.filter((e) => !done.has(`${e.chainId}:${e.subject}:${e.category}`));
console.log(`writer ${account.address}, log ${LOG}, ${pending.length} leaves to append (${done.size} already on chain)`);
const toLeaf = (e) => ({ chainId: BigInt(e.chainId), subject: e.subject, category: CATEGORY[e.category], op: 0, evidence: e.evidence, seenBlock: BigInt(e.seenBlock), refLeaf: '0x' + '00'.repeat(32) });
for (let i = 0; i < pending.length; i += 100) {
  const batch = pending.slice(i, i + 100);
  const leaves = batch.map(toLeaf);
  if (dry) { console.log(`[dry] batch ${i / 100 + 1}: ${leaves.length} leaves, first ${batch[0].subject} cat ${leaves[0].category} block ${leaves[0].seenBlock}`); continue; }
  const { request } = await pub.simulateContract({ account, address: LOG, abi: logAbi, functionName: 'append', args: [leaves] });
  const hash = await wallet.writeContract(request);
  process.stdout.write(`batch ${i / 100 + 1}: ${hash} … `);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') throw new Error('append reverted');
  console.log(`ok, block ${r.blockNumber}, gas ${r.gasUsed}`);
  receipts.batches.push({ tx: hash, block: Number(r.blockNumber), gasUsed: Number(r.gasUsed), keys: batch.map((e) => `${e.chainId}:${e.subject}:${e.category}`) });
  write('core.receipts.json', receipts);
}
if (!dry) {
  const seq = await pub.readContract({ address: LOG, abi: logAbi, functionName: 'writerSeq', args: [account.address] });
  const head = await pub.readContract({ address: LOG, abi: logAbi, functionName: 'writerHead', args: [account.address] });
  console.log(`writerSeq ${seq}, writerHead ${head}`);
}
