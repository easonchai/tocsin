#!/usr/bin/env bash
# Start every server the Kohaku demo needs, wait for each to be ready, print what to load in Chrome.
# Ctrl-C stops them all. Logs go to $LOG_DIR (default /tmp/tocsin-demo).
# Usage: dapp/packages/kohaku/demo.sh [clone dir]   (default: ./kohaku-extension)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DAPP="$(cd "$HERE/../.." && pwd)"
DIR="${1:-$HERE/kohaku-extension}"
LOG_DIR="${LOG_DIR:-/tmp/tocsin-demo}"
BUILD="$DIR/build/webkit-prod"
mkdir -p "$LOG_DIR" && rm -f "$LOG_DIR"/*.log

for cmd in tor-js-gateway python3 curl node; do
  command -v "$cmd" >/dev/null || { echo "$cmd is not on PATH" >&2; exit 1; }
done
[[ -d "$BUILD" ]] || { echo "No production build at $BUILD. Run setup.sh, then: YARN_IGNORE_PATH=1 npx yarn@1.22.22 build:web:webkit" >&2; exit 1; }
# The lying proxy runs from the dapp workspace, which a fresh clone or worktree has not installed yet.
[[ -d "$DAPP/node_modules" ]] || { echo "Installing dapp workspace (first run)"; (cd "$DAPP" && yarn install); }

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
# 1. Tor gateway. The build pins its host:port:peerId; a different peerId needs TOCSIN_TOR_GATEWAYS in .env and a rebuild.
if lsof -nP -iUDP:12298 >/dev/null 2>&1; then
  echo "  reusing: tor gateway already on UDP 12298 (its log is in the terminal that started it; not stopped on exit)"
else
  echo "Starting tor-js-gateway"
  tor-js-gateway >"$LOG_DIR/gateway.log" 2>&1 & pids+=($!)
  wait_for "tor gateway (TorClient bootstrapped)" 120 grep -q "TorClient bootstrapped" "$LOG_DIR/gateway.log"
fi

# 2. Static site with CORS. The list records point at http://localhost:8000/lists/*.json; without the CORS header the extension's fetch is blocked.
if curl -sfI http://127.0.0.1:8000/ >/dev/null 2>&1; then
  echo "  reusing: something already serves 127.0.0.1:8000"
else
  echo "Starting static site on 127.0.0.1:8000"
  python3 -c 'import http.server as h, functools as f, sys
class H(h.SimpleHTTPRequestHandler):
    def end_headers(s): s.send_header("Access-Control-Allow-Origin", "*"); super().end_headers()
h.ThreadingHTTPServer(("127.0.0.1", 8000), f.partial(H, directory=sys.argv[1])).serve_forever()' \
    "$DAPP/../site" >"$LOG_DIR/site.log" 2>&1 & pids+=($!)
  wait_for "static site" 10 curl -sfI http://127.0.0.1:8000/
fi

# 3. Lying proxy for beat 2. Forwards to RPC_URL and drops the drainer flag.
if proxy_up >/dev/null 2>&1; then
  echo "  reusing: lying proxy already on 127.0.0.1:8550"
else
  echo "Starting lying proxy on 127.0.0.1:8550"
  (cd "$DAPP" && RPC_URL="${RPC_URL:-https://0xrpc.io/sep}" CHAIN_ID="${CHAIN_ID:-11155111}" \
    yarn workspace @tocsin/infra lying-proxy) >"$LOG_DIR/proxy.log" 2>&1 & pids+=($!)
  wait_for "lying proxy" 60 proxy_up
fi

cat <<EOF

All up. Logs in $LOG_DIR. Ctrl-C stops everything.

Chrome: chrome://extensions, Developer mode, Load unpacked, pick
  $BUILD
Onboard with a view-only import of any funded Sepolia address.
Gateway log shows "peer connection state changed: connected" once the Anon-RPC worker boots.

Beats:
  1. Send, paste 0x79fDaE13B1A677E5b8Ac9f5411F6664788A17537. Blocked, Send disabled.
  2. Settings, Tocsin, RPC URL http://127.0.0.1:8550, Save and sync. "chain mismatch at sequence 1", Unverifiable.
  3. RPC URL back to https://0xrpc.io/sep, Save and sync, paste again. Blocked.
If the first sync fails with "request to 0xrpc.io failed", press Sync now again.

Streaming the logs below. Watch for "peer connection state changed: connected" and "CONNECT: tunnel to" (Anon-RPC path live).
EOF
tail -n 20 -F "$LOG_DIR"/*.log
