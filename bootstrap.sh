#!/usr/bin/env bash
# Your own writers and lists on the shared Sepolia log. Generates the keys, waits for one address to be
# funded, appends the flags, signs the three list documents, and writes the values demo.sh picks up.
# Re-running skips what is done. Delete .tocsin-demo/ and site/local/ to start over. See docs/agents/bootstrap.md.
# Usage: ./bootstrap.sh    then ./demo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DAPP="$ROOT/dapp"
OUT="$ROOT/.tocsin-demo"
LOCAL="$ROOT/site/local"
KEYS="$OUT/keys.env"
mkdir -p "$OUT" "$LOCAL/lists" "$LOCAL/mirror"

# The shared deployment. Every value is public; override any from the shell.
export RPC_URL="${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
export CHAIN_ID="${CHAIN_ID:-11155111}"
export LOG_ADDRESS="${LOG_ADDRESS:-0xB639d15A0E7aE24E4C32E851Fbe0E57585565b14}"
export MANIFEST_DIR="$OUT"
FAKE_USDC="${FAKE_USDC:-0x2Ba2B2F4bd18D04C3bA92DB9F73a49d19c87b4B8}"
SITE="http://localhost:8000/local"
ASK=0.12     # ETH the relayer must receive: about 0.05 for the manual writer, the rest for its own gas
FORWARD=0.05

[[ "$(node -v 2>/dev/null | cut -c2-3)" -ge 20 ]] 2>/dev/null || { echo "Needs Node 20 or later, found $(node -v 2>/dev/null || echo none)." >&2; exit 1; }
dapp_yarn() { (cd "$DAPP" && npx --yes yarn@1.22.22 "$@"); }
infra() { dapp_yarn workspace @tocsin/infra "$@"; }
reader() { dapp_yarn workspace @tocsin/reader "$@"; }
wallet() { infra wallet "$@"; }
below() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a + 0 < b + 0) }'; }
[[ -d "$DAPP/node_modules" ]] || { echo "Installing dapp workspace"; dapp_yarn install; }

# --- 1. Keys. Eight roles; only the relayer and the manual writer ever hold ETH. ---------------------------
ROLES=(MANUAL_WRITER DETECTOR RELAYER MAINTAINER HARBOR_WRITER LANTERN_WRITER HARBOR_MAINTAINER LANTERN_MAINTAINER)
if [[ ! -f "$KEYS" ]]; then
  echo "Generating $KEYS (testnet keys, gitignored)"
  { for r in "${ROLES[@]}"; do key="$(wallet new)"; echo "${r}_PRIVATE_KEY=$key"; echo "${r}_ADDRESS=$(wallet address "$key")"; done; } >"$KEYS.tmp"
  chmod 600 "$KEYS.tmp" && mv "$KEYS.tmp" "$KEYS"
fi
set -a; source "$KEYS"; set +a
[[ -f "$OUT/start-block" ]] || wallet block >"$OUT/start-block"
FROM_BLOCK="$(cat "$OUT/start-block")"

# --- 2. Funding. One address to fund by hand; the script forwards to the manual writer. -------------------
SEED="$OUT/seed-manifest.$CHAIN_ID.json"
if [[ ! -f "$SEED" ]]; then
  if below "$(wallet balance "$RELAYER_ADDRESS")" 0.1 && below "$(wallet balance "$MANUAL_WRITER_ADDRESS")" 0.04; then
    cat <<EOF

Send $ASK Sepolia ETH to the relayer:

  $RELAYER_ADDRESS

Faucets: https://cloud.google.com/application/web3/faucet/ethereum/sepolia  or  https://sepolia-faucet.pk910.de
Waiting (checks every 15 s, up to 30 min; run again later if it times out).
EOF
    for ((i = 0; i < 120; i++)); do
      below "$(wallet balance "$RELAYER_ADDRESS")" "$ASK" || break
      sleep 15
    done
    below "$(wallet balance "$RELAYER_ADDRESS")" "$ASK" && { echo "Not funded yet. Run ./bootstrap.sh again once it is." >&2; exit 1; }
    echo "Funded."
  fi
  if below "$(wallet balance "$MANUAL_WRITER_ADDRESS")" 0.04; then
    echo "Forwarding $FORWARD ETH to the manual writer"
    wallet send "$RELAYER_PRIVATE_KEY" "$MANUAL_WRITER_ADDRESS" "$FORWARD"
  fi
fi

# --- 3. Flags on the shared log. Each step leaves a manifest, so a rerun skips it. ------------------------
[[ -f "$SEED" ]] || { echo "Seeding tocsin.eth writers (3 transactions)"; printf 'SEED\n' | infra seed; }
[[ -f "$OUT/curators-manifest.$CHAIN_ID.json" ]] || { echo "Seeding curator writers (2 transactions)"; printf 'SEED\n' | infra seed-curators; }
[[ -f "$OUT/tokens-manifest.$CHAIN_ID.json" ]] || { echo "Flagging fakeUSDC (1 transaction)"; printf 'SEED\n' | FAKE_USDC="$FAKE_USDC" infra seed-tokens; }

# --- 4. List documents, mirror, signed records. Cheap and deterministic, so always redone. ------------------
# fill <template> <out> <maintainer> <writer> <detector> <name>
fill() {
  TOCSIN_MAINTAINER="$3" TOCSIN_MANUAL_WRITER="$4" TOCSIN_DETECTOR_WRITER="$5" TOCSIN_OPERATOR_NAME="$6" TOCSIN_SITE_BASE_URL="$SITE" \
    reader publish-list fill "$ROOT/site/lists/$1" "$LOCAL/lists/$2"
}
fill default.template.json default.json "$MAINTAINER_ADDRESS" "$MANUAL_WRITER_ADDRESS" "$DETECTOR_ADDRESS" tocsin.eth
fill curator.template.json harborwatch.json "$HARBOR_MAINTAINER_ADDRESS" "$HARBOR_WRITER_ADDRESS" "$HARBOR_WRITER_ADDRESS" harborwatch.eth
fill curator.template.json lanterndao.json "$LANTERN_MAINTAINER_ADDRESS" "$LANTERN_WRITER_ADDRESS" "$LANTERN_WRITER_ADDRESS" lanterndao.eth
# A load-balanced public RPC can report a head that the node serving eth_getLogs has not reached yet. Retry that one error.
for try in 1 2 3; do
  if out="$(LOG_FROM_BLOCK="$FROM_BLOCK" MIRROR_DIR="$LOCAL/mirror" infra mirror "$MANUAL_WRITER_ADDRESS" "$DETECTOR_ADDRESS" "$HARBOR_WRITER_ADDRESS" "$LANTERN_WRITER_ADDRESS" 2>&1)"; then
    echo "$out"; break
  fi
  [[ "$out" == *"beyond current head"* && $try -lt 3 ]] || { echo "$out" >&2; exit 1; }
  echo "RPC node is behind the head it reported; retrying the mirror in 5 s"; sleep 5
done
sign() { MAINTAINER_PRIVATE_KEY="$2" reader publish-list sign "$LOCAL/lists/$1" "$SITE/lists/$1"; }
record="$(sign default.json "$MAINTAINER_PRIVATE_KEY")"
harbor="$(sign harborwatch.json "$HARBOR_MAINTAINER_PRIVATE_KEY")"
lantern="$(sign lanterndao.json "$LANTERN_MAINTAINER_PRIVATE_KEY")"

# --- 5. What demo.sh sources. -----------------------------------------------------------------------------
cat >"$OUT/demo.env" <<EOF
# Written by bootstrap.sh. demo.sh sources this before its defaults; source it yourself for the CLI beats (yarn workspace @tocsin/infra eval).
export TOCSIN_LIST_NAME=tocsin.eth,harborwatch.eth,lanterndao.eth
export TOCSIN_LIST_RECORD=$record
export TOCSIN_LIST_NAME=tocsin.eth,harborwatch.eth,lanterndao.eth
export TOCSIN_LIST_RECORDS=harborwatch.eth=$harbor,lanterndao.eth=$lantern
export TOCSIN_LOG_FROM_BLOCK=$FROM_BLOCK
export PROXY_DROP_WRITER=$MANUAL_WRITER_ADDRESS PROXY_DROP_SEQ=1
export RPC_URL=$RPC_URL CHAIN_ID=$CHAIN_ID LOG_ADDRESS=$LOG_ADDRESS
export LIST_RECORD=$record LIST_DOCUMENT=$LOCAL/lists/default.json LOG_FROM_BLOCK=$FROM_BLOCK
EOF
cat <<EOF

Done. Your lists are signed and your flags are on the log from block $FROM_BLOCK.
  manual writer   $MANUAL_WRITER_ADDRESS   (the lying proxy drops its sequence 1)
  detector        $DETECTOR_ADDRESS
  harborwatch     $HARBOR_WRITER_ADDRESS
  lanterndao      $LANTERN_WRITER_ADDRESS
Next: ./demo.sh    (rebuilds the Snap and Kohaku with these records), then RUNBOOK.md.
EOF
