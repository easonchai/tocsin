/* eslint-disable prettier/prettier -- kept in site/claim.html's own layout so the two diff cleanly */
// The inline module script of site/claim.html, wrapped in initClaim() so the page can run it after hydration.
// Two changes: viem comes from the app's own package instead of esm.sh, and the ring field moved to ClaimScripts.tsx.
import {
  createPublicClient, createWalletClient, custom, http, parseAbi, keccak256, toHex, namehash, encodeFunctionData, decodeEventLog, parseAbiItem,
} from 'viem';
import { packetToBytes } from 'viem/ens';
import { sepolia } from 'viem/chains';

const A = {
  ETHRegistry: '0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4', ETHRegistrar: '0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3', UR: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
  Factory: '0xDa70306C98E97eCe36F997a21368e53298572991', ResolverImpl: '0x115eb53F0c60696633855F90b138178Fb40b2b2C',
  USDC: '0x240b0316Df57887DBBE58b586508b19e633a14aa', Hub: '0x45cb8bE82D927d8d310cd6B357708b0367B4435B', Registrar: '0x9319461337a2c5fb1992fd467708cc46d716a427',
};
const abi = {
  registry: parseAbi(['function findOwner(string label) view returns (address)', 'function findExpiry(string label) view returns (uint64)', 'function getStatus(uint256 anyId) view returns (uint8)', 'function getResolver(string label) view returns (address)', 'function hasAssignees(uint256 anyId, uint256 roleBitmap) view returns (bool)', 'function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)']),
  registrar: parseAbi(['function isAvailable(string label) view returns (bool)', 'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)', 'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) view returns (bytes32)', 'function MIN_COMMITMENT_AGE() view returns (uint64)', 'function commit(bytes32 commitment)', 'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)']),
  mirror: parseAbi(['function canClaim(string label, address account) view returns (bool)', 'function claim(string label, address resolver) returns (uint256 tokenId)', 'event Claimed(string label, address indexed owner, uint64 expiry, uint256 tokenId)']),
  factory: parseAbi(['function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)', 'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)']),
  resolver: parseAbi(['function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)', 'function setAddress(bytes name, uint256 coinType, bytes addressBytes)']),
  usdc: parseAbi(['function mint(address to, uint256 amount)', 'function balanceOf(address) view returns (uint256)', 'function allowance(address owner, address spender) view returns (uint256)', 'function approve(address spender, uint256 value) returns (bool)']),
};
const adminOf = (r) => r << 128n, withAdmin = (...rs) => rs.reduce((a, r) => a | r | adminOf(r), 0n);
const DANGEROUS = withAdmin(1n << 24n, 1n << 20n, 1n << 12n, 1n << 124n) | ((1n << 28n) << 128n);
const RESOLVER_ROLES = withAdmin(1n << 0n, 1n << 4n, 1n << 8n, 1n << 12n, 1n << 16n, 1n << 20n, 1n << 24n, 1n << 28n, 1n << 124n);
const ZERO = '0x0000000000000000000000000000000000000000', ZERO32 = '0x' + '00'.repeat(32);
const YEAR = 365n * 24n * 3600n;
// labels in Claimed logs are whatever a claimant registered, so they are escaped before they reach innerHTML
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function initClaim() {
const pub = createPublicClient({ chain: sepolia, transport: http('https://ethereum-sepolia-rpc.publicnode.com') });
let wallet = null, account = null, label = '';
const $ = (id) => document.getElementById(id);
const say = (id, html, cls) => { const el = $(id); el.innerHTML += (cls ? `<span class="${cls}">${html}</span>` : html) + '\n'; };
const clear = (id) => { $(id).innerHTML = ''; };
const short = (a) => a.slice(0, 6) + '…' + a.slice(-4);
const txlink = (h) => `<a href="https://sepolia.etherscan.io/tx/${h}" target="_blank" style="color:inherit">${short(h)}</a>`;

async function send(out, what, req) {
  const { request } = await pub.simulateContract({ account, ...req });
  const hash = await wallet.writeContract(request);
  say(out, `${what}: ${txlink(hash)} …`, 'muted');
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== 'success') { say(out, `${what} reverted`, 'bad'); throw new Error(`${what} reverted`); }
  say(out, `${what}: ok`, 'ok');
  await settle(r.blockNumber);
  return r;
}
async function settle(n) { for (let i = 0, ok = 0; i < 40 && ok < 3; i++) { const b = await pub.getBlockNumber({ cacheTime: 0 }).catch(() => 0n); ok = b >= n ? ok + 1 : 0; if (ok < 3) await new Promise((r) => setTimeout(r, 1500)); } }
async function until(fn, accept, tries = 8) { let v; for (let i = 0; i < tries; i++) { v = await fn().catch(() => undefined); if (v !== undefined && accept(v)) return v; await new Promise((r) => setTimeout(r, 2500)); } return v; }

$('connect').onclick = async () => {
  if (!window.ethereum) { $('acct').innerHTML = '<span class="bad">No wallet found. Install MetaMask or Rabby.</span>'; return; }
  const w = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
  [account] = await w.requestAddresses();
  try { await w.switchChain({ id: sepolia.id }); } catch { try { await w.addChain({ chain: sepolia }); } catch {} }
  wallet = createWalletClient({ account, chain: sepolia, transport: custom(window.ethereum) });
  $('acct').innerHTML = `<span class="ok">${short(account)}</span> <span class="muted">on Sepolia</span>`;
  if (label) $('check').click();
};

$('check').onclick = async () => {
  label = $('label').value.trim().toLowerCase();
  clear('checkOut'); $('register').disabled = true; $('claim').disabled = true;
  if (!/^[a-z0-9-]{3,}$/.test(label)) { say('checkOut', 'Use at least three characters, letters, digits or hyphens.', 'bad'); return; }
  $('register').textContent = `Register ${label}.eth`; $('claim').textContent = `Claim ${label}.tocsin.eth`;
  const [ethOwner, hubOwner] = await Promise.all([
    pub.readContract({ address: A.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] }),
    pub.readContract({ address: A.Hub, abi: abi.registry, functionName: 'findOwner', args: [label] }),
  ]);
  const mine = !!account && ethOwner.toLowerCase() === account.toLowerCase();
  say('checkOut', `${label}.eth: ` + (ethOwner === ZERO ? '<span class="amber">available</span>' : `owned by <span class="${mine ? 'ok' : 'muted'}">${short(ethOwner)}${mine ? ' (you)' : ''}</span>`));
  say('checkOut', `${label}.tocsin.eth: ` + (hubOwner === ZERO ? '<span class="amber">unclaimed</span>' : `claimed by <span class="ok">${short(hubOwner)}</span>`));
  if (!account) { say('checkOut', 'Connect a wallet to continue.', 'muted'); return; }
  const can = await pub.readContract({ address: A.Registrar, abi: abi.mirror, functionName: 'canClaim', args: [label, account] });
  if (ethOwner === ZERO) { $('register').disabled = false; say('checkOut', 'Register the .eth name in step 03, then claim.', 'muted'); }
  else if (can) { $('claim').disabled = false; say('checkOut', 'canClaim is true. Go to step 04.', 'ok'); }
  else if (mine) say('checkOut', 'You own the .eth name but the subname is already claimed and unexpired.', 'bad');
  else say('checkOut', 'Only the owner of that .eth name can claim its subname.', 'bad');
};

$('register').onclick = async () => {
  clear('regOut'); $('register').disabled = true;
  try {
    const [base, premium] = await pub.readContract({ address: A.ETHRegistrar, abi: abi.registrar, functionName: 'getRegisterPrice', args: [label, YEAR, A.USDC] });
    const price = base + premium, want = price + price / 10n;
    say('regOut', `price: ${Number(price) / 1e6} test USDC for one year`, 'muted');
    const bal = await pub.readContract({ address: A.USDC, abi: abi.usdc, functionName: 'balanceOf', args: [account] });
    if (bal < want) await send('regOut', 'mint test USDC', { address: A.USDC, abi: abi.usdc, functionName: 'mint', args: [account, want - bal] });
    const allowance = await pub.readContract({ address: A.USDC, abi: abi.usdc, functionName: 'allowance', args: [account, A.ETHRegistrar] });
    if (allowance < want) await send('regOut', 'approve registrar', { address: A.USDC, abi: abi.usdc, functionName: 'approve', args: [A.ETHRegistrar, want] });
    const secret = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const commitment = await pub.readContract({ address: A.ETHRegistrar, abi: abi.registrar, functionName: 'makeCommitment', args: [label, account, secret, ZERO, ZERO, YEAR, ZERO32] });
    await send('regOut', 'commit', { address: A.ETHRegistrar, abi: abi.registrar, functionName: 'commit', args: [commitment] });
    const minAge = Number(await pub.readContract({ address: A.ETHRegistrar, abi: abi.registrar, functionName: 'MIN_COMMITMENT_AGE' })) + 15;
    for (let s = minAge; s > 0; s--) { $('regOut').lastChild && ($('regOut').lastChild.textContent = ''); say('regOut', `waiting ${s}s for the commitment to age…`, 'muted'); await new Promise((r) => setTimeout(r, 1000)); $('regOut').innerHTML = $('regOut').innerHTML.replace(/<span class="muted">waiting \d+s[^<]*<\/span>\n$/, ''); }
    await send('regOut', `register ${label}.eth`, { address: A.ETHRegistrar, abi: abi.registrar, functionName: 'register', args: [label, account, secret, ZERO, ZERO, YEAR, A.USDC, ZERO32] });
    const owner = await until(() => pub.readContract({ address: A.ETHRegistry, abi: abi.registry, functionName: 'findOwner', args: [label] }), (o) => o.toLowerCase() === account.toLowerCase());
    say('regOut', `${label}.eth is yours (${short(owner)}). Claim it in step 04.`, 'ok');
    $('claim').disabled = false;
  } catch (e) { say('regOut', e.shortMessage || e.message, 'bad'); $('register').disabled = false; }
};

$('claim').onclick = async () => {
  clear('claimOut'); $('claim').disabled = true;
  try {
    const can = await until(() => pub.readContract({ address: A.Registrar, abi: abi.mirror, functionName: 'canClaim', args: [label, account] }), (v) => v === true);
    if (!can) throw new Error('canClaim is false: you must own the .eth name and the subname must be free');
    const salt = BigInt(keccak256(toHex('tocsin-resolver-v2')));
    const init = encodeFunctionData({ abi: abi.resolver, functionName: 'initialize', args: [[{ account, roleBitmap: RESOLVER_ROLES }], []] });
    const { result: resolver } = await pub.simulateContract({ account, address: A.Factory, abi: abi.factory, functionName: 'deployProxy', args: [A.ResolverImpl, salt, init] });
    if (!(await pub.getCode({ address: resolver }))) await send('claimOut', 'deploy your resolver', { address: A.Factory, abi: abi.factory, functionName: 'deployProxy', args: [A.ResolverImpl, salt, init] });
    say('claimOut', `your resolver: ${short(resolver)}`, 'muted');
    const r = await send('claimOut', `claim ${label}.tocsin.eth`, { address: A.Registrar, abi: abi.mirror, functionName: 'claim', args: [label, resolver] });
    for (const log of r.logs) { try { const ev = decodeEventLog({ abi: abi.mirror, data: log.data, topics: log.topics }); if (ev.eventName === 'Claimed') say('claimOut', `expiry ${new Date(Number(ev.args.expiry) * 1000).toISOString().slice(0, 10)}`, 'muted'); } catch {} }
    await send('claimOut', 'set addr record', { address: resolver, abi: abi.resolver, functionName: 'setAddress', args: [toHex(packetToBytes(`${label}.tocsin.eth`)), 60n, account] });
    say('claimOut', `done. <a href="https://sepolia.app.ens.domains/${label}.tocsin.eth" target="_blank" style="color:inherit">sepolia.app.ens.domains/${label}.tocsin.eth</a>`, 'ok');
    say('claimOut', `to publish a list: set text key tocsin.list on your resolver for node ${namehash(`${label}.tocsin.eth`)}`, 'muted');
    loadClaims();
  } catch (e) { say('claimOut', e.shortMessage || e.message, 'bad'); $('claim').disabled = false; }
};

$('verify').onclick = async () => {
  const out = $('verifyOut'); out.innerHTML = '<span>reading…</span><span></span>';
  const [dangerous, registrar, sub, coreOwner, coreRes] = await Promise.all([
    pub.readContract({ address: A.Hub, abi: abi.registry, functionName: 'hasAssignees', args: [0n, DANGEROUS] }),
    pub.readContract({ address: A.Hub, abi: abi.registry, functionName: 'hasRootRoles', args: [(1n << 0n) | (1n << 16n), A.Registrar] }),
    pub.readContract({ address: A.ETHRegistry, abi: parseAbi(['function getSubregistry(string label) view returns (address)']), functionName: 'getSubregistry', args: ['tocsin'] }),
    pub.readContract({ address: A.Hub, abi: abi.registry, functionName: 'findOwner', args: ['core'] }),
    pub.readContract({ address: A.Hub, abi: abi.registry, functionName: 'getResolver', args: ['core'] }),
  ]);
  const row = (k, v) => `<span>${k}</span><span>${v}</span>`;
  out.innerHTML = [
    row('emancipated', dangerous ? '<span class="bad">no, a dangerous root role is held</span>' : '<span class="ok">yes: isEmancipated() and hasAssignees(ROOT, dangerous) = false</span>'),
    row('registrar roles', registrar ? '<span class="ok">MirrorRegistrar holds REGISTRAR + RENEW</span>' : '<span class="bad">missing</span>'),
    row('tocsin.eth points at', `<a href="https://sepolia.etherscan.io/address/${sub}" target="_blank">${short(sub)}</a>${sub.toLowerCase() === A.Hub.toLowerCase() ? ' (the hub)' : ''}`),
    row('core.tocsin.eth', `owner ${short(coreOwner)} · resolver ${short(coreRes)}`),
    row('hub registry', `<a href="https://sepolia.etherscan.io/address/${A.Hub}" target="_blank">${A.Hub}</a>`),
    row('MirrorRegistrar', `<a href="https://sepolia.etherscan.io/address/${A.Registrar}" target="_blank">${A.Registrar}</a>`),
  ].join('');
};

async function loadClaims() {
  const ul = $('claims'); ul.innerHTML = '<li><span class="muted">loading…</span></li>';
  try {
    const logs = await pub.getLogs({ address: A.Registrar, event: parseAbiItem('event Claimed(string label, address indexed owner, uint64 expiry, uint256 tokenId)'), fromBlock: 12077300n, toBlock: 'latest' });
    ul.innerHTML = logs.length ? logs.reverse().map((l) => `<li><span>${esc(l.args.label)}.tocsin.eth</span><span>${short(l.args.owner)} · expires ${new Date(Number(l.args.expiry) * 1000).toISOString().slice(0, 10)}</span></li>`).join('') : '<li><span class="muted">none yet</span></li>';
  } catch { ul.innerHTML = '<li><span class="muted">could not load</span></li>'; }
}
loadClaims();
const onKey = (e) => { if (e.key === 'Enter') $('check').click(); };
$('label').addEventListener('keydown', onKey);
return () => $('label').removeEventListener('keydown', onKey);
}
