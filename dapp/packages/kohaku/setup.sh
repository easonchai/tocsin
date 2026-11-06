#!/usr/bin/env bash
# Clone Kohaku at the pinned commits, apply the Tocsin patches, copy the reader in, install, write .env.
# Usage: ./setup.sh [clone dir]   (default: ./kohaku-extension, gitignored)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/pins.sh"
DAPP="$(cd "$HERE/../.." && pwd)"
DIR="${1:-$HERE/kohaku-extension}"

node_version="$(node -v 2>/dev/null || true)"
if [[ ! "$node_version" =~ ^v22\.(1[2-9]|[2-9][0-9])\. ]]; then
  echo "Kohaku needs Node >=22.12 <23, found ${node_version:-none}." >&2
  echo "mise: mise exec node@22.12.0 -- $0 $*   nvm: nvm install 22.12.0 && nvm use 22.12.0" >&2
  exit 1
fi
# A rerun after a failed install reuses the clone, but only once both patches applied.
patched_marker() { echo "$(git -C "$DIR" rev-parse --absolute-git-dir)/tocsin-patched"; }
if [[ -e "$DIR" ]]; then
  if [[ ! -f "$(patched_marker 2>/dev/null)" ]]; then
    echo "$DIR exists but was not fully set up. Delete it or pass another directory." >&2
    exit 1
  fi
  echo "Reusing $DIR, patches already applied."
else
  git clone "$EXTENSION_REPO" "$DIR"
  git -C "$DIR" checkout -q -b tocsin "$EXTENSION_COMMIT"
  # .gitmodules uses SSH; fetch over HTTPS so no GitHub key is needed.
  git -C "$DIR" -c url."https://github.com/".insteadOf="git@github.com:" submodule update --init
  git -C "$DIR/src/ambire-common" checkout -q -b tocsin "$COMMONS_COMMIT"

  git -C "$DIR" apply "$HERE/patches/kohaku-extension.patch"
  git -C "$DIR/src/ambire-common" apply "$HERE/patches/kohaku-commons.patch"
  touch "$(patched_marker)"
fi
# The reader and the Helios plus Anon-RPC helper are copied, not patched, so Kohaku always gets this repo's current ones.
mkdir -p "$DIR/src/ambire-common/src/libs/tocsin/reader" "$DIR/src/web/extension-services/tocsin-offscreen/harness"
cp -R "$DAPP/packages/reader/src/." "$DIR/src/ambire-common/src/libs/tocsin/reader/"
cp "$DAPP/packages/nextjs/utils/harness/anonHelios.ts" "$DAPP/packages/nextjs/utils/harness/"bootstrap-*.json \
  "$DIR/src/web/extension-services/tocsin-offscreen/harness/"

# Kohaku pins yarn 1 (packageManager); a global yarn 4 would rewrite its lockfile.
# YARN_IGNORE_PATH: inside dapp/, yarn 1 would otherwise hand off to dapp/.yarnrc.yml's yarn 4.
# Not --frozen-lockfile: upstream's yarn.lock is out of date at this commit. update-patches.sh skips it.
(cd "$DIR" && YARN_IGNORE_PATH=1 npx --yes yarn@1.22.22 install)
(cd "$DIR/src/ambire-common" && npm ci)

# The extension ID key, not a wallet key. It keeps the extension ID stable across rebuilds, so keep one that exists.
[[ -f "$DIR/key.pem" ]] || openssl genrsa -out "$DIR/key.pem" 2048 2>/dev/null
EXTENSION_PUBLIC_KEY="$(openssl rsa -in "$DIR/key.pem" -pubout -outform DER 2>/dev/null | base64 | tr -d '\n')"

# Demo values from docs/plan/demo/runbook.md. Every one is public; override any of them from the shell.
DIR="$DIR" \
SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}" \
BROWSER_EXTENSION_PUBLIC_KEY="$EXTENSION_PUBLIC_KEY" \
REACT_APP_PIMLICO_API_KEY="${REACT_APP_PIMLICO_API_KEY:-dummy}" \
TOCSIN_RPC_URL="${TOCSIN_RPC_URL:-https://0xrpc.io/sep}" \
TOCSIN_LIST_NAME="${TOCSIN_LIST_NAME:-tocsin.eth}" \
TOCSIN_LIST_RECORD="${TOCSIN_LIST_RECORD-$(tr -d '[:space:]' < "$DAPP/list-record.hex")}" \
TOCSIN_LOG_FROM_BLOCK="${TOCSIN_LOG_FROM_BLOCK:-12074077}" \
TOCSIN_TRANSPORT="${TOCSIN_TRANSPORT:-tor}" \
TOCSIN_TOR_GATEWAYS="${TOCSIN_TOR_GATEWAYS:-127.0.0.1:12298:uEiDmYGjwNwrPIT33fsdOLp4inBsIhgiqQAEWvspt4G2uPQ}" \
TOCSIN_MAINNET_CONSENSUS_RPC="${TOCSIN_MAINNET_CONSENSUS_RPC:-https://ethereum-beacon-api.publicnode.com}" \
TOCSIN_MAINNET_EXECUTION_RPC="${TOCSIN_MAINNET_EXECUTION_RPC:-https://0xrpc.io/eth}" \
node -e '
const fs = require("fs");
const keys = ["SEPOLIA_RPC_URL", "BROWSER_EXTENSION_PUBLIC_KEY", "REACT_APP_PIMLICO_API_KEY",
  "TOCSIN_RPC_URL", "TOCSIN_LIST_NAME", "TOCSIN_LIST_RECORD", "TOCSIN_LOG_FROM_BLOCK",
  "TOCSIN_TRANSPORT", "TOCSIN_TOR_GATEWAYS", "TOCSIN_MAINNET_CONSENSUS_RPC", "TOCSIN_MAINNET_EXECUTION_RPC"];
let env = fs.readFileSync(process.env.DIR + "/.env-sample", "utf8");
for (const k of keys) {
  const line = new RegExp("^" + k + "=.*$", "m");
  if (!line.test(env)) throw new Error(k + " is missing from .env-sample");
  env = env.replace(line, () => k + "=\"" + process.env[k] + "\"");
}
fs.writeFileSync(process.env.DIR + "/.env", env);
'

echo
echo "Done. Kohaku with Tocsin is in $DIR."
echo "Build:  cd \"$DIR\" && YARN_IGNORE_PATH=1 npx yarn@1.22.22 web:webkit   (watching dev build to build/webkit-dev)"
echo "Load:   chrome://extensions, Developer mode, Load unpacked, pick $DIR/build/webkit-dev"
