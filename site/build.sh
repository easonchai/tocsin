#!/usr/bin/env bash
# Builds a self-contained static site in dist/ for IPFS + ENS (tocsin.eth.limo).
# Every path in dist/ is relative, so it works from a gateway subpath or a hash URL.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/kit dist/fonts
cp site/index.html site/erc.html site/claim.html site/style.css dist/
cp site/fonts/* dist/fonts/
cp design/kit/tokens.css design/kit/ringfield.js design/kit/scenes.js design/kit/scenes.css design/kit/favicon.svg design/kit/icon.svg dist/kit/
cp design/screens/cover-1280x720.png dist/og.png
cp design/screens/logo-512.png dist/icon-512.png
# repo-relative kit paths become dist-relative
sed -i '' 's#\.\./design/kit/#kit/#g' dist/index.html dist/erc.html dist/claim.html dist/style.css
sed -i '' 's#\.\./\.\./site/fonts/fonts\.css#../fonts/fonts.css#' dist/kit/tokens.css
# sanity: nothing in dist still points outside it
if grep -rn '\.\./design\|\.\./site' dist; then echo 'dist has paths outside dist' >&2; exit 1; fi
echo "dist/ ready: $(du -sh dist | cut -f1)"
echo "publish: ipfs add -r --cid-version 1 dist   (or drag dist/ into web3.storage / Pinata / Fleek)"
echo "then set the tocsin.eth contenthash to ipfs://<CID>; eth.limo serves it at https://tocsin.eth.limo"
