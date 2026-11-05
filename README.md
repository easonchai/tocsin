# Antibody

Herd immunity for Ethereum. An immutable, append-only on-chain log of scam infrastructure that any light-client wallet verifies without trusting an RPC, an explorer, or a vendor.

This repository holds the ERC draft and a fully local landing page. No contracts are deployed and nothing here is built for production yet.

## Layout

```
erc/
  eip-draft_threat_flag_log.md        the ERC draft, EIP-1 format
  assets/eip-draft_threat_flag_log/
    ThreatFlagLog.sol                 reference implementation (same code as in the ERC)
    ThreatFlagLog.t.sol               Foundry tests for the normative test cases
site/
  index.html                          landing page
  erc.html                            the ERC rendered as a page
  style.css
  fonts/                              bundled woff2 files, no CDN
```

## Run the site locally

Everything is static and self-contained. Fonts are bundled, there are no external requests.

```sh
open site/index.html            # works straight from the filesystem
# or, if your browser blocks local font loading:
cd site && python3 -m http.server 8731 && open http://127.0.0.1:8731
```

## Rebuild erc.html after editing the ERC

`erc.html` is generated from the markdown with `marked` at build time. The site itself never loads a converter.

```sh
npm i -D marked@15.0.12
node -e "
const fs=require('fs');const {marked}=require('marked');
let md=fs.readFileSync('erc/eip-draft_threat_flag_log.md','utf8');
const fm=md.match(/^---\n([\s\S]*?)\n---\n/);const body=md.slice(fm[0].length);
const html=marked.parse(body.replace(/\]\(\.\/eip-(\d+)\.md\)/g,'](https://eips.ethereum.org/EIPS/eip-\$1)'));
// paste into the <main> of site/erc.html
fs.writeFileSync('/tmp/erc-body.html',html);"
```

## Test the reference implementation

```sh
mkdir -p /tmp/antibody-forge/src /tmp/antibody-forge/test
cp erc/assets/eip-draft_threat_flag_log/ThreatFlagLog.sol /tmp/antibody-forge/src/
cp erc/assets/eip-draft_threat_flag_log/ThreatFlagLog.t.sol /tmp/antibody-forge/test/
cd /tmp/antibody-forge && printf '[profile.default]\nsrc="src"\nout="out"\nlibs=[]\nsolc_version="0.8.28"\n' > foundry.toml
forge test
```

Six tests cover the first seven normative cases in the ERC: first leaf, batch replay, empty batch, bad op, zero evidence, and signed append with nonce handling.

## Before posting the ERC

1. Create the Ethereum Magicians thread and replace the `TODO` in `discussions-to`.
2. Run the backtest described in the PRD. The share of paid-loss dollars that went to addresses meeting the write criteria at least one hour before the loss decides whether this is an ERC or a negative result.
3. Open the PR against `ethereum/ERCs` as `ERCS/erc-draft_threat_flag_log.md` with the assets folder.

License: CC0 for the ERC and reference code.
