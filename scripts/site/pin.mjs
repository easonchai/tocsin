// Pin the static site to Pinata and print the CID for the tocsin.eth content hash.
//
//   bash site/build.sh && node --env-file=scripts/.env scripts/site/pin.mjs [dist]
//
// Needs PINATA_JWT in scripts/.env (an API key with pinFileToIPFS). Uploads the folder as one directory pin with
// CIDv1, the same CID `ipfs add -r --cid-version 1` prints locally, so the two can be compared.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] || 'dist';
const jwt = process.env.PINATA_JWT;
if (!jwt) { console.error('PINATA_JWT is not set in scripts/.env'); process.exit(1); }

const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const form = new FormData();
for (const f of files) form.append('file', new Blob([readFileSync(f)]), 'tocsin/' + relative(root, f));
form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
form.append('pinataMetadata', JSON.stringify({ name: `tocsin-site-${new Date().toISOString().slice(0, 10)}` }));
console.log(`uploading ${files.length} files from ${root}/ …`);
const r = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form });
const body = await r.json().catch(() => ({}));
if (!r.ok) { console.error('pinata refused:', r.status, body); process.exit(1); }
console.log(`pinned: ${body.IpfsHash} (${body.PinSize} bytes${body.isDuplicate ? ', already pinned' : ''})`);
console.log(`check:  https://gateway.pinata.cloud/ipfs/${body.IpfsHash}/`);
console.log(`ens:    set the tocsin.eth content hash to ipfs://${body.IpfsHash}`);
