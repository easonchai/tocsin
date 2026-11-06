// Hands one account the right to set one text record on your resolver: the ERC's list key, nothing else.
// The name owner's key stays cold; a hot publishing key (a CI job, an agent) can only update the list record.
// Run: node --env-file=scripts/.env scripts/ens/5-delegate-publisher.mjs <publisher address> [--revoke] [--resolver 0x…]
// Default resolver: the maintainer's, from state.sepolia.json. Uses PRIVATE_KEY, which must hold the text admin role on that resolver.
import { clients, send } from './common.mjs';
import { parseAbi, toHex } from 'viem';
import { packetToBytes } from 'viem/ens';
import { readFileSync } from 'node:fs';

const KEY = 'erc-threat-flag-log.list';
const publisher = process.argv[2];
if (!publisher || !/^0x[0-9a-fA-F]{40}$/.test(publisher)) { console.error('usage: 5-delegate-publisher.mjs <publisher address> [--revoke] [--resolver 0x…]'); process.exit(1); }
const revoke = process.argv.includes('--revoke');
const rArg = process.argv.indexOf('--resolver');
const state = JSON.parse(readFileSync(new URL('./state.sepolia.json', import.meta.url), 'utf8'));
const resolver = rArg > 0 ? process.argv[rArg + 1] : state.resolver;
const name = process.argv.includes('--name') ? process.argv[process.argv.indexOf('--name') + 1] : state.names?.list || 'core.tocsin.eth';

// The deployed Sepolia PermissionedResolver scopes text roles by key; the name argument is DNS-encoded.
const resolverAbi = parseAbi(['function authorizeTextRoles(bytes toName, string key, address account, bool grant)']);
const { account, pub, wallet } = clients();
console.log(`${revoke ? 'revoking' : 'granting'} ${KEY} on ${resolver} (${name}) ${revoke ? 'from' : 'to'} ${publisher}, as ${account.address}`);
await send(pub, wallet, `${revoke ? 'revoke' : 'grant'} text role for ${KEY}`, { address: resolver, abi: resolverAbi, functionName: 'authorizeTextRoles', args: [toHex(packetToBytes(name)), KEY, publisher, !revoke] });
console.log(revoke ? 'done. the publisher can no longer set the list record.' : `done. ${publisher} can now set only ${KEY} on names served by this resolver, and nothing else.`);
