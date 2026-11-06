// A template for an automated writer: an agent that flags addresses under its own name, detector.tocsin.eth.
//
// It is a showcase, not the product. The shape is what matters: find candidates, attach on-chain evidence, append them
// under your own key, publish your own list. Replace findCandidates() with your detection and keep the rest.
//
// Two sources are built in:
//   --source sample   (default) five poisoning operators from the verified seed list, so the demo is deterministic
//   --source live     a crude heuristic: senders that sprayed zero-value USDT or USDC transfers to many addresses in
//                     recent mainnet blocks. It finds real sprayers, and it would also flag a legitimate batch sender,
//                     which is why it is not the default and why its writer is listed at warn weight.
//
// Run: node --env-file=scripts/.env scripts/agent/detector.mjs [--source sample|live] [--blocks 60] [--min-recipients 25] [--limit 5] [--dry]
// Keys: DETECTOR_PRIVATE_KEY (load it from your secret store, such as 1Claw, into that variable before running).
// Output: docs/plan/demo/seed/detector.json (what it flagged, with evidence), appended on-chain when LOG_ADDRESS is set.
import { createPublicClient, createWalletClient, http, parseAbi, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const env = (n, d) => { const v = process.env[n]; return v && v !== '0x' ? v : d; };
const dry = process.argv.includes('--dry');
const SOURCE = arg('--source', 'sample');
const LIMIT = Number(arg('--limit', '0')); // 0 = append every new candidate
const dir = new URL('../../docs/plan/demo/seed/', import.meta.url);
const out = new URL('detector.json', dir);
const CATEGORY = { POISONING_OPERATOR: 1, POISONING_FUNDER: 2, DRAINER_RECEIVER: 3, MALICIOUS_DELEGATE: 4, MALICIOUS_TOKEN: 5, PAID_LOOKALIKE: 6, DRAINER_SPENDER: 7, THEFT_PROCEEDS: 8 };

// ---- 1. find candidates. Each needs: chainId, subject, category, evidence tx hash, seenBlock, note.

async function findCandidatesSample() {
  return JSON.parse(readFileSync(new URL('detector.sample.json', dir), 'utf8'));
}

async function findCandidatesLive() {
  const BLOCKS = BigInt(arg('--blocks', '60')), MIN_RECIPIENTS = Number(arg('--min-recipients', '25'));
  const mainnet = createPublicClient({ transport: http(env('RPC_1', 'https://ethereum-rpc.publicnode.com')) });
  const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
  const TOKENS = ['0xdAC17F958D2ee523a2206206994597C13D831ec7', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']; // USDT, USDC: where poisoning dust lives
  const head = await mainnet.getBlockNumber(), from = head - BLOCKS;
  console.log(`scanning mainnet blocks ${from} to ${head} for zero-value USDT and USDC transfers`);
  const bySender = new Map(); // tx sender (the account that authorized the dust, never a bundler) -> recipients, evidence
  for (let b = from; b <= head; b += 10n) {
    const to = b + 9n > head ? head : b + 9n;
    const logs = await mainnet.getLogs({ address: TOKENS, event: transfer, fromBlock: b, toBlock: to });
    const byTx = new Map();
    for (const l of logs) if (l.args.value === 0n) { if (!byTx.has(l.transactionHash)) byTx.set(l.transactionHash, []); byTx.get(l.transactionHash).push(l); }
    for (const [hash, ls] of byTx) {
      if (ls.length < 5) continue; // one zero transfer is noise; poisoning batches are dozens per tx
      const tx = await mainnet.getTransaction({ hash });
      const key = tx.from.toLowerCase();
      const e = bySender.get(key) || { recipients: new Set(), evidence: hash, block: Number(tx.blockNumber), token: ls[0].address, txs: 0 };
      for (const l of ls) e.recipients.add(l.args.to.toLowerCase());
      e.txs++; bySender.set(key, e);
    }
    process.stdout.write(`\rblocks to ${to}: ${bySender.size} senders of zero-value batches`);
  }
  console.log();
  return [...bySender].filter(([, e]) => e.recipients.size >= MIN_RECIPIENTS).map(([sender, e]) => ({
    chainId: 1, subject: sender, category: 'POISONING_OPERATOR', evidence: e.evidence, seenBlock: e.block,
    note: `sent zero-value transfers of ${e.token} to ${e.recipients.size} recipients in ${e.txs} tx(s) within ${BLOCKS} blocks`,
  }));
}

const findCandidates = SOURCE === 'live' ? findCandidatesLive : findCandidatesSample;

// ---- 2. dedupe against what this writer already flagged, cap, record
const candidates = (await findCandidates()).map((c) => ({ ...c, detectedAt: new Date().toISOString(), writer: 'detector.tocsin.eth', source: SOURCE }));
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const known = new Set(prev.map((c) => `${c.chainId}:${c.subject}:${c.category}`));
const fresh = candidates.filter((c) => !known.has(`${c.chainId}:${c.subject}:${c.category}`)).slice(0, LIMIT || undefined);
console.log(`${candidates.length} candidates from "${SOURCE}", ${fresh.length} new${LIMIT ? ` (capped at ${LIMIT})` : ''}`);
for (const c of fresh) console.log(`  ${c.subject}  ${c.category}  evidence ${c.evidence}  ${c.note}`);

// ---- 3. append under the detector's own namespace
const LOG = env('LOG_ADDRESS'), key = env('DETECTOR_PRIVATE_KEY');
if (dry || !fresh.length) { console.log(dry ? 'dry run, nothing appended' : 'nothing new to append'); process.exit(0); }
if (!LOG || !key) { console.log('LOG_ADDRESS or DETECTOR_PRIVATE_KEY not set; nothing appended'); process.exit(0); }
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain: sepolia, transport: http(env('SEPOLIA_RPC')) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(env('SEPOLIA_RPC')) });
const logAbi = parseAbi(['struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }', 'function append(Leaf[] leaves)', 'function writerSeq(address) view returns (uint64)', 'function writerHead(address) view returns (bytes32)']);
const leaves = fresh.map((c) => ({ chainId: BigInt(c.chainId), subject: c.subject, category: CATEGORY[c.category], op: 0, evidence: c.evidence, seenBlock: BigInt(c.seenBlock), refLeaf: '0x' + '00'.repeat(32) }));
const { request } = await pub.simulateContract({ account, address: LOG, abi: logAbi, functionName: 'append', args: [leaves] });
const hash = await wallet.writeContract(request);
process.stdout.write(`append ${leaves.length} leaves as ${account.address}: ${hash} … `);
const r = await pub.waitForTransactionReceipt({ hash });
if (r.status !== 'success') throw new Error('append reverted');
console.log(`ok (block ${r.blockNumber}, gas ${r.gasUsed})`);
writeFileSync(out, JSON.stringify([...prev, ...fresh.map((c) => ({ ...c, tx: hash, block: Number(r.blockNumber) }))], null, 1) + '\n');
const seq = await pub.readContract({ address: LOG, abi: logAbi, functionName: 'writerSeq', args: [account.address] });
const headHash = await pub.readContract({ address: LOG, abi: logAbi, functionName: 'writerHead', args: [account.address] });
console.log(`writerSeq ${seq}, writerHead ${headHash}; recorded in docs/plan/demo/seed/detector.json`);
console.log(`next: node --env-file=scripts/.env scripts/seed/publish-list.mjs --name detector --key-env DETECTOR_PRIVATE_KEY`);
