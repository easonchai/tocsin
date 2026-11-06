// Demo of the hub from a third party's seat: register <label>.eth on ENSv2 Sepolia (mint test USDC, commit, wait,
// register), then claim <label>.tocsin.eth through the MirrorRegistrar.
// Run: node --env-file=scripts/.env scripts/ens/4-register-and-claim.mjs <label>
// Uses CLAIMER_PRIVATE_KEY if set, else PRIVATE_KEY. The key needs Sepolia ETH. Needs 2-setup-core.mjs to have run.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const label = process.argv[2];
if (!label || label.includes('.')) { console.error('usage: 4-register-and-claim.mjs <label>'); process.exit(1); }
const key = process.env.CLAIMER_PRIVATE_KEY && process.env.CLAIMER_PRIVATE_KEY !== '0x' ? process.env.CLAIMER_PRIVATE_KEY : process.env.PRIVATE_KEY;
if (!key || key === '0x') throw new Error('set CLAIMER_PRIVATE_KEY or PRIVATE_KEY in scripts/.env');
const env = { ...process.env, PRIVATE_KEY: key };
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

console.log(`== 1/2 register ${label}.eth`);
execFileSync(process.execPath, [here('./1-register-tocsin.mjs'), label], { env, stdio: 'inherit' });
console.log(`== 2/2 claim ${label}.tocsin.eth`);
execFileSync(process.execPath, [here('./3-claim.mjs'), label], { env, stdio: 'inherit' });
