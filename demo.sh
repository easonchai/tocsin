#!/usr/bin/env bash
# One command for the demo: checks prereqs, sets up and builds Kohaku and the Snap if missing, then starts
# the Tor gateway, the static site, the lying proxy and the Snap server. Ctrl-C stops what it started.
# Every value is public; override any TOCSIN_* from the shell. See RUNBOOK.md.
# Usage: ./demo.sh [kohaku clone dir]   (default: dapp/packages/kohaku/kohaku-extension, gitignored)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DAPP="$ROOT/dapp"
KOHAKU="$DAPP/packages/kohaku"
DIR="${1:-$KOHAKU/kohaku-extension}"
LOG_DIR="${LOG_DIR:-/tmp/tocsin-demo}"
BUILD="$DIR/build/webkit-prod"
SNAP_DIST="$DAPP/packages/snap/dist"
mkdir -p "$LOG_DIR" && rm -f "$LOG_DIR"/*.log

# --- Prereqs -------------------------------------------------------------------------------------------
# Kohaku's engines want Node 22.12 up to 22.x. With mise on PATH, rerun under that Node; otherwise say how.
if [[ ! "$(node -v 2>/dev/null || true)" =~ ^v22\.(1[2-9]|[2-9][0-9])\. ]]; then
  if command -v mise >/dev/null && [[ -z "${TOCSIN_DEMO_REEXEC:-}" ]]; then
    exec env TOCSIN_DEMO_REEXEC=1 mise exec node@22.12.0 -- bash "$0" "$@"
  fi
  echo "Needs Node 22.12 or a later 22.x, found $(node -v 2>/dev/null || echo none)." >&2
  echo "  mise: mise exec node@22.12.0 -- $0    nvm: nvm install 22.12.0 && nvm use 22.12.0" >&2
  exit 1
fi
for cmd in git python3 curl openssl; do
  command -v "$cmd" >/dev/null || { echo "$cmd is not on PATH" >&2; exit 1; }
done
export TOCSIN_TRANSPORT="${TOCSIN_TRANSPORT:-tor}"
if [[ "$TOCSIN_TRANSPORT" == tor ]] && ! command -v tor-js-gateway >/dev/null; then
  cat >&2 <<'EOF'
tor-js-gateway is not on PATH. Tocsin's reads leave Kohaku over Tor through this local gateway.
Build it once (Rust 1.91+, OpenSSL, SQLite; about 6 minutes):
  git clone --depth 1 https://github.com/ethereum/tor-js && cd tor-js
  cargo build --release -p tor-js-gateway && cp target/release/tor-js-gateway ~/.cargo/bin/
Or skip Tor, which the wallet then reports as "not anonymised":
  TOCSIN_TRANSPORT=direct ./demo.sh
EOF
  exit 1
fi

# --- Defaults, shared by Kohaku (setup.sh) and the Snap build ----------------------------------------------
hex() { tr -d '[:space:]' < "$DAPP/$1"; }
export TOCSIN_RPC_URL="${TOCSIN_RPC_URL:-https://0xrpc.io/sep}"
export TOCSIN_LIST_NAME="${TOCSIN_LIST_NAME:-tocsin.eth,harborwatch.eth,lanterndao.eth}"
export TOCSIN_LIST_RECORD="${TOCSIN_LIST_RECORD-$(hex list-record.hex)}"
export TOCSIN_LIST_RECORDS="${TOCSIN_LIST_RECORDS-harborwatch.eth=$(hex list-record.harborwatch.hex),lanterndao.eth=$(hex list-record.lanterndao.hex)}"
export TOCSIN_LOG_FROM_BLOCK="${TOCSIN_LOG_FROM_BLOCK:-12074077}"
# The certhash comes from this machine's gateway key, so the build must carry this machine's value.
# `init` prints it without rotating an existing key.
if [[ "$TOCSIN_TRANSPORT" == tor && -z "${TOCSIN_TOR_GATEWAYS:-}" ]]; then
  certhash="$(tor-js-gateway -c "$LOG_DIR/gateway-init.json5" init 2>&1 | sed -n 's/^Certhash: *//p')"
  [[ -n "$certhash" ]] || { echo "tor-js-gateway init printed no certhash" >&2; exit 1; }
  export TOCSIN_TOR_GATEWAYS="127.0.0.1:12298:$certhash"
fi

# A yarn 1 on npx hands off to dapp/.yarn/releases, so no global yarn is needed.
dapp_yarn() { (cd "$DAPP" && npx --yes yarn@1.22.22 "$@"); }
kohaku_yarn() { (cd "$DIR" && YARN_IGNORE_PATH=1 npx --yes yarn@1.22.22 "$@"); }

# --- Build what is missing ---------------------------------------------------------------------------------
[[ -f "$DIR/.env" ]] || { echo "Setting up Kohaku in $DIR (about 4 minutes)"; "$KOHAKU/setup.sh" "$DIR"; }
if [[ "$TOCSIN_TRANSPORT" == tor ]] && ! grep -q "^TOCSIN_TOR_GATEWAYS=\"$TOCSIN_TOR_GATEWAYS\"" "$DIR/.env"; then
  echo "Kohaku's .env names another gateway; pointing it at this machine's and rebuilding"
  perl -pi -e "s|^TOCSIN_TOR_GATEWAYS=.*|TOCSIN_TOR_GATEWAYS=\"$TOCSIN_TOR_GATEWAYS\"|" "$DIR/.env"
  rm -r "$BUILD" 2>/dev/null || true
fi
[[ -d "$BUILD" ]] || { echo "Building Kohaku production bundle (a few minutes)"; kohaku_yarn build:web:webkit; }
[[ -d "$DAPP/node_modules" ]] || { echo "Installing dapp workspace"; dapp_yarn install; }
[[ -d "$SNAP_DIST" ]] || { echo "Building the Snap"; dapp_yarn workspace @tocsin/snap build; }

# --- Servers -----------------------------------------------------------------------------------------------
pids=()
cleanup() { trap - EXIT INT TERM; echo; echo "Stopping."; kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

wait_for() { # wait_for <label> <seconds> <command...>
  local label="$1" secs="$2"; shift 2
  for ((i = 0; i < secs; i++)); do "$@" >/dev/null 2>&1 && { echo "  ready: $label"; return; }; sleep 1; done
  echo "  $label did not come up in ${secs}s, see $LOG_DIR" >&2; exit 1
}
proxy_up() { curl -sf -X POST http://127.0.0.1:8550 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'; }

# A server someone already started in another terminal is reused, not restarted.
# 1. Tor gateway. Ready at "TorClient bootstrapped", about 10 s warm, longer on a first run.
if [[ "$TOCSIN_TRANSPORT" != tor ]]; then
  echo "  skipping: tor gateway (TOCSIN_TRANSPORT=$TOCSIN_TRANSPORT)"
elif lsof -nP -iUDP:12298 >/dev/null 2>&1; then
  echo "  reusing: tor gateway already on UDP 12298 (not stopped on exit)"
else
  echo "Starting tor-js-gateway"
  tor-js-gateway >"$LOG_DIR/gateway.log" 2>&1 & pids+=($!)
  wait_for "tor gateway (TorClient bootstrapped)" 180 grep -q "TorClient bootstrapped" "$LOG_DIR/gateway.log"
fi

# 2. Static site with CORS. The list records point at http://localhost:8000/lists/*.json; without the CORS header the fetch is blocked.
if curl -sfI http://127.0.0.1:8000/ >/dev/null 2>&1; then
  echo "  reusing: something already serves 127.0.0.1:8000"
else
  echo "Starting static site on 127.0.0.1:8000"
  python3 -c 'import http.server as h, functools as f, sys
class H(h.SimpleHTTPRequestHandler):
    def end_headers(s): s.send_header("Access-Control-Allow-Origin", "*"); super().end_headers()
h.ThreadingHTTPServer(("127.0.0.1", 8000), f.partial(H, directory=sys.argv[1])).serve_forever()' \
    "$ROOT/site" >"$LOG_DIR/site.log" 2>&1 & pids+=($!)
  wait_for "static site" 10 curl -sfI http://127.0.0.1:8000/
fi

# 3. Lying proxy for beat 2. Forwards to RPC_URL and drops the drainer flag.
if proxy_up >/dev/null 2>&1; then
  echo "  reusing: lying proxy already on 127.0.0.1:8550"
else
  echo "Starting lying proxy on 127.0.0.1:8550"
  RPC_URL="${RPC_URL:-$TOCSIN_RPC_URL}" CHAIN_ID="${CHAIN_ID:-11155111}" \
    dapp_yarn workspace @tocsin/infra lying-proxy >"$LOG_DIR/proxy.log" 2>&1 & pids+=($!)
  wait_for "lying proxy" 60 proxy_up
fi

# 4. Snap server. Flask installs local:http://localhost:8080 from here.
if curl -sf http://localhost:8080/snap.manifest.json >/dev/null 2>&1; then
  echo "  reusing: snap server already on localhost:8080"
else
  echo "Starting snap server on localhost:8080"
  dapp_yarn workspace @tocsin/snap serve >"$LOG_DIR/snap.log" 2>&1 & pids+=($!)
  wait_for "snap server" 60 curl -sf http://localhost:8080/snap.manifest.json
fi

cat <<EOF

All up. Logs in $LOG_DIR. Ctrl-C stops everything this script started.

Kohaku: chrome://extensions, Developer mode, Load unpacked, pick
  $BUILD
Snap:   in MetaMask Flask, on any page's DevTools console:
  await ethereum.request({ method: "wallet_requestSnaps", params: { "local:http://localhost:8080": {} } })

The beats are in RUNBOOK.md. If the first Tor sync fails with "request to 0xrpc.io failed", press Sync now again.
EOF
tail -n 20 -F "$LOG_DIR"/*.log
