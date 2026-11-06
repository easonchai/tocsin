// Registers tocsin.eth on ENSv2 Sepolia through the ETHRegistrar: mint test USDC, approve, commit, wait, register.
// Run: node --env-file=scripts/.env scripts/ens/1-register-tocsin.mjs [label]
// Idempotent: exits early if the label is already registered to this account. Needs Sepolia ETH for gas.
import { ENSV2, abi, clients, labelhash, send, readUntil } from './common.mjs';
import { toHex } from 'viem';
import { randomBytes } from 'node:crypto';

const label = process.argv[2] || 'tocsin';
const duration = 365n * 24n * 3600n; // one year
const { account, pub, wallet } = clients();
console.log(`account ${account.address}`);

const status = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'getStatus', args: [labelhash(label)] });
if (status === 2) {
  const owner = await pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] });
  console.log(`${label}.eth is already registered to ${owner}${owner.toLowerCase() === account.address.toLowerCase() ? ' (this account)' : ''}`);
  process.exit(owner.toLowerCase() === account.address.toLowerCase() ? 0 : 1);
}

const [base, premium] = await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'getRegisterPrice', args: [label, duration, ENSV2.MockUSDC] });
const price = base + premium;
const decimals = await pub.readContract({ address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'decimals' });
console.log(`price for ${label}.eth, 1 year: ${Number(price) / 10 ** decimals} test USDC`);

// The Sepolia MockUSDC is freely mintable; top up to price plus 10% for oracle drift between commit and register.
const want = price + price / 10n;
const bal = await pub.readContract({ address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'balanceOf', args: [account.address] });
if (bal < want) await send(pub, wallet, 'mint test USDC', { address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'mint', args: [account.address, want - bal] });
const allowance = await pub.readContract({ address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'allowance', args: [account.address, ENSV2.ETHRegistrar] });
if (allowance < want) await send(pub, wallet, 'approve registrar', { address: ENSV2.MockUSDC, abi: abi.usdc, functionName: 'approve', args: [ENSV2.ETHRegistrar, want] });

const secret = toHex(randomBytes(32));
const zero = '0x0000000000000000000000000000000000000000';
const referrer = '0x0000000000000000000000000000000000000000000000000000000000000000';
const commitment = await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'makeCommitment', args: [label, account.address, secret, zero, zero, duration, referrer] });
await send(pub, wallet, 'commit', { address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'commit', args: [commitment] });

const minAge = await pub.readContract({ address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'MIN_COMMITMENT_AGE' });
const wait = Number(minAge) + 15;
console.log(`waiting ${wait}s for the commitment to age…`);
await new Promise((r) => setTimeout(r, wait * 1000));

const receipt = await send(pub, wallet, `register ${label}.eth`, { address: ENSV2.ETHRegistrar, abi: abi.registrar, functionName: 'register', args: [label, account.address, secret, zero, zero, duration, ENSV2.MockUSDC, referrer] });
const owner = await readUntil(() => pub.readContract({ address: ENSV2.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] }), (o) => o.toLowerCase() === account.address.toLowerCase());
console.log(`${label}.eth owner is now ${owner}; tx ${receipt.transactionHash}`);
console.log(`view: https://sepolia.app.ens.domains/${label}.eth`);
