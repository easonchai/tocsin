// The detector: an agent that writes flags under its own name, detector.tocsin.eth.
// It scans recent Ethereum mainnet blocks for address-poisoning dust (zero-value ERC-20 Transfer events sent to many
// recipients by one sender), flags the senders as POISONING_OPERATOR with the dust transaction as evidence, and
// appends them to the log under its own key. Its key owns nothing but detector.eth and the publish role on its name.
// Run: node --env-file=scripts/.env scripts/agent/detector.mjs [--blocks 60] [--min-recipients 25] [--dry]
// Keys: DETECTOR_PRIVATE_KEY (or load it from your secret store, such as 1Claw, into that variable before running).
// Output: docs/plan/demo/seed/detector.json (candidates with evidence), appended on-chain when LOG_ADDRESS is set.
import { createPublicClient, createWalletClient, http, parseAbi, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dry = process.argv.includes('--dry');
const BLOCKS = BigInt(arg('--blocks', '60'));
const MIN_RECIPIENTS = Number(arg('--min-recipients', '25'));
const env = (n, d) => { const v = process.env[n]; return v && v !== '0x' ? v : d; };
const out = new URL('../../docs/plan/demo/seed/detector.json', import.meta.url);

// 1. scan mainnet for zero-value transfers: the classic poisoning pattern, one sender spraying lookalike history entries
const mainnet = createPublicClient({ transport: http(env('RPC_1', 'https://ethereum-rpc.publicnode.com')) });
const head = await mainnet.getBlockNumber();
const from = head - BLOCKS;
console.log(`scanning mainnet blocks ${from} to ${head} for zero-value USDT and USDC transfers`);
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
// Poisoning dust is almost always a stablecoin zero-value transfer, and public RPCs refuse unfiltered log scans, so scan these.
const TOKENS = ['0xdAC17F958D2ee523a2206206994597C13D831ec7', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48']; // USDT, USDC on mainnet
const bySender = new Map(); // tx sender (the operator who paid gas) -> { recipients:Set, evidence, block, token }
for (let b = from; b <= head; b += 10n) {
  const to = b + 9n > head ? head : b + 9n;
  const logs = await mainnet.getLogs({ address: TOKENS, event: transfer, fromBlock: b, toBlock: to });
  const zero = logs.filter((l) => l.args.value === 0n);
  // group by transaction, then resolve the sender once per tx
  const byTx = new Map();
  for (const l of zero) { if (!byTx.has(l.transactionHash)) byTx.set(l.transactionHash, []); byTx.get(l.transactionHash).push(l); }
  for (const [hash, ls] of byTx) {
    if (ls.length < 5) continue; // a single zero transfer is noise; poisoning batches are dozens per tx
    const tx = await mainnet.getTransaction({ hash });
    const key = tx.from.toLowerCase();
    const e = bySender.get(key) || { recipients: new Set(), evidence: hash, block: Number(tx.blockNumber), token: ls[0].address, txs: 0 };
    for (const l of ls) e.recipients.add(l.args.to.toLowerCase());
    e.txs++;
    bySender.set(key, e);
  }
  process.stdout.write(`\rblocks to ${to}: ${bySender.size} senders of zero-value batches`);
}
console.log();

// 2. keep senders that sprayed many recipients: category 1, the account that authorized the dust, never a bundler
const candidates = [...bySender].filter(([, e]) => e.recipients.size >= MIN_RECIPIENTS).map(([sender, e]) => ({
  chainId: 1, subject: sender, category: 'POISONING_OPERATOR', evidence: e.evidence, seenBlock: e.block,
  note: `sent zero-value transfers of ${e.token} to ${e.recipients.size} recipients in ${e.txs} tx(s) within ${BLOCKS} blocks`,
  detectedAt: new Date().toISOString(), writer: 'detector.tocsin.eth',
}));
const prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const known = new Set(prev.map((c) => c.subject));
const fresh = candidates.filter((c) => !known.has(c.subject));
writeFileSync(out, JSON.stringify([...prev, ...fresh], null, 1) + '\n');
console.log(`${candidates.length} operators above ${MIN_RECIPIENTS} recipients, ${fresh.length} new; written to docs/plan/demo/seed/detector.json`);
for (const c of fresh.slice(0, 10)) console.log(`  ${c.subject}  ${c.note}  evidence ${c.evidence}`);

// 3. append under the detector's own namespace
const LOG = env('LOG_ADDRESS'), key = env('DETECTOR_PRIVATE_KEY');
if (dry || !fresh.length) { console.log(dry ? 'dry run, nothing appended' : 'nothing new to append'); process.exit(0); }
if (!LOG || !key) { console.log('LOG_ADDRESS or DETECTOR_PRIVATE_KEY not set; candidates saved, nothing appended'); process.exit(0); }
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain: sepolia, transport: http(env('SEPOLIA_RPC')) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(env('SEPOLIA_RPC')) });
const logAbi = parseAbi(['struct Leaf { uint64 chainId; address subject; uint8 category; uint8 op; bytes32 evidence; uint64 seenBlock; bytes32 refLeaf; }', 'function append(Leaf[] leaves)', 'function writerSeq(address) view returns (uint64)']);
const leaves = fresh.map((c) => ({ chainId: 1n, subject: c.subject, category: 1, op: 0, evidence: c.evidence, seenBlock: BigInt(c.seenBlock), refLeaf: '0x' + '00'.repeat(32) }));
const { request } = await pub.simulateContract({ account, address: LOG, abi: logAbi, functionName: 'append', args: [leaves] });
const hash = await wallet.writeContract(request);
const r = await pub.waitForTransactionReceipt({ hash });
console.log(`appended ${leaves.length} leaves as ${account.address}: ${hash} (${r.status}); writerSeq now ${await pub.readContract({ address: LOG, abi: logAbi, functionName: 'writerSeq', args: [account.address] })}`);
